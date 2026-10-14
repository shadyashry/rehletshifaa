package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.journey.api.JourneyDtos.BlockerView;
import com.rehletshifaa.journey.infrastructure.ProposalVersionRepository;
import com.rehletshifaa.shared.api.ApiException;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * The authoritative case lifecycle: which stage may follow which, and the business invariants a stage
 * demands on entry. There is exactly one copy, and every path that moves a case — a coordinator's
 * transition, a dedicated operation, the public proposal decision, the deposit handoff — validates here
 * before it writes. A stage can therefore never be entered through one endpoint under rules another
 * endpoint would refuse.
 *
 * <p>Deliberate constraints:
 * <ul>
 *   <li>PROPOSAL_PREPARATION can only advance to internal approval (no create-and-release shortcut).</li>
 *   <li>The consultant-review states never allow CANCELLED: a doctor expresses a clinical outcome, not a
 *       whole-case cancel.</li>
 *   <li>EXPIRED and REVISION_REQUESTED both re-enter PROPOSAL_PREPARATION as recovery paths.</li>
 *   <li>TRAVEL_COORDINATION is entered only once the coordination deposit is settled and the patient has
 *       finished the profile steps only they can complete. Preparing a travel plan is data entry and never
 *       moves the stage; the handoff after settlement does, and only when this gate passes.</li>
 *   <li>Every stage after acceptance has an exit (review 2026-10-14, A-01): ACCEPTED expires when the deposit
 *       reminder cycle ends unpaid, and ACCEPTED through FOLLOW_UP cancel with a typed reason — a coordinator's
 *       action, or the patient's own withdrawal while travel is not yet confirmed ({@link CaseExitService}).
 *       DISCHARGED closes directly when the Consultant records that no follow-up is needed.</li>
 * </ul>
 */
@Component
public class CaseTransitionPolicy {
    private final CaseTaskRepository tasks;
    private final ProposalVersionRepository proposalVersions;
    private static final Map<String, Set<String>> TRANSITIONS = Map.ofEntries(
        Map.entry("RECEIVED", Set.of("INTAKE_REVIEW", "CANCELLED")),
        Map.entry("INTAKE_REVIEW", Set.of("INFORMATION_REQUIRED", "READY_FOR_CONSULTANT", "CANCELLED")),
        Map.entry("INFORMATION_REQUIRED", Set.of("INTAKE_REVIEW", "READY_FOR_CONSULTANT", "CANCELLED")),
        Map.entry("READY_FOR_CONSULTANT", Set.of("CONSULTANT_ASSIGNMENT_PENDING", "INTAKE_REVIEW", "CANCELLED")),
        Map.entry("CONSULTANT_ASSIGNMENT_PENDING", Set.of("CONSULTANT_REVIEW", "READY_FOR_CONSULTANT")),
        Map.entry("CONSULTANT_REVIEW", Set.of("INFORMATION_REQUIRED", "CLINICAL_RECOMMENDATION_READY", "READY_FOR_CONSULTANT", "INTAKE_REVIEW", "CLINICALLY_NOT_SUITABLE")),
        Map.entry("CLINICAL_RECOMMENDATION_READY", Set.of("PROPOSAL_PREPARATION")),
        Map.entry("PROPOSAL_PREPARATION", Set.of("PROPOSAL_INTERNAL_APPROVAL", "PATIENT_DECISION")),
        Map.entry("PROPOSAL_INTERNAL_APPROVAL", Set.of("PATIENT_DECISION", "REVISION_REQUESTED")),
        Map.entry("PATIENT_DECISION", Set.of("ACCEPTED", "DECLINED", "REVISION_REQUESTED", "EXPIRED")),
        Map.entry("REVISION_REQUESTED", Set.of("PROPOSAL_PREPARATION")),
        Map.entry("EXPIRED", Set.of("PROPOSAL_PREPARATION")),
        Map.entry("ACCEPTED", Set.of("TRAVEL_COORDINATION", "EXPIRED", "CANCELLED")),
        Map.entry("TRAVEL_COORDINATION", Set.of("ARRIVAL_CONFIRMED", "CANCELLED")),
        Map.entry("ARRIVAL_CONFIRMED", Set.of("TREATMENT_IN_PROGRESS", "CANCELLED")),
        Map.entry("TREATMENT_IN_PROGRESS", Set.of("DISCHARGED", "CANCELLED")),
        Map.entry("DISCHARGED", Set.of("FOLLOW_UP", "CLOSED", "CANCELLED")),
        Map.entry("FOLLOW_UP", Set.of("CLOSED", "CANCELLED")));
    /** Stages a case never leaves (EXPIRED is not one: it re-enters proposal preparation as a recovery path). */
    public static final Set<String> TERMINAL = Set.of("CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE");
    /** Stages where a cancellation is an exit from a committed journey and therefore needs a typed reason. */
    public static final Set<String> TYPED_CANCELLATION_STAGES = Set.of("ACCEPTED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED",
            "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP");
    /** Stages the patient may still withdraw from on their own; after that the coordinator cancels for them. */
    private static final Set<String> PATIENT_WITHDRAWAL_STAGES = Set.of("ACCEPTED", "TRAVEL_COORDINATION");
    /** Travel plan statuses past the point of no return: the patient is asked to contact their coordinator instead. */
    private static final Set<String> TRAVEL_COMMITTED = Set.of("CONFIRMED", "ARRIVED");

