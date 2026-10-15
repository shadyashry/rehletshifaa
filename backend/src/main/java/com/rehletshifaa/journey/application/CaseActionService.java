package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.application.Actor;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Resource;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.journey.api.WorkDtos.PatientActionView;
import com.rehletshifaa.journey.api.WorkDtos.WaitingReason;
import com.rehletshifaa.journey.api.WorkDtos.WorkCopy;
import com.rehletshifaa.journey.application.CaseActionQueryService.Facts;
import com.rehletshifaa.journey.application.CaseActionQueryService.Proposal;
import com.rehletshifaa.journey.application.CaseActionQueryService.WorkItem;
import com.rehletshifaa.journey.domain.CaseExitReason;
import com.rehletshifaa.journey.infrastructure.CaseExitReasonRepository;
import com.rehletshifaa.journey.infrastructure.TravelPlanRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseStatusChangeRepository;
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
    private static final Set<String> READINESS_GATED_WORK = Set.of("TRAVEL");

    /**
     * Work that waits behind the patient's readiness is parked — out of My work and "At a glance" — while the case's
     * responsibility (kept by {@link #reconcileWaitingOn}) is the patient, as the current action says (QA A3, #18).
     */
    static boolean parked(String workType, String waitingOn) { return READINESS_GATED_WORK.contains(workType) && "PATIENT".equals(waitingOn); }
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
    private final SlaPolicy sla;
    private final PatientActionQueryService patientActions;
    private final ProposalAccessService proposals;
    private final Authority authority;
    private final Clock clock;
    private final com.rehletshifaa.workforce.application.WorkforceDirectory workforce;

    private final CaseExitReasonRepository exitReasons;
    private final TravelPlanRepository travelPlans;
    private final CaseStatusChangeRepository statusChanges;

    public CaseActionService(CaseActionQueryService queries, CustomerReadinessService readiness, PaymentService payment,
                             StaffWorkService work, PatientActionQueryService patientActions, ProposalAccessService proposals, Authority authority, Clock clock,
                             com.rehletshifaa.workforce.application.WorkforceDirectory workforce, CaseExitReasonRepository exitReasons,
                             TravelPlanRepository travelPlans, CaseStatusChangeRepository statusChanges, SlaPolicy sla) {
        this.exitReasons = exitReasons; this.travelPlans = travelPlans; this.statusChanges = statusChanges; this.sla = sla;
        this.workforce = workforce;
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
        WorkItem mine = myWork(caseId, actor);
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
        return new CaseActionsView(f.status(), waitingOn, waitingReason.text(), withWindow(current), blockers, available, "STAFF", waitingReason.code());
    }

    // ---------------- the patient's own answer ----------------

    /** Journey stages, in the patient's coarse vocabulary, that map to one "we are waiting on our side" step each. */
    private static final Set<String> COORDINATOR_STAGES = Set.of("RECEIVED", "INTAKE_REVIEW", "READY_FOR_CONSULTANT");
    private static final Set<String> CONSULTANT_STAGES = Set.of("CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "CLINICAL_RECOMMENDATION_READY");
    private static final Set<String> PROPOSAL_STAGES = Set.of("PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED", "PATIENT_DECISION", "EXPIRED");
    /** Readiness steps only the signed-in patient can finish, in the order they should be asked for. */
    private static final List<String> PATIENT_STEPS = List.of("PROFILE_NOT_ACTIVATED", "CONTACT_NOT_VERIFIED", "REPRESENTATIVE_AUTH_MISSING", "MINOR_REQUIRES_GUARDIAN",
            "GUARDIAN_AUTH_MISSING", "GUARDIAN_EVIDENCE_MISSING", "CONSENTS_INCOMPLETE", "IDENTITY_NOT_VERIFIED");

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
        // P0-2: the patient's own way out, until travel is confirmed; from then on their coordinator records it for them.
        if (CaseTransitionPolicy.patientMayWithdraw(f.status(), () -> travelPlans.findStatusByCaseId(caseId).orElse(null))) available.add("WITHDRAW");
        CurrentActionView current = patientCurrentAction(caseId, f.status(), patientAction, mine);
        return new CaseActionsView(f.status(), waitingOn, waitingReason.text(), withWindow(current), mine, available, viewer, waitingReason.code());
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
        String exit = exitWord(caseId, status);
        if (exit != null) return new CurrentActionView("NONE", "NONE", null, null, null, null, null, null, false, null, null, exit);
        if (TERMINAL.contains(status) && !"EXPIRED".equals(status)) return none(); // an expired estimate is re-prepared, not closed
        if (COORDINATOR_STAGES.contains(status)) return simple("WAIT_COORDINATOR_REVIEW", "WAIT");
        if ("INFORMATION_REQUIRED".equals(status)) return simple("WAIT_COORDINATOR_REVIEW", "WAIT"); // answered, or asked on another channel
        if (CONSULTANT_STAGES.contains(status)) return simple("WAIT_CONSULTANT_REVIEW", "WAIT");
        if (PROPOSAL_STAGES.contains(status)) return simple("WAIT_PROPOSAL", "WAIT");
        if ("ACCEPTED".equals(status)) {
            // DEP-3: the deposit is the patient's to pay and their transfer reference is mandatory; once entered, Finance checks it.
            if (mine.stream().anyMatch(b -> "DEPOSIT_UNPAID".equals(b.code()))) return simple("PAY_DEPOSIT", "FOCUS");
            if (payment.transferPending(caseId)) return simple("WAIT_PAYMENT_CHECK", "WAIT");
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
        // A stage step's work item is only its queue entry: the step itself (and its form) is the stage's answer below.
        if (mine != null && STAGE_WORK.contains(mine.type())) mine = null;
        // Work that is mine and not itself waiting on the patient is what the workflow is waiting for.
        if (mine != null && !(READINESS_GATED_WORK.contains(mine.type()) && patientBlocked)) return workItem(mine);
        if (patientAction != null) return simple("WAIT_PATIENT_INFORMATION", "WAIT");
        if (patientBlocked) {
            BlockerView first = blockers.stream().filter(CaseActionService::patientGate).findFirst().orElseThrow();
            return new CurrentActionView("WAIT_PATIENT_READINESS", "WAIT", null, null, null, null, null, null, false, first.code());
        }
        if (mine != null) return workItem(mine);
        return stageFallback(caseId, f, proposal, actor.role(), blockers);
    }

    /**
     * Only reached when no other work is mine: describe the stage honestly, including "nothing to do yet". Also the one
     * source of the stage's own steps that {@link #syncStageWork} keeps as work items, for the coordinator who owns the case
     * and the Operations and Finance people active on it.
     */
    private CurrentActionView stageFallback(UUID caseId, Facts f, Proposal proposal, Role role, List<BlockerView> blockers) {
        String s = f.status();
        if (role == Role.COORDINATOR) {
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
        if (role == Role.CONSULTANT && "CONSULTANT_REVIEW".equals(s)) return simple("RECORD_CLINICAL_DECISION", "FOCUS");
        if (role == Role.OPERATIONS) {
            if (Set.of("ACCEPTED", "TRAVEL_COORDINATION").contains(s)) return simple("UPDATE_TRAVEL_PLAN", "FOCUS");
            // Before release Operations prices and plans the travel package for the proposal (QA #27); arranging travel
            // and arrival (UPDATE_TRAVEL_PLAN) only starts once the deposit is settled.
            if ("PROPOSAL_PREPARATION".equals(s) && f.travelPackage() && proposal != null && !proposal.operationsDone()
                    && "CLINICALLY_APPROVED".equals(proposal.status())) return simple("PREPARE_TRAVEL_PACKAGE", "FOCUS");
        }
        if (role == Role.FINANCE && "PROPOSAL_PREPARATION".equals(s) && proposal != null && proposal.requiresFinance()
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
        // Not ASSIGN_OPERATIONS: that is treatment coordination after the deposit, and its copy says so (QA #25).
        if (opsNeeded && !f.hasAssignment("OPERATIONS")) return simple("ASSIGN_OPERATIONS_PLAN", "FOCUS");
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
        // P0-3: the coordinator's urgency judgement, at intake and through review, while the case is in its journey.
        if (!TERMINAL.contains(s)) actions.add("SET_URGENCY");
        // P0-2: after acceptance the cancellation is typed (the coordinator's exit; Consultants never cancel a whole case).
        if (CONSULTANT_ASSIGNABLE.contains(s) || CaseTransitionPolicy.TYPED_CANCELLATION_STAGES.contains(s)) actions.add("CANCEL_CASE");
        return actions;
    }

    /**
     * P0-2: the calm word My Care says a finished journey with, read from the exit record. A cancellation reads as the
     * patient's own withdrawal or as cancelled; a closed case as completed (no follow-up needed) or closed; and EXPIRED
     * only while the deposit-unpaid exit is the move that put the case there — an expired estimate is a live case being
     * re-prepared, and a case re-opened after a deposit expiry may expire again that way. Null otherwise.
     */
    private String exitWord(UUID caseId, String status) {
        return switch (status) {
            case "CANCELLED" -> latestExit(caseId) == CaseExitReason.Reason.PATIENT_WITHDREW ? "WITHDRAWN" : "CANCELLED";
            case "CLOSED" -> latestExit(caseId) == CaseExitReason.Reason.NO_FOLLOW_UP_NEEDED ? "COMPLETED" : "CLOSED";
            case "EXPIRED" -> exitReasons.findFirstByCaseIdOrderByRecordedAtDesc(caseId)
                    .filter(exit -> exit.getReason() == CaseExitReason.Reason.DEPOSIT_UNPAID && isCurrentMove(caseId, exit))
                    .map(exit -> "EXPIRED").orElse(null);
            default -> null;
        };
    }

    private CaseExitReason.Reason latestExit(UUID caseId) {
        return exitReasons.findFirstByCaseIdOrderByRecordedAtDesc(caseId).map(CaseExitReason::getReason).orElse(null);
    }

    /** True when the exit is the move that put the case in its current stage (both are stamped with the same instant). */
    private boolean isCurrentMove(UUID caseId, CaseExitReason exit) {
        return statusChanges.findFirstByCaseIdOrderByCreatedAtDesc(caseId).map(change -> !exit.getRecordedAt().isBefore(change.getCreatedAt())).orElse(true);
    }

    /**
     * Re-sending a secure link messages the patient from the business number, so it belongs to the case's one voice:
     * the owner, or their active reply cover while the owner only reads. Valid while there is a link worth re-sending.
     */
    private static List<String> patientSendActions(Proposal p, List<BlockerView> blockers) {
        List<String> actions = new ArrayList<>();
        if (p != null && Set.of("RELEASED", "VIEWED").contains(p.status())) actions.add("RESEND_PROPOSAL_LINK");
        if (blockers.stream().anyMatch(b -> "PROFILE_NOT_ACTIVATED".equals(b.code()))) actions.add("RESEND_ONBOARDING_LINK");
        // The patient asked how to pay (DEP-3): the link to their payment step, while they owe the transfer reference.
        if (blockers.stream().anyMatch(b -> "DEPOSIT_UNPAID".equals(b.code()) && "PATIENT".equals(b.owner()))) actions.add("SEND_PAYMENT_LINK");
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
                // P1-13: the guardian provided evidence; the coordinator owes the check, and the case waits on it.
                case "GUARDIAN_EVIDENCE_UNVERIFIED" -> out.add(new BlockerView(b.code(), "Guardian evidence check", "التحقق من مستند الوصي", "STAFF", true));
                case "IDENTITY_NOT_VERIFIED" -> out.add(queries.identityUnderReview(caseId)
                        ? new BlockerView(b.code(), "Identity review", "مراجعة الهوية", "STAFF", false)
                        : new BlockerView(b.code(), "Identity verification", "التحقق من الهوية", "PATIENT", false));
                default -> { if (!profile || !PROFILE_CODES.contains(b.code())) out.add(new BlockerView(b.code(), b.labelEn(), b.labelAr(), "PATIENT", true)); }
            }
        }
        boolean patientOwed = out.stream().anyMatch(CaseActionService::patientGate);
        // DEP-3: the patient pays and enters the transfer reference (theirs to do once every other step is done); while Finance
        // checks a reference it is ours.
        if (r.depositRequired() && !r.depositSatisfied())
            out.add(new BlockerView("DEPOSIT_UNPAID", "Coordination deposit", "وديعة التنسيق",
                    patientOwed ? "LATER" : payment.transferPending(caseId) ? "STAFF" : "PATIENT", true));
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
        // While the patient decides, open coordinator work means the patient asked us something (the Arabic terms call):
        // the ball is ours until it is done (QA W-5). A patient action still outranks it below.
        if ("PATIENT_DECISION".equals(status) && work.hasOpenWork(caseId, "COORDINATOR")) fallback = "STAFF";
        WaitingReason reason = patientStep.map(b -> WaitingReason.patientStep(b.code(), "Waiting for the patient: " + b.labelEn().toLowerCase(Locale.ROOT)))
                .orElse("PAYMENT".equals(fallback) ? WaitingReason.of("DEPOSIT_PENDING", "Waiting for the coordination deposit")
                        : mine != null && "STAFF".equals(fallback) ? WaitingReason.work(mine.copy() == null ? null : mine.copy().code(), mine.title()) : null);
        return work.reconcileWaitingOn(caseId, fallback, reason, patientStep.isPresent() || patientAction != null);
    }

    // ---------------- the stage's own steps as work (QA A3) ----------------

    /**
     * Steps a stage owes one named person that no event raises work for: the coordinator's intake review and internal
     * sign-off steps up to the release (#3, #3b), Finance's approval and Operations' plans once they have accepted. Each is
     * carried by one work item named after the step, so My work, "At a glance" and the current action read one source. The
     * step is still decided by {@link #stageFallback}; the item is its queue entry, and the current action keeps the step's
     * own code and form.
     */
    static final Set<String> STAGE_WORK = Set.of("ASSIGN_CONSULTANT", "ASSIGN_OPERATIONS_PLAN", "ASSIGN_FINANCE", "RELEASE_PROPOSAL",
            "APPROVE_COMMERCIAL_TERMS", "PREPARE_TRAVEL_PACKAGE", "UPDATE_TRAVEL_PLAN");
    /** English title and context of each stage step's item; the portal words it from the step's code (EN/AR). */
    private static final Map<String, List<String>> STAGE_WORK_TEXT = Map.of(
            "ASSIGN_CONSULTANT", List.of("Prepare the case for a Consultant", "Complete anything missing, then assign a Consultant for this care area."),
            "ASSIGN_OPERATIONS_PLAN", List.of("Plan the travel package with Operations", "The patient asked for a travel package. Assign Operations to plan and price it before the proposal is released."),
            "ASSIGN_FINANCE", List.of("Finance must approve the commercial terms", "A manually priced service needs Finance sign-off before release. Assign who should approve it."),
            "RELEASE_PROPOSAL", List.of("Release the proposal to the patient", "Every internal sign-off is in. Check the release requirements, then release the secure link."),
            "APPROVE_COMMERCIAL_TERMS", List.of("Approve the commercial terms", "Review the manually priced services before the proposal can be released."),
            "PREPARE_TRAVEL_PACKAGE", List.of("Plan the travel package", "Describe the travel package for the proposal before it is released. Bookings and arrival are arranged only after the patient's deposit."),
            "UPDATE_TRAVEL_PLAN", List.of("Arrange travel and arrival", "Keep the travel plan current; confirm it once every requirement is met."));
    /** Cases this thread is syncing: a change the sync makes announces itself again, and the outer pass already covers it. */
    private final ThreadLocal<Set<UUID>> syncing = ThreadLocal.withInitial(HashSet::new);

    private record StageStep(String subject, String role) {}

    @EventListener
    public void on(CaseEvents.WorkChanged event) { syncStageWork(event.caseId()); }

    /**
     * Keep exactly one open item per stage step owed now, owned by whoever owes it: open a missing one, close one the stage
     * no longer owes (or owes someone else). A step stays out of the queue while its owner has other open work on the case
     * (the event's own item names the same moment, e.g. a declined assignment) and while the case waits on the patient.
     * Idempotent; runs on every {@link CaseEvents.WorkChanged}, never on a read.
     */
    @Transactional
    public void syncStageWork(UUID caseId) {
        if (!syncing.get().add(caseId)) return;
        try {
            Map<String, StageStep> owed = stageSteps(caseId, queries.facts(caseId));
            Map<String, String> open = work.openWorkOwners(caseId, STAGE_WORK);
            for (var item : open.entrySet()) {
                StageStep step = owed.get(item.getKey());
                if (step == null || !step.subject().equals(item.getValue()) || work.hasOtherOpenWork(caseId, step.subject(), STAGE_WORK))
                    work.closeWorkItems(caseId, item.getKey(), "Superseded — the step is no longer owed here");
                else owed.remove(item.getKey()); // already in the right queue
            }
            String actor = currentSubject();
            for (var due : owed.entrySet()) {
                StageStep step = due.getValue();
                if (work.hasOtherOpenWork(caseId, step.subject(), STAGE_WORK)) continue;
                List<String> text = STAGE_WORK_TEXT.get(due.getKey());
                // Told only when someone else handed them the step; a routed intake was already announced by the routing decision.
                boolean tell = !step.subject().equals(actor) && !"ASSIGN_CONSULTANT".equals(due.getKey());
                work.openWorkItem(new NewWorkItem(caseId, due.getKey(), text.get(0), text.get(1), step.subject(), step.role(), false, null,
                        "SYSTEM", "STAGE_STEP_DUE", "stage-step:" + due.getKey() + ":" + caseId + ":" + step.subject(), tell,
                        WorkCopy.of(due.getKey())), tell);
            }
        } finally {
            syncing.get().remove(caseId);
        }
    }

    /** The stage steps owed now, by step: nothing while the patient owes an answer or a step only they can take. */
    private Map<String, StageStep> stageSteps(UUID caseId, Facts f) {
        if (TERMINAL.contains(f.status()) || patientActions.openAction(caseId) != null) return new HashMap<>();
        // Of the readiness stages only treatment coordination has a stage step (Operations); the others are read for nothing.
        List<BlockerView> blockers = "TRAVEL_COORDINATION".equals(f.status()) ? readinessBlockers(caseId) : List.of();
        if (blockers.stream().anyMatch(CaseActionService::patientGate)) return new HashMap<>();
        Proposal proposal = queries.latestProposal(caseId);
        Map<String, StageStep> owed = new HashMap<>();
        for (Role role : List.of(Role.COORDINATOR, Role.FINANCE, Role.OPERATIONS)) {
            String subject = role == Role.COORDINATOR ? f.coordinatorSubject() : f.activeAssignee(role.caseAssignmentRole());
            // Never work for someone who has left the role (the coordinator is re-routed on departure; assignees are not).
            if (subject == null || role != Role.COORDINATOR && !workforce.holds(subject, role.caseAssignmentRole())) continue;
            String code = stageFallback(caseId, f, proposal, role, blockers).code();
            // In ACCEPTED the case waits on the deposit, whatever Operations' page offers; their plan is owed once coordination starts.
            if (STAGE_WORK.contains(code) && !("UPDATE_TRAVEL_PLAN".equals(code) && !"TRAVEL_COORDINATION".equals(f.status())))
                owed.put(code, new StageStep(subject, role.caseAssignmentRole()));
        }
        return owed;
    }

    private static String currentSubject() {
        try { return com.rehletshifaa.authority.application.Principal.current().subject(); }
        catch (ApiException unauthenticated) { return null; } // routing at submission and other system steps
    }

    /** Work made obsolete by a stage the case has already left. Idempotent; a no-op on a healthy case. */
    private void closeObsoleteWork(UUID caseId, String status, Proposal proposal) {
        // An assisted-decision call is owed only while the latest version can still be decided (expired, replaced or decided: done).
        // A read repairs quietly: it never sets the stage's steps moving (no work opened, nobody told, on a page view).
        if (proposal == null || !Set.of("RELEASED", "VIEWED").contains(proposal.status()))
            work.closeWorkItems(caseId, ProposalAssistanceService.WORK_TYPE, "Superseded — no proposal decision is owed", false);
        if (!PROPOSAL_WORK_STAGES.contains(status)) {
            work.closeWorkItems(caseId, "PREPARE_PROPOSAL", "Superseded — the proposal has already been prepared", false);
            work.closeWorkItems(caseId, "PROPOSAL_REVISION", "Superseded — the proposal has already been revised", false);
        }
        if (!Set.of("ACCEPTED", "TRAVEL_COORDINATION").contains(status))
            work.closeWorkItems(caseId, "TRAVEL", "Superseded — treatment coordination is already under way", false);
        if (!"ACCEPTED".equals(status))
            work.closeWorkItems(caseId, CaseHandoffService.DEPOSIT_RECORD_WORK, "Superseded — the case is past the deposit stage", false);
    }

    /** My work on the case: an item I own, else unowned work in my role's pool (Finance: the deposit to record). */
    private WorkItem myWork(UUID caseId, Actor actor) {
        WorkItem owned = queries.myWork(caseId, actor.subject());
        if (owned != null) return owned;
        StaffWorkService.Pool pool = StaffWorkService.poolOf(actor.role().caseAssignmentRole());
        return pool == null ? null : queries.poolWork(caseId, pool);
    }

    private CurrentActionView workItem(WorkItem w) {
        boolean overdue = w.dueAt() != null && w.dueAt().isBefore(clock.instant());
        return new CurrentActionView("WORK_ITEM", "COMPLETE".equals(kindFor(w.type())) ? "COMPLETE" : "FOCUS", w.title(), w.context(), w.id(), w.version(), w.type(), w.dueAt(), overdue, null, w.copy());
    }

    /** Whether finishing the item is acknowledged in place or done through the form that does the real work. */
    private static String kindFor(String type) {
        return switch (type) {
            case "REVIEW_PATIENT_RESPONSE", "PROPOSAL_DECLINED_REVIEW", "CLINICAL_OUTCOME_REVIEW", "REVIEW", "INFORMATION_REQUEST" -> "COMPLETE";
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
    /** P1-6 (D-02): a waiting state carries how long the team usually takes over it, from the one SLA table. */
    private CurrentActionView withWindow(CurrentActionView view) {
        return "WAIT".equals(view.kind()) ? view.withExpectedWorkingDays(sla.waitWorkingDays(view.code())) : view;
    }

    private static CurrentActionView simple(String code, String kind) { return new CurrentActionView(code, kind, null, null, null, null, null, null, false, null); }
    private static CurrentActionView none() { return simple("NONE", "NONE"); }
}
