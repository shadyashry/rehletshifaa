package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.PatientActionView;
import com.rehletshifaa.security.ActorContext;
import com.rehletshifaa.security.ActorRole;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Resolves, for one person looking at one case, what is true now and what they can validly do now.
 *
 * <p>This is a read over the tables that already carry the workflow — case status, work items, patient
 * actions, customer readiness, deposit and proposal state — not a second state machine. It exists so the
 * case page has exactly one source for its current action, its blockers and its available actions, instead
 * of every component deriving its own answer from the stage. Nothing here is cached: a stale answer would
 * change what a coordinator does next.
 *
 * <p>Precedence: ownership, then a pending assignment, then work assigned to me that is not waiting on the
 * patient, then an open patient action, then patient-owed readiness steps, then the remaining staff work,
 * then the stage. A completed or superseded work item never drives the answer — obsolete items are closed
 * here as a repair, and the transitions that make them obsolete close them at source.
 *
 * <p>Every action endpoint still validates independently; {@link #assertOperationsAssignable} is the one
 * policy both the resolver and the assignment endpoint share, so the page can never offer what the backend
 * would refuse.
 */
@Service
public class CaseActionService {
    /** Stages where the customer's readiness (profile, contact, consents, identity, deposit) is live. */
    private static final Set<String> READINESS_STAGES = Set.of("ACCEPTED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED");
    /** Staff work that exists to move the deposit or coordination forward, so it waits behind the patient's readiness. */
    private static final Set<String> READINESS_GATED_WORK = Set.of("DEPOSIT_ARRANGEMENT", "TRAVEL");
    /** Stages in which "prepare the proposal" is still real work; anywhere else the item is obsolete. */
    private static final Set<String> PROPOSAL_WORK_STAGES = Set.of("CLINICAL_RECOMMENDATION_READY", "REVISION_REQUESTED", "EXPIRED");
    private static final Set<String> TERMINAL = Set.of("DRAFT", "CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE", "EXPIRED");
    private static final Set<String> CONSULTANT_ASSIGNABLE = Set.of("INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT");
    private static final Set<String> TRAVEL_PACKAGE_LOCKED = Set.of("PATIENT_DECISION", "ACCEPTED", "DECLINED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED");
    /** Readiness steps the onboarding link completes in one go; shown as a single "activate your profile" blocker. */
    private static final Set<String> PROFILE_CODES = Set.of("ACCOUNT_NOT_ACTIVATED", "CONSENTS_INCOMPLETE", "ONBOARDING_INCOMPLETE", "REPRESENTATIVE_AUTH_MISSING");

    private final JdbcClient jdbc;
    private final CustomerReadinessService readiness;
    private final PaymentService payment;
    private final StaffWorkService work;
    private final PatientActionService patientActions;
    private final Clock clock;

    public CaseActionService(JdbcClient jdbc, CustomerReadinessService readiness, PaymentService payment,
                             StaffWorkService work, PatientActionService patientActions, Clock clock) {
        this.jdbc = jdbc; this.readiness = readiness; this.payment = payment; this.work = work;
        this.patientActions = patientActions; this.clock = clock;
    }

    // ---------------- the contract the page renders ----------------

    @Transactional
    public CaseActionsView resolve(UUID caseId, ActorContext.Actor actor) {
        Facts f = facts(caseId);
        closeObsoleteWork(caseId, f.status());
        PatientActionView patientAction = patientActions.openAction(caseId);
        List<BlockerView> blockers = READINESS_STAGES.contains(f.status()) ? readinessBlockers(caseId) : List.of();
        boolean patientBlocked = blockers.stream().anyMatch(CaseActionService::patientGate);
        WorkItem mine = myWork(caseId, actor.subject());
        String waitingOn = reconcileWaitingOn(caseId, f.status(), blockers, patientAction, mine);
        String waitingReason = jdbc.sql("SELECT waiting_reason FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional().orElse(null);

        boolean patient = actor.has(ActorRole.PATIENT) || actor.has(ActorRole.PATIENT_REPRESENTATIVE);
        if (patient) return new CaseActionsView(f.status(), waitingOn, waitingReason, none(), List.of(), List.of());

        boolean coordinator = actor.has(ActorRole.COORDINATOR) || actor.has(ActorRole.COORDINATOR_LEAD);
        boolean owned = coordinator && actor.subject().equals(f.coordinatorSubject());
        CurrentActionView current = currentAction(caseId, f, actor, coordinator, owned, mine, patientAction, blockers, patientBlocked);
        List<String> available = coordinator && owned ? availableActions(caseId, f, patientAction, blockers) : List.of();
        return new CaseActionsView(f.status(), waitingOn, waitingReason, current, blockers, available);
    }

    private CurrentActionView currentAction(UUID caseId, Facts f, ActorContext.Actor actor, boolean coordinator, boolean owned,
                                            WorkItem mine, PatientActionView patientAction, List<BlockerView> blockers, boolean patientBlocked) {
        if (coordinator && !owned)
            return "RECEIVED".equals(f.status()) && f.coordinatorSubject() == null ? simple("CLAIM_CASE", "CLAIM") : simple("VIEW_ONLY", "NONE");
        if (!coordinator && pendingAssignment(caseId, actor)) return simple("ACCEPT_ASSIGNMENT", "ACCEPT");
        // Work that is mine and not itself waiting on the patient is what the workflow is waiting for.
        if (mine != null && !(READINESS_GATED_WORK.contains(mine.type()) && patientBlocked)) return workItem(mine);
        if (patientAction != null) return simple("WAIT_PATIENT_INFORMATION", "WAIT");
        if (patientBlocked) {
            BlockerView first = blockers.stream().filter(CaseActionService::patientGate).findFirst().orElseThrow();
            return new CurrentActionView("WAIT_PATIENT_READINESS", "WAIT", null, null, null, null, null, null, false, first.code());
        }
        if (mine != null) return workItem(mine);
        return stageFallback(caseId, f, actor, coordinator);
    }

    /** Only reached when nothing is assigned: describe the stage honestly, including "nothing to do yet". */
    private CurrentActionView stageFallback(UUID caseId, Facts f, ActorContext.Actor actor, boolean coordinator) {
        String s = f.status();
        if (coordinator) {
            if (CONSULTANT_ASSIGNABLE.contains(s)) return simple("ASSIGN_CONSULTANT", "FOCUS");
            if (Set.of("CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW").contains(s)) return simple("WAIT_CONSULTANT", "WAIT");
            if (PROPOSAL_WORK_STAGES.contains(s)) return simple("PREPARE_PROPOSAL", "FOCUS");
            if (Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL").contains(s)) return internalApprovalStep(caseId, f);
            if ("PATIENT_DECISION".equals(s)) return simple("WAIT_PATIENT_DECISION", "WAIT");
            if ("ACCEPTED".equals(s)) return payment.depositSatisfied(caseId) ? none() : simple("WAIT_PAYMENT", "WAIT");
            if ("TRAVEL_COORDINATION".equals(s)) {
                if (hasAssignment(caseId, "OPERATIONS")) return simple("WAIT_OPERATIONS", "WAIT");
                return operationsAssignable(caseId) ? simple("ASSIGN_OPERATIONS", "FOCUS") : none();
            }
            return none();
        }
        if (actor.has(ActorRole.DOCTOR) && "CONSULTANT_REVIEW".equals(s)) return simple("RECORD_CLINICAL_DECISION", "FOCUS");
        if (actor.has(ActorRole.OPERATIONS) && Set.of("ACCEPTED", "TRAVEL_COORDINATION").contains(s)) return simple("UPDATE_TRAVEL_PLAN", "FOCUS");
        if (actor.has(ActorRole.FINANCE) && "PROPOSAL_PREPARATION".equals(s)) return simple("APPROVE_COMMERCIAL_TERMS", "FOCUS");
        return none();
    }

    /**
     * Before release the proposal may need internal sign-off: Operations for a travel package, Finance for
     * manually priced services. Whoever is still missing is the coordinator's next step; once everybody is
     * assigned the ball is theirs, and once the gates are clear the step is the release itself.
     */
    private CurrentActionView internalApprovalStep(UUID caseId, Facts f) {
        Proposal p = latestProposal(caseId);
        if (p == null) return simple("PREPARE_PROPOSAL", "FOCUS");
        boolean opsNeeded = f.travelPackage() && !p.finalQuote() && !p.operationsDone();
        boolean finNeeded = p.requiresFinance() && !p.financeDone();
        if (opsNeeded && !hasAssignment(caseId, "OPERATIONS")) return simple("ASSIGN_OPERATIONS", "FOCUS");
        if (finNeeded && !hasAssignment(caseId, "FINANCE")) return simple("ASSIGN_FINANCE", "FOCUS");
        if (opsNeeded || finNeeded) return simple("WAIT_INTERNAL_APPROVAL", "WAIT");
        return simple("RELEASE_PROPOSAL", "FOCUS");
    }

    /**
     * Optional, state-valid operations for the owning coordinator. Utilities and exceptions only — the
     * next workflow step is the current action, never an entry here.
     */
    private List<String> availableActions(UUID caseId, Facts f, PatientActionView patientAction, List<BlockerView> blockers) {
        List<String> actions = new ArrayList<>();
        String s = f.status();
        if (patientAction != null) {
            if (patientAction.items().stream().anyMatch(i -> !i.completed())) actions.add("RECORD_PATIENT_RESPONSE");
        } else if (!TERMINAL.contains(s)) actions.add("REQUEST_INFORMATION");
        Proposal p = latestProposal(caseId);
        if (p != null && Set.of("RELEASED", "VIEWED").contains(p.status())) actions.add("RESEND_PROPOSAL_LINK");
        if (blockers.stream().anyMatch(b -> "PROFILE_NOT_ACTIVATED".equals(b.code()))) actions.add("RESEND_ONBOARDING_LINK");
        if (CONSULTANT_ASSIGNABLE.contains(s)) actions.add("ASSIGN_CONSULTANT");
        if (operationsAssignable(caseId)) actions.add("ASSIGN_OPERATIONS");
        if ("PROPOSAL_PREPARATION".equals(s) && p != null && p.requiresFinance() && !p.financeDone()) actions.add("ASSIGN_FINANCE");
        if ("INFORMATION_REQUIRED".equals(s)) actions.add("MOVE_TO_INTAKE_REVIEW");
        if (!TRAVEL_PACKAGE_LOCKED.contains(s)) actions.add("SET_TRAVEL_PACKAGE");
        if (CONSULTANT_ASSIGNABLE.contains(s)) actions.add("CANCEL_CASE");
        return actions;
    }

    // ---------------- shared policy ----------------

    /**
     * Operations is assigned to arrange travel and arrival. Before the proposal is released it may be
     * pulled in for the travel-package plan (gated by the proposal itself); after acceptance it is only
     * valid once the coordination deposit is settled — the case is then in TRAVEL_COORDINATION — and the
     * patient has finished the profile steps only they can complete. Cases that predate the onboarding
     * layer keep the deposit-only gate, exactly like {@link CustomerReadinessService#assertReadyForCommitment}.
     */
    public void assertOperationsAssignable(UUID caseId) {
        Facts f = facts(caseId);
        String status = f.status();
        if ("PROPOSAL_PREPARATION".equals(status)) {
            if (f.travelPackage()) return;
            throw new ApiException(409, "CASE_NOT_READY_FOR_ASSIGNMENT", "Operations is only needed before release when a travel package was requested");
        }
        if (!"TRAVEL_COORDINATION".equals(status))
            throw new ApiException(409, "CASE_NOT_READY_FOR_ASSIGNMENT", "Operations is assigned once the coordination deposit is settled and treatment coordination starts");
        List<String> outstanding = readinessBlockers(caseId).stream().filter(CaseActionService::patientGate).map(BlockerView::labelEn).toList();
        if (!outstanding.isEmpty())
            throw new ApiException(409, "COORDINATION_NOT_READY", "The patient has not completed the steps needed before coordination starts: " + String.join("; ", outstanding));
    }

    public boolean operationsAssignable(UUID caseId) {
        try { assertOperationsAssignable(caseId); return true; } catch (ApiException e) { return false; }
    }

    /**
     * Customer-readiness steps as the coordinator should see them: who owes each one, with the profile
     * steps the onboarding link completes together collapsed into one. The deposit is staff-arranged
     * (offline model) and is queued behind anything the patient still has to do.
     */
    public List<BlockerView> readinessBlockers(UUID caseId) {
        Integer records = jdbc.sql("SELECT count(*) FROM patient_onboardings WHERE case_id=?").param(caseId).query(Integer.class).single();
        if (records == null || records == 0) return List.of(); // predates the onboarding layer: deposit-only gate applies
        CustomerReadiness r = readiness.compute(caseId);
        List<BlockerView> out = new ArrayList<>();
        boolean profile = r.blockingItems().stream().anyMatch(b -> "ACCOUNT_NOT_ACTIVATED".equals(b.code()));
        if (profile) out.add(new BlockerView("PROFILE_NOT_ACTIVATED", "Profile activation", "تفعيل الملف", "PATIENT", true));
        for (BlockingItem b : r.blockingItems()) {
            switch (b.code()) {
                case "DEPOSIT_UNPAID" -> {}
                case "CONTACT_NOT_VERIFIED" -> out.add(new BlockerView(b.code(), "Contact channel verification", "تأكيد وسيلة التواصل", "PATIENT", true));
                case "IDENTITY_NOT_VERIFIED" -> out.add(identityUnderReview(caseId)
                        ? new BlockerView(b.code(), "Identity review", "مراجعة الهوية", "STAFF", false)
                        : new BlockerView(b.code(), "Identity verification", "التحقق من الهوية", "PATIENT", false));
                default -> { if (!profile || !PROFILE_CODES.contains(b.code())) out.add(new BlockerView(b.code(), b.labelEn(), b.labelAr(), "PATIENT", true)); }
            }
        }
        boolean patientOwed = out.stream().anyMatch(CaseActionService::patientGate);
        if (r.depositRequired() && !r.depositSatisfied())
            out.add(new BlockerView("DEPOSIT_UNPAID", "Coordination deposit", "وديعة التنسيق", patientOwed ? "LATER" : "STAFF", true));
        return out;
    }

    /**
     * Who has the ball, re-derived from what is outstanding right now. Also called by the transitions
     * that change readiness (acknowledgement, profile activation) so the queue is right before anybody
     * opens the case.
     */
    @Transactional
    public String reconcileWaitingOn(UUID caseId) {
        Facts f = facts(caseId);
        List<BlockerView> blockers = READINESS_STAGES.contains(f.status()) ? readinessBlockers(caseId) : List.of();
        return reconcileWaitingOn(caseId, f.status(), blockers, patientActions.openAction(caseId), null);
    }

    private String reconcileWaitingOn(UUID caseId, String status, List<BlockerView> blockers, PatientActionView patientAction, WorkItem mine) {
        Optional<BlockerView> patientStep = blockers.stream().filter(CaseActionService::patientGate).findFirst();
        String fallback = StaffWorkService.stageDefault(status);
        // Open coordinator work means our team owes the next move, unless the stage says the ball is elsewhere.
        if (Set.of("STAFF", "PAYMENT", "TRAVEL_TEAM", "NONE").contains(fallback) && work.hasOpenWork(caseId, "COORDINATOR")) fallback = "STAFF";
        String reason = patientStep.map(b -> "Waiting for the patient: " + b.labelEn().toLowerCase(Locale.ROOT))
                .orElse("PAYMENT".equals(fallback) ? "Waiting for the coordination deposit" : mine != null && "STAFF".equals(fallback) ? mine.title() : null);
        return work.reconcileWaitingOn(caseId, fallback, reason, patientStep.isPresent() || patientAction != null);
    }

    /** Work made obsolete by a stage the case has already left. Idempotent; a no-op on a healthy case. */
    private void closeObsoleteWork(UUID caseId, String status) {
        if (!PROPOSAL_WORK_STAGES.contains(status)) {
            work.closeWorkItems(caseId, "PREPARE_PROPOSAL", "Superseded — the proposal has already been prepared");
            work.closeWorkItems(caseId, "PROPOSAL_REVISION", "Superseded — the proposal has already been revised");
        }
        if (!Set.of("ACCEPTED", "TRAVEL_COORDINATION").contains(status))
            work.closeWorkItems(caseId, "TRAVEL", "Superseded — treatment coordination is already under way");
    }

    // ---------------- reads ----------------

    private record Facts(String status, String coordinatorSubject, boolean travelPackage) {}
    private record WorkItem(UUID id, String type, String title, String context, Instant dueAt, long version) {}
    private record Proposal(String status, boolean requiresFinance, boolean operationsDone, boolean financeDone, boolean finalQuote) {}

    private Facts facts(UUID caseId) {
        String status = status(caseId);
        String coordinator = jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC LIMIT 1")
                .param(caseId).query(String.class).optional().orElse(null);
        boolean travel = Boolean.TRUE.equals(jdbc.sql("SELECT travel_package_requested FROM medical_cases WHERE id=?").param(caseId).query(Boolean.class).optional().orElse(false));
        return new Facts(status, coordinator, travel);
    }

    private String status(UUID caseId) {
        return jdbc.sql("SELECT status FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional()
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    /** The one open item assigned to this person: blocking first, then by priority, then oldest. */
    private WorkItem myWork(UUID caseId, String subject) {
        return jdbc.sql("SELECT id,task_type,title,description,due_at,version FROM case_tasks WHERE case_id=? AND owner_subject=? AND visibility_scope='INTERNAL' AND status IN ('OPEN','IN_PROGRESS') "
                        + "ORDER BY CASE WHEN blocking THEN 0 ELSE 1 END,CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,created_at LIMIT 1")
                .params(caseId, subject).query(this::mapWork).optional().orElse(null);
    }

    private WorkItem mapWork(ResultSet rs, int n) throws SQLException {
        OffsetDateTime due = rs.getObject("due_at", OffsetDateTime.class);
        return new WorkItem(rs.getObject("id", UUID.class), rs.getString("task_type"), work.decryptText(rs.getString("title")),
                work.decryptText(rs.getString("description")), due == null ? null : due.toInstant(), rs.getLong("version"));
    }

    private boolean pendingAssignment(UUID caseId, ActorContext.Actor actor) {
        Integer n = jdbc.sql("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_subject=? AND assignee_role=? AND status='PENDING'")
                .params(caseId, actor.subject(), actor.primaryRole()).query(Integer.class).single();
        return n != null && n > 0;
    }

    private boolean hasAssignment(UUID caseId, String role) {
        Integer n = jdbc.sql("SELECT count(*) FROM case_assignments WHERE case_id=? AND assignee_role=? AND status IN ('PENDING','ACTIVE')")
                .params(caseId, role).query(Integer.class).single();
        return n != null && n > 0;
    }

    private boolean identityUnderReview(UUID caseId) {
        Integer n = jdbc.sql("SELECT count(*) FROM patient_identity_verifications WHERE patient_id=(SELECT patient_id FROM medical_cases WHERE id=?) AND status IN ('PENDING','MANUAL_REVIEW')")
                .param(caseId).query(Integer.class).single();
        return n != null && n > 0;
    }

    private Proposal latestProposal(UUID caseId) {
        return jdbc.sql("SELECT pv.status,pv.requires_finance_approval,pv.operations_completed_at,pv.finance_approved_at,pv.document_type FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=? ORDER BY pv.version_number DESC LIMIT 1")
                .param(caseId).query((rs, n) -> new Proposal(rs.getString("status"), rs.getBoolean("requires_finance_approval"), rs.getObject("operations_completed_at") != null, rs.getObject("finance_approved_at") != null, "FINAL_TREATMENT_QUOTE".equals(rs.getString("document_type")))).optional().orElse(null);
    }

    private CurrentActionView workItem(WorkItem w) {
        boolean overdue = w.dueAt() != null && w.dueAt().isBefore(clock.instant());
        return new CurrentActionView("WORK_ITEM", "COMPLETE".equals(kindFor(w.type())) ? "COMPLETE" : "FOCUS", w.title(), w.context(), w.id(), w.version(), w.type(), w.dueAt(), overdue, null);
    }

    /** Whether finishing the item is acknowledged in place or done through the form that does the real work. */
    private static String kindFor(String type) {
        return switch (type) {
            case "REVIEW_PATIENT_RESPONSE", "PROPOSAL_DECLINED_REVIEW", "CLINICAL_OUTCOME_REVIEW", "DEPOSIT_ARRANGEMENT", "REVIEW", "INFORMATION_REQUEST" -> "COMPLETE";
            default -> "FOCUS";
        };
    }

    /** A step only the patient can complete and that holds the current stage (identity is a later commitment gate). */
    static boolean patientGate(BlockerView b) { return "PATIENT".equals(b.owner()) && b.gating(); }
    private static CurrentActionView simple(String code, String kind) { return new CurrentActionView(code, kind, null, null, null, null, null, null, false, null); }
    private static CurrentActionView none() { return simple("NONE", "NONE"); }
}
