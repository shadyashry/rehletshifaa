package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.BlockerView;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
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
 * </ul>
 */
@Component
public class CaseTransitionPolicy {
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
        Map.entry("ACCEPTED", Set.of("TRAVEL_COORDINATION")),
        Map.entry("TRAVEL_COORDINATION", Set.of("ARRIVAL_CONFIRMED", "CANCELLED")),
        Map.entry("ARRIVAL_CONFIRMED", Set.of("TREATMENT_IN_PROGRESS")),
        Map.entry("TREATMENT_IN_PROGRESS", Set.of("DISCHARGED")),
        Map.entry("DISCHARGED", Set.of("FOLLOW_UP")),
        Map.entry("FOLLOW_UP", Set.of("CLOSED")));
    /** Forward stages: none may be entered while blocking work is still open on the case. */
    private static final Set<String> ADVANCING = Set.of("CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL",
            "PATIENT_DECISION", "ACCEPTED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CLOSED");

    private final JdbcClient jdbc;
    private final PaymentService payment;
    private final CaseActionService caseActions;

    public CaseTransitionPolicy(JdbcClient jdbc, PaymentService payment, CaseActionService caseActions) {
        this.jdbc = jdbc; this.payment = payment; this.caseActions = caseActions;
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
     * is due, and no profile step still owed by the patient. Cases from before the onboarding layer keep
     * the deposit-only gate, as {@link CustomerReadinessService#assertReadyForCommitment} does.
     */
    public List<String> entryBlockers(UUID caseId, String target) {
        if (!"TRAVEL_COORDINATION".equals(target)) return List.of();
        List<String> out = new ArrayList<>();
        Integer accepted = jdbc.sql("SELECT count(*) FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=? AND pv.status='ACCEPTED'")
                .param(caseId).query(Integer.class).single();
        if (accepted == null || accepted == 0) out.add("no accepted proposal is on record");
        if (!payment.depositSatisfied(caseId)) out.add("the coordination deposit is not settled");
        for (BlockerView step : caseActions.readinessBlockers(caseId))
            if (CaseActionService.patientGate(step)) out.add(step.labelEn().toLowerCase(Locale.ROOT) + " is still pending with the patient");
        return out;
    }

    private boolean blockingWorkOpen(UUID caseId) {
        Integer blocking = jdbc.sql("SELECT count(*) FROM case_tasks WHERE case_id=? AND blocking=TRUE AND status IN ('OPEN','IN_PROGRESS')")
                .param(caseId).query(Integer.class).single();
        return blocking != null && blocking > 0;
    }
}
