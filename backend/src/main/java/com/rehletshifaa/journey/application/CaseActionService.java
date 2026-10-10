package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.PatientActionView;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.application.CaseActionQueryService.Facts;
import com.rehletshifaa.journey.application.CaseActionQueryService.Proposal;
import com.rehletshifaa.journey.application.CaseActionQueryService.WorkItem;
import com.rehletshifaa.shared.api.ApiException;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.*;
import java.util.function.Supplier;

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
    /**
     * Stages where the case — and the next move — belongs to the consultant. The coordinator keeps the
     * utilities (messages, documents, activity, the travel-package flag) but no workflow command that would
     * take the case back or push it forward; the endpoints refuse those independently.
     */
    public static final Set<String> CONSULTANT_OWNED = Set.of("CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW");
    private static final Set<String> TRAVEL_PACKAGE_LOCKED = Set.of("PATIENT_DECISION", "ACCEPTED", "DECLINED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED");
    /** Readiness steps the onboarding link completes in one go; shown as a single "activate your profile" blocker. */
    private static final Set<String> PROFILE_CODES = Set.of("ACCOUNT_NOT_ACTIVATED", "CONSENTS_INCOMPLETE", "ONBOARDING_INCOMPLETE", "REPRESENTATIVE_AUTH_MISSING");

    private final CaseActionQueryService queries;
    private final CustomerReadinessService readiness;
    private final PaymentService payment;
    private final StaffWorkService work;
    private final PatientActionQueryService patientActions;
    private final ProposalAccessService proposals;
    private final Authority authority;
    private final Clock clock;

    public CaseActionService(CaseActionQueryService queries, CustomerReadinessService readiness, PaymentService payment,
                             StaffWorkService work, PatientActionQueryService patientActions, ProposalAccessService proposals, Authority authority, Clock clock) {
        this.queries = queries; this.readiness = readiness; this.payment = payment; this.work = work;
        this.patientActions = patientActions; this.proposals = proposals; this.authority = authority; this.clock = clock;
    }

    // ---------------- the contract the page renders ----------------

    /**
     * Case facts, assignments and the latest proposal are read once per resolve; nothing this method writes (obsolete
     * work, waiting-on) changes them, so every rule below answers from the same snapshot.
     */
    @Transactional
    public CaseActionsView resolve(UUID caseId, Actor actor) {
        Facts f = queries.facts(caseId);
        Proposal proposal = queries.latestProposal(caseId);
        closeObsoleteWork(caseId, f.status(), proposal);
        PatientActionView patientAction = patientActions.openAction(caseId);
        List<BlockerView> blockers = READINESS_STAGES.contains(f.status()) ? readinessBlockers(caseId) : List.of();
        boolean patientBlocked = blockers.stream().anyMatch(CaseActionService::patientGate);
        WorkItem mine = queries.myWork(caseId, actor.subject());
        String waitingOn = reconcileWaitingOn(caseId, f.status(), blockers, patientAction, mine);
        WaitingReason waitingReason = queries.waitingReason(caseId);

        boolean patient = actor.role() == Role.PATIENT || actor.role() == Role.PATIENT_REPRESENTATIVE;
        // Per case, never per account: one person can be the patient on their own case and a representative on a relative's.
        if (patient) return patientView(caseId, f, waitingOn, waitingReason, patientAction, blockers,
                queries.patientsOwnCase(caseId, actor.subject()) ? "SELF" : "REPRESENTATIVE");

        boolean coordinator = actor.role() == Role.COORDINATOR;
        boolean owned = coordinator && actor.subject().equals(f.coordinatorSubject());
        CurrentActionView current = currentAction(caseId, f, proposal, actor, coordinator, owned, mine, patientAction, blockers, patientBlocked);
        // Whoever is the one voice to the patient now (the owner, or their active cover instead of them) may re-send a link.
        List<String> sends = coordinator && authority.allowed(Permission.CASE_PATIENT_REPLY, Resource.ofCase(caseId))
                ? patientSendActions(proposal, blockers) : List.of();
        List<String> available = new ArrayList<>(owned ? availableActions(f, proposal, patientAction, blockers)
                : current.kind().equals("FOCUS") ? List.of(current.code()) : List.of());
        available.addAll(sends);
        return new CaseActionsView(f.status(), waitingOn, waitingReason.text(), current, blockers, available, "STAFF", waitingReason.code());
    }

    // ---------------- the patient's own answer ----------------

    /** Journey stages, in the patient's coarse vocabulary, that map to one "we are waiting on our side" step each. */
    private static final Set<String> COORDINATOR_STAGES = Set.of("RECEIVED", "INTAKE_REVIEW", "READY_FOR_CONSULTANT");
    private static final Set<String> CONSULTANT_STAGES = Set.of("CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "CLINICAL_RECOMMENDATION_READY");
    private static final Set<String> PROPOSAL_STAGES = Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED", "PATIENT_DECISION", "EXPIRED");
    /** Readiness steps only the signed-in patient can finish, in the order they should be asked for. */
    private static final List<String> PATIENT_STEPS = List.of("PROFILE_NOT_ACTIVATED", "CONTACT_NOT_VERIFIED", "REPRESENTATIVE_AUTH_MISSING", "CONSENTS_INCOMPLETE", "IDENTITY_NOT_VERIFIED");

    /**
     * What the patient sees as "the current step": one authoritative answer, resolved here and rendered by
     * the portal — never inferred there from the stage, the proposal or the deposit.
     *
     * <p>A FOCUS action exists only when the patient genuinely owes something: an open information request,
     * a proposal waiting for their decision, or a readiness step only they can complete. Everything else is
     * a WAIT that names whose move it is (our team, the consultant, the deposit being arranged on our side,
     * treatment) so the page can say "no action is required from you" with confidence. The deposit is
     * arranged offline by staff today, so it is a WAIT and never a "pay" action; a future online step would
     * be a new FOCUS code from this same resolver.
     */
    private CaseActionsView patientView(UUID caseId, Facts f, String waitingOn, WaitingReason waitingReason, PatientActionView patientAction,
                                        List<BlockerView> blockers, String viewer) {
        List<BlockerView> mine = blockers.stream().filter(b -> "PATIENT".equals(b.owner())).toList();
        List<String> available = new ArrayList<>();
        if (!TERMINAL.contains(f.status()) && f.coordinatorSubject() != null) available.add("MESSAGE_COORDINATOR");
        CurrentActionView current = patientCurrentAction(caseId, f.status(), patientAction, mine);
        return new CaseActionsView(f.status(), waitingOn, waitingReason.text(), current, mine, available, viewer, waitingReason.code());
    }

    private CurrentActionView patientCurrentAction(UUID caseId, String status, PatientActionView patientAction, List<BlockerView> mine) {
        if (patientAction != null) {
            boolean overdue = patientAction.dueAt() != null && patientAction.dueAt().isBefore(clock.instant());
            return new CurrentActionView("PROVIDE_INFORMATION", "FOCUS", patientAction.title(), patientAction.message(), patientAction.taskId(), null, "INFORMATION_REQUEST", patientAction.dueAt(), overdue, null);
        }
        if ("REVIEW_PROPOSAL".equals(proposals.state(caseId).action())) return simple("REVIEW_PROPOSAL", "FOCUS");
        for (String code : PATIENT_STEPS) {
            Optional<BlockerView> step = mine.stream().filter(b -> code.equals(b.code())).findFirst();
            if (step.isPresent()) return new CurrentActionView(code.equals("IDENTITY_NOT_VERIFIED") ? "VERIFY_IDENTITY" : "COMPLETE_PROFILE", "FOCUS", null, null, null, null, null, null, false, code);
        }
        if (TERMINAL.contains(status) && !"EXPIRED".equals(status)) return none(); // an expired estimate is re-prepared, not closed
        if (COORDINATOR_STAGES.contains(status)) return simple("WAIT_COORDINATOR_REVIEW", "WAIT");
        if ("INFORMATION_REQUIRED".equals(status)) return simple("WAIT_COORDINATOR_REVIEW", "WAIT"); // answered, or asked on another channel
        if (CONSULTANT_STAGES.contains(status)) return simple("WAIT_CONSULTANT_REVIEW", "WAIT");
        if (PROPOSAL_STAGES.contains(status)) return simple("WAIT_PROPOSAL", "WAIT");
        if ("ACCEPTED".equals(status)) {
            String deposit = payment.depositStatusFor(caseId);
            if (Set.of("REQUESTED", "PARTIALLY_PAID", "REQUIRED").contains(deposit)) return simple("WAIT_DEPOSIT_ARRANGEMENT", "WAIT");
            return simple("WAIT_COORDINATION", "WAIT");
        }
        if ("TRAVEL_COORDINATION".equals(status)) return simple("WAIT_COORDINATION", "WAIT");
        if ("ARRIVAL_CONFIRMED".equals(status)) return simple("WAIT_TREATMENT", "WAIT");
        if ("TREATMENT_IN_PROGRESS".equals(status)) return simple("IN_TREATMENT", "WAIT");
        if (Set.of("DISCHARGED", "FOLLOW_UP").contains(status)) return simple("FOLLOW_UP", "WAIT");
        return none();
    }

    private CurrentActionView currentAction(UUID caseId, Facts f, Proposal proposal, Actor actor, boolean coordinator, boolean owned,
                                            WorkItem mine, PatientActionView patientAction, List<BlockerView> blockers, boolean patientBlocked) {
        if (coordinator && !owned)
            return "RECEIVED".equals(f.status()) && f.coordinatorSubject() == null ? simple("CLAIM_CASE", "CLAIM") : simple("VIEW_ONLY", "NONE");
        if (!coordinator && f.pendingFor(actor.subject(), actor.label())) return simple("ACCEPT_ASSIGNMENT", "ACCEPT");
        // Work that is mine and not itself waiting on the patient is what the workflow is waiting for.
        if (mine != null && !(READINESS_GATED_WORK.contains(mine.type()) && patientBlocked)) return workItem(mine);
        if (patientAction != null) return simple("WAIT_PATIENT_INFORMATION", "WAIT");
        if (patientBlocked) {
            BlockerView first = blockers.stream().filter(CaseActionService::patientGate).findFirst().orElseThrow();
            return new CurrentActionView("WAIT_PATIENT_READINESS", "WAIT", null, null, null, null, null, null, false, first.code());
        }
        if (mine != null) return workItem(mine);
        return stageFallback(caseId, f, proposal, actor, coordinator, blockers);
    }

    /** Only reached when nothing is assigned: describe the stage honestly, including "nothing to do yet". */
    private CurrentActionView stageFallback(UUID caseId, Facts f, Proposal proposal, Actor actor, boolean coordinator, List<BlockerView> blockers) {
        String s = f.status();
        if (coordinator) {
            if (CONSULTANT_ASSIGNABLE.contains(s)) return simple("ASSIGN_CONSULTANT", "FOCUS");
            if (Set.of("CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW").contains(s)) return simple("WAIT_CONSULTANT", "WAIT");
            if (PROPOSAL_WORK_STAGES.contains(s)) return simple("PREPARE_PROPOSAL", "FOCUS");
            if (Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL").contains(s)) return internalApprovalStep(f, proposal);
            if ("PATIENT_DECISION".equals(s)) return simple("WAIT_PATIENT_DECISION", "WAIT");
            if ("ACCEPTED".equals(s)) return payment.depositSatisfied(caseId) ? none() : simple("WAIT_PAYMENT", "WAIT");
            if ("TRAVEL_COORDINATION".equals(s)) {
                if (f.hasAssignment("OPERATIONS")) return simple("WAIT_OPERATIONS", "WAIT");
                return operationsAssignable(f, blockers) ? simple("ASSIGN_OPERATIONS", "FOCUS") : none();
            }
            return none();
        }
        if (actor.role() == Role.CONSULTANT && "CONSULTANT_REVIEW".equals(s)) return simple("RECORD_CLINICAL_DECISION", "FOCUS");
        if (actor.role() == Role.OPERATIONS) {
            if (Set.of("ACCEPTED", "TRAVEL_COORDINATION").contains(s)) return simple("UPDATE_TRAVEL_PLAN", "FOCUS");
            if ("PROPOSAL_PREPARATION".equals(s) && f.travelPackage() && proposal != null && !proposal.operationsDone()
                    && "CLINICALLY_APPROVED".equals(proposal.status())) return simple("UPDATE_TRAVEL_PLAN", "FOCUS");
        }
        if (actor.role() == Role.FINANCE && "PROPOSAL_PREPARATION".equals(s) && proposal != null && proposal.requiresFinance()
                && !proposal.financeDone() && (!f.travelPackage() || proposal.operationsDone())
                && Set.of("CLINICALLY_APPROVED", "OPERATIONS_COMPLETED").contains(proposal.status()))
            return simple("APPROVE_COMMERCIAL_TERMS", "FOCUS");
        return none();
    }

    /**
     * Before release the proposal may need internal sign-off: Operations for a travel package, Finance for
     * manually priced services. Whoever is still missing is the coordinator's next step; once everybody is
     * assigned the ball is theirs, and once the gates are clear the step is the release itself.
     */
    private CurrentActionView internalApprovalStep(Facts f, Proposal p) {
        if (p == null) return simple("PREPARE_PROPOSAL", "FOCUS");
        boolean opsNeeded = f.travelPackage() && !p.finalQuote() && !p.operationsDone();
        boolean finNeeded = p.requiresFinance() && !p.financeDone();
        if (opsNeeded && !f.hasAssignment("OPERATIONS")) return simple("ASSIGN_OPERATIONS", "FOCUS");
        if (finNeeded && !f.hasAssignment("FINANCE")) return simple("ASSIGN_FINANCE", "FOCUS");
        if (opsNeeded || finNeeded) return simple("WAIT_INTERNAL_APPROVAL", "WAIT");
        return simple("RELEASE_PROPOSAL", "FOCUS");
    }

    /**
     * Optional, state-valid operations for the owning coordinator. Utilities and exceptions only — the
     * next workflow step is the current action, never an entry here. Re-sending a secure link is not among them: it
     * follows who answers the patient, not who owns the case ({@link #patientSendActions}).
     */
    private List<String> availableActions(Facts f, Proposal p, PatientActionView patientAction, List<BlockerView> blockers) {
        List<String> actions = new ArrayList<>();
        String s = f.status();
        if (patientAction != null) {
            if (patientAction.items().stream().anyMatch(i -> !i.completed())) actions.add("RECORD_PATIENT_RESPONSE");
        } else if (!TERMINAL.contains(s) && !CONSULTANT_OWNED.contains(s)) actions.add("REQUEST_INFORMATION");
        if (p != null && Set.of("RELEASED", "VIEWED").contains(p.status())) {
            // A patient who decided on a call (the Arabic assisted path) has their decision recorded by the owner.
            actions.add("RECORD_PROPOSAL_DECISION");
        }
        if (CONSULTANT_ASSIGNABLE.contains(s)) actions.add("ASSIGN_CONSULTANT");
        if (operationsAssignable(f, blockers)) actions.add("ASSIGN_OPERATIONS");
        if ("PROPOSAL_PREPARATION".equals(s) && p != null && p.requiresFinance() && !p.financeDone()) actions.add("ASSIGN_FINANCE");
        if ("INFORMATION_REQUIRED".equals(s)) actions.add("MOVE_TO_INTAKE_REVIEW");
        if (!TRAVEL_PACKAGE_LOCKED.contains(s)) actions.add("SET_TRAVEL_PACKAGE");
        if (CONSULTANT_ASSIGNABLE.contains(s)) actions.add("CANCEL_CASE");
        return actions;
    }

    /**
     * Re-sending a secure link messages the patient from the business number, so it belongs to the case's one voice:
     * the owner, or their active reply cover while the owner only reads. Valid while there is a link worth re-sending.
     */
    private static List<String> patientSendActions(Proposal p, List<BlockerView> blockers) {
        List<String> actions = new ArrayList<>();
        if (p != null && Set.of("RELEASED", "VIEWED").contains(p.status())) actions.add("RESEND_PROPOSAL_LINK");
        if (blockers.stream().anyMatch(b -> "PROFILE_NOT_ACTIVATED".equals(b.code()))) actions.add("RESEND_ONBOARDING_LINK");
        return actions;
    }

    // ---------------- shared policy ----------------

    /**
     * Operations is assigned to arrange travel and arrival. Before the proposal is released it may be
     * pulled in for the travel-package plan (gated by the proposal itself); after acceptance it is only
     * valid once the coordination deposit is settled — the case is then in TRAVEL_COORDINATION — and the
     * patient has finished the profile steps only they can complete. Every case needs current onboarding evidence;
     * there is no deposit-only gate (CL3).
     */
    public void assertOperationsAssignable(UUID caseId) {
        assertOperationsAssignable(queries.facts(caseId), () -> readinessBlockers(caseId));
    }

    public boolean operationsAssignable(UUID caseId) {
        try { assertOperationsAssignable(caseId); return true; } catch (ApiException e) { return false; }
    }

    /** The same policy over facts and readiness already read (readiness is only consulted in TRAVEL_COORDINATION). */
    private static void assertOperationsAssignable(Facts f, Supplier<List<BlockerView>> blockers) {
        String status = f.status();
        if ("PROPOSAL_PREPARATION".equals(status)) {
            if (f.travelPackage()) return;
            throw new ApiException(409, "CASE_NOT_READY_FOR_ASSIGNMENT", "Operations is only needed before release when a travel package was requested");
        }
        if (!"TRAVEL_COORDINATION".equals(status))
            throw new ApiException(409, "CASE_NOT_READY_FOR_ASSIGNMENT", "Operations is assigned once the coordination deposit is settled and treatment coordination starts");
        List<BlockerView> outstanding = blockers.get().stream().filter(CaseActionService::coordinationGate).toList();
        if (outstanding.isEmpty()) return;
        List<String> patient = outstanding.stream().filter(CaseActionService::patientGate).map(BlockerView::labelEn).toList();
        if (!patient.isEmpty())
            throw new ApiException(409, "COORDINATION_NOT_READY", "The patient has not completed the steps needed before coordination starts: " + String.join("; ", patient));
        throw new ApiException(409, "COORDINATION_NOT_READY", "Steps needed before coordination starts are outstanding: "
                + String.join("; ", outstanding.stream().map(BlockerView::labelEn).toList()));
    }

    private static boolean operationsAssignable(Facts f, List<BlockerView> blockers) {
        try { assertOperationsAssignable(f, () -> blockers); return true; } catch (ApiException e) { return false; }
    }

    /**
     * Customer-readiness steps as the coordinator should see them: who owes each one, with the profile
     * steps the onboarding link completes together collapsed into one. The deposit is staff-arranged
     * (offline model) and is queued behind anything the patient still has to do.
     */
    public List<BlockerView> readinessBlockers(UUID caseId) {
        CustomerReadiness r = readiness.compute(caseId);
        List<BlockerView> out = new ArrayList<>();
        boolean profile = r.blockingItems().stream().anyMatch(b -> "ACCOUNT_NOT_ACTIVATED".equals(b.code()));
        if (profile) out.add(new BlockerView("PROFILE_NOT_ACTIVATED", "Profile activation", "تفعيل الملف", "PATIENT", true));
        for (BlockingItem b : r.blockingItems()) {
            switch (b.code()) {
                case "DEPOSIT_UNPAID" -> {}
                // Onboarding starts when the patient acknowledges the estimate; a case without it needs staff to start it.
                case "ONBOARDING_NOT_STARTED" -> out.add(new BlockerView(b.code(), "Onboarding not started", "لم يبدأ التسجيل", "STAFF", true));
                case "CONTACT_NOT_VERIFIED" -> out.add(new BlockerView(b.code(), "Contact channel verification", "تأكيد وسيلة التواصل", "PATIENT", true));
                case "IDENTITY_NOT_VERIFIED" -> out.add(queries.identityUnderReview(caseId)
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

    /** A patient step changed (contact, consents, onboarding, account): who has the ball may have changed with it. */
    @EventListener
    public void on(CaseEvents.PatientReadinessChanged event) { reconcileWaitingOn(event.caseId()); }

    /**
     * Who has the ball, re-derived from what is outstanding right now. Also called by the transitions
     * that change readiness (acknowledgement, profile activation) so the queue is right before anybody
     * opens the case.
     */
    @Transactional
    public String reconcileWaitingOn(UUID caseId) {
        Facts f = queries.facts(caseId);
        List<BlockerView> blockers = READINESS_STAGES.contains(f.status()) ? readinessBlockers(caseId) : List.of();
        return reconcileWaitingOn(caseId, f.status(), blockers, patientActions.openAction(caseId), null);
    }

    private String reconcileWaitingOn(UUID caseId, String status, List<BlockerView> blockers, PatientActionView patientAction, WorkItem mine) {
        Optional<BlockerView> patientStep = blockers.stream().filter(CaseActionService::patientGate).findFirst();
        String fallback = StaffWorkService.stageDefault(status);
        // Open coordinator work means our team owes the next move, unless the stage says the ball is elsewhere.
        if (Set.of("STAFF", "PAYMENT", "TRAVEL_TEAM", "NONE").contains(fallback) && work.hasOpenWork(caseId, "COORDINATOR")) fallback = "STAFF";
        WaitingReason reason = patientStep.map(b -> WaitingReason.patientStep(b.code(), "Waiting for the patient: " + b.labelEn().toLowerCase(Locale.ROOT)))
                .orElse("PAYMENT".equals(fallback) ? WaitingReason.of("DEPOSIT_PENDING", "Waiting for the coordination deposit")
                        : mine != null && "STAFF".equals(fallback) ? WaitingReason.work(mine.copy() == null ? null : mine.copy().code(), mine.title()) : null);
        return work.reconcileWaitingOn(caseId, fallback, reason, patientStep.isPresent() || patientAction != null);
    }

    /** Work made obsolete by a stage the case has already left. Idempotent; a no-op on a healthy case. */
    private void closeObsoleteWork(UUID caseId, String status, Proposal proposal) {
        // An assisted-decision call is owed only while the latest version can still be decided (expired, replaced or decided: done).
        if (proposal == null || !Set.of("RELEASED", "VIEWED").contains(proposal.status()))
            work.closeWorkItems(caseId, ProposalAssistanceService.WORK_TYPE, "Superseded — no proposal decision is owed");
        if (!PROPOSAL_WORK_STAGES.contains(status)) {
            work.closeWorkItems(caseId, "PREPARE_PROPOSAL", "Superseded — the proposal has already been prepared");
            work.closeWorkItems(caseId, "PROPOSAL_REVISION", "Superseded — the proposal has already been revised");
        }
        if (!Set.of("ACCEPTED", "TRAVEL_COORDINATION").contains(status))
            work.closeWorkItems(caseId, "TRAVEL", "Superseded — treatment coordination is already under way");
    }

    private CurrentActionView workItem(WorkItem w) {
        boolean overdue = w.dueAt() != null && w.dueAt().isBefore(clock.instant());
        return new CurrentActionView("WORK_ITEM", "COMPLETE".equals(kindFor(w.type())) ? "COMPLETE" : "FOCUS", w.title(), w.context(), w.id(), w.version(), w.type(), w.dueAt(), overdue, null, w.copy());
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

    /**
     * A step that must be done before treatment coordination starts, whoever owes it: every gating readiness step except
     * the deposit, which the stage gate checks itself. A missing onboarding is owed by staff but still gates (CL3).
     */
    static boolean coordinationGate(BlockerView b) { return b.gating() && !"DEPOSIT_UNPAID".equals(b.code()); }
    private static CurrentActionView simple(String code, String kind) { return new CurrentActionView(code, kind, null, null, null, null, null, null, false, null); }
    private static CurrentActionView none() { return simple("NONE", "NONE"); }
}
