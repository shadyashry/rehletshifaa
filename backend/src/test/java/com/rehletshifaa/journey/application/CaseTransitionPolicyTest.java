package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The lifecycle graph itself (review 2026-10-14, A-01 / V6): no stage may hold a case forever. Pure, no Spring:
 * the map is the one copy every endpoint validates against, so its shape is a property worth pinning.
 */
class CaseTransitionPolicyTest {
    private static final Set<String> TERMINAL = CaseTransitionPolicy.TERMINAL;

    /** Property: from every non-terminal stage a terminal stage is reachable — there is always a way out. */
    @Test void everyNonTerminalStageHasAnExit() {
        for (CaseStatus status : CaseStatus.values()) {
            String stage = status.name();
            if (TERMINAL.contains(stage) || "DRAFT".equals(stage)) continue; // DRAFT is pre-submission, not a journey stage
            assertThat(CaseTransitionPolicy.stages()).as("%s is a stage the lifecycle knows", stage).contains(stage);
            assertThat(CaseTransitionPolicy.exitsFrom(stage)).as("%s has at least one move", stage).isNotEmpty();
            assertThat(reachableFrom(stage)).as("a terminal stage is reachable from %s", stage).anyMatch(TERMINAL::contains);
        }
        for (String terminal : TERMINAL) assertThat(CaseTransitionPolicy.exitsFrom(terminal)).as("%s is final", terminal).isEmpty();
    }

    /** The stages the review found stuck now leave directly, each with the exit the phase defined. */
    @Test void theCommittedStagesLeaveDirectly() {
        assertThat(CaseTransitionPolicy.exitsFrom("ACCEPTED")).contains("EXPIRED", "CANCELLED");
        for (String stage : List.of("TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP"))
            assertThat(CaseTransitionPolicy.exitsFrom(stage)).as(stage).contains("CANCELLED");
        assertThat(CaseTransitionPolicy.exitsFrom("DISCHARGED")).contains("CLOSED", "FOLLOW_UP");
        assertThat(CaseTransitionPolicy.TYPED_CANCELLATION_STAGES)
                .containsExactlyInAnyOrder("ACCEPTED", "TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP");
        // Unchanged: the consultant-review states still never allow a whole-case cancel; EXPIRED still recovers.
        assertThat(CaseTransitionPolicy.exitsFrom("CONSULTANT_REVIEW")).doesNotContain("CANCELLED");
        assertThat(CaseTransitionPolicy.exitsFrom("CONSULTANT_ASSIGNMENT_PENDING")).doesNotContain("CANCELLED");
        assertThat(CaseTransitionPolicy.exitsFrom("EXPIRED")).containsExactly("PROPOSAL_PREPARATION");
        // P1-13 (A-06): a closed case reopens into FOLLOW_UP and nowhere else; it is no longer a final stage.
        assertThat(CaseTransitionPolicy.exitsFrom("CLOSED")).containsExactly("FOLLOW_UP");
        assertThat(TERMINAL).doesNotContain("CLOSED").contains("CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE");
    }

    /** The patient's own withdrawal: after acceptance, until travel is confirmed; then it is the coordinator's. */
    @Test void thePatientMayWithdrawOnlyAfterAcceptanceAndBeforeTravelIsConfirmed() {
        for (String stage : List.of("ACCEPTED", "TRAVEL_COORDINATION")) {
            assertThat(CaseTransitionPolicy.patientMayWithdraw(stage, (String) null)).as(stage + " without a plan").isTrue();
            assertThat(CaseTransitionPolicy.patientMayWithdraw(stage, "PLANNING")).as(stage + " while planning").isTrue();
            assertThat(CaseTransitionPolicy.patientMayWithdraw(stage, "CONFIRMED")).as(stage + " once confirmed").isFalse();
            assertThat(CaseTransitionPolicy.patientMayWithdraw(stage, "ARRIVED")).as(stage + " once arrived").isFalse();
        }
        for (String stage : List.of("PATIENT_DECISION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP", "CANCELLED"))
            assertThat(CaseTransitionPolicy.patientMayWithdraw(stage, (String) null)).as(stage).isFalse();
    }

    private static Set<String> reachableFrom(String stage) {
        Set<String> seen = new LinkedHashSet<>();
        Deque<String> queue = new ArrayDeque<>(List.of(stage));
        while (!queue.isEmpty()) for (String next : CaseTransitionPolicy.exitsFrom(queue.poll())) if (seen.add(next)) queue.add(next);
        return seen;
    }
}
