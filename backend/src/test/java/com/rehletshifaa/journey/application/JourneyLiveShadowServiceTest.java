package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.domain.JourneyModel.Node;
import com.rehletshifaa.journey.domain.JourneyModel.StageType;
import org.junit.jupiter.api.Test;

import static com.rehletshifaa.journey.application.JourneyLiveShadowService.*;
import static org.assertj.core.api.Assertions.assertThat;

class JourneyLiveShadowServiceTest {
    @Test void matchComparesBusinessOutcomeRatherThanEngineRepresentation() {
        var outcome = evaluate(state("RECEIVED", "STAFF", "JOURNEY:node", "COORDINATOR", "INTERNAL"), node("REQUEST_INFORMATION", "COORDINATOR", StageType.STAFF_TASK));
        assertThat(outcome.result()).isEqualTo(Result.MATCH);
        assertThat(outcome.category()).isNull();
    }

    @Test void mismatchHasAStableCategory() {
        var outcome = evaluate(state("RECEIVED", "PATIENT", "JOURNEY:node", "COORDINATOR", "INTERNAL"), node("REQUEST_INFORMATION", "COORDINATOR", StageType.STAFF_TASK));
        assertThat(outcome.result()).isEqualTo(Result.MISMATCH);
        assertThat(outcome.category()).isEqualTo(Category.WAITING_STATE_MISMATCH);
    }

    @Test void legacyPatientTaskNameIsAnAcceptableDifference() {
        var outcome = evaluate(state("INFORMATION_REQUIRED", "PATIENT", "INFORMATION_REQUEST", "PATIENT", "PATIENT_ACTION"), node("PROVIDE_INFORMATION", "PATIENT", StageType.PATIENT_ACTION));
        assertThat(outcome.result()).isEqualTo(Result.ACCEPTABLE_DIFFERENCE);
        assertThat(outcome.category()).isEqualTo(Category.EXPECTED_LEGACY_DIFFERENCE);
    }

    @Test void actionOutsideFrozenCatalogIsNotComparable() {
        var outcome = evaluate(state("TRAVEL_COORDINATION", "STAFF", "TRAVEL", "OPERATIONS", "INTERNAL"), node("START_TREATMENT", "OPERATIONS", StageType.STAFF_TASK));
        assertThat(outcome.result()).isEqualTo(Result.NOT_COMPARABLE);
        assertThat(outcome.category()).isEqualTo(Category.OUT_OF_FROZEN_V1_SCOPE);
    }

    private static BusinessState state(String status, String waiting, String task, String owner, String visibility) {
        return new BusinessState(status, waiting, task, owner, visibility, "OPEN");
    }
    private static Node node(String action, String actor, StageType type) {
        return new Node("node", "Node", type, actor, action, null, null, null, null, true);
    }
}