    /** The stages the lifecycle knows an exit from (every stage that is not terminal, DRAFT excepted: it is pre-submission). */
    public static Set<String> stages() { return TRANSITIONS.keySet(); }

    /** The stages one move may reach from {@code stage}; empty for a terminal stage. */
    public static Set<String> exitsFrom(String stage) { return TRANSITIONS.getOrDefault(stage, Set.of()); }

    /**
     * The one rule for the patient's own "withdraw" action: allowed after acceptance until travel is confirmed
     * (readiness/travel plan CONFIRMED or ARRIVED) — from then on it is the coordinator's typed cancellation.
     */
    public static boolean patientMayWithdraw(String stage, String travelPlanStatus) {
        return PATIENT_WITHDRAWAL_STAGES.contains(stage) && (travelPlanStatus == null || !TRAVEL_COMMITTED.contains(travelPlanStatus));
    }

    /** As above, reading the travel plan only in the stages where it can matter (a read-path saving on every other stage). */
    public static boolean patientMayWithdraw(String stage, java.util.function.Supplier<String> travelPlanStatus) {
        return PATIENT_WITHDRAWAL_STAGES.contains(stage) && patientMayWithdraw(stage, travelPlanStatus.get());
    }
    /** Forward stages: none may be entered while blocking work is still open on the case. */
    private static final Set<String> ADVANCING = Set.of("CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL",
            "PATIENT_DECISION", "ACCEPTED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CLOSED");

    private final PaymentService payment;
    private final CaseActionService caseActions;

    public CaseTransitionPolicy(PaymentService payment, CaseActionService caseActions, ProposalVersionRepository proposalVersions, CaseTaskRepository tasks) { this.tasks = tasks; this.proposalVersions = proposalVersions;
        this.payment = payment; this.caseActions = caseActions;
    }

    /** Refuses a move the lifecycle or a stage's entry invariant does not allow. Conflicts are 409s the client can act on. */
    public void assertAllowed(UUID caseId, String current, String target) {
        if (!TRANSITIONS.getOrDefault(current, Set.of()).contains(target))
            throw new ApiException(409, "INVALID_CASE_TRANSITION", "The requested case transition is not allowed");
        if (!ADVANCING.contains(target)) return;
        if (blockingWorkOpen(caseId))
            throw new ApiException(409, "BLOCKING_TASKS_OPEN", "Complete or cancel blocking tasks before advancing this case");
        List<String> gate = entryBlockers(caseId, target);
        if (!gate.isEmpty())
            throw new ApiException(409, "COORDINATION_NOT_READY", "Treatment coordination cannot start yet: " + String.join("; ", gate));
    }

    /** True when the move would pass {@link #assertAllowed}; for callers that continue quietly rather than fail. */
    public boolean mayEnter(UUID caseId, String current, String target) {
        try { assertAllowed(caseId, current, target); return true; } catch (ApiException refused) { return false; }
    }

    /**
     * What still stands between the case and the target stage; empty when it may enter. Only
     * TRAVEL_COORDINATION carries entry invariants today: an accepted proposal, a settled deposit where one
     * is due, and no gating readiness step outstanding — a profile step owed by the patient, or an onboarding staff
     * have not started. Every case needs current onboarding evidence; there is no deposit-only gate (CL3).
     */
    public List<String> entryBlockers(UUID caseId, String target) {
        if (!"TRAVEL_COORDINATION".equals(target)) return List.of();
        List<String> out = new ArrayList<>();
        if (!proposalVersions.hasAcceptedForCase(caseId)) out.add("no accepted proposal is on record");
        if (!payment.depositSatisfied(caseId)) out.add("the coordination deposit is not settled");
        for (BlockerView step : caseActions.readinessBlockers(caseId)) {
            if (!CaseActionService.coordinationGate(step)) continue;
            String label = step.labelEn().toLowerCase(Locale.ROOT);
            out.add(CaseActionService.patientGate(step) ? label + " is still pending with the patient" : label + " — staff must resolve it");
        }
        return out;
    }

    private boolean blockingWorkOpen(UUID caseId) {
        return tasks.existsByCaseIdAndBlockingTrueAndStatusIn(caseId, List.of("OPEN", "IN_PROGRESS"));
    }
}
