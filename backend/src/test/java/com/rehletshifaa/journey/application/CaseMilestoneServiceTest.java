package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseStatusChangeRepository.TimelineRow;
import com.rehletshifaa.journey.api.JourneyDtos.CaseMilestones;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProposalState;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** D-1: the patient's stamp dates come from real events only. */
class CaseMilestoneServiceTest {
    private static final Instant T0 = Instant.parse("2026-10-01T08:00:00Z");

    private record Row(String getToStatus, Instant getCreatedAt) implements TimelineRow {
        public String getActorSubject() { return "staff-subject"; }
        public String getActorRole() { return "COORDINATOR"; }
        public String getReason() { return "internal reason"; }
    }

    private static Row at(int day, String status) { return new Row(status, T0.plusSeconds(86_400L * day)); }

    @Test void aNewCaseHasOnlyItsReceivedDate() {
        assertThat(CaseMilestoneService.from(List.of(at(0, "RECEIVED"), at(1, "INTAKE_REVIEW")), null))
                .isEqualTo(new CaseMilestones(at(0, "").getCreatedAt(), null, null));
    }

    @Test void theConsultantDateIsTheLatestHandOverToAConsultantNotEachStepInsideIt() {
        var history = List.of(at(0, "RECEIVED"), at(1, "INTAKE_REVIEW"), at(2, "CONSULTANT_ASSIGNMENT_PENDING"), at(3, "CONSULTANT_REVIEW"),
                at(4, "INFORMATION_REQUIRED"), at(6, "READY_FOR_CONSULTANT"), at(7, "CONSULTANT_REVIEW"), at(8, "CLINICAL_RECOMMENDATION_READY"));
        assertThat(CaseMilestoneService.from(history, null).consultantReviewAt()).isEqualTo(at(7, "").getCreatedAt());
    }

    @Test void theEstimateDateIsTheReleaseOfTheVersionThePatientHas() {
        Instant released = at(9, "").getCreatedAt();
        var ready = new PatientProposalState("READY", "REVIEW_PROPOSAL", null, 1, "PRELIMINARY_ESTIMATE", "USD", null, released, null);
        var revising = new PatientProposalState("REVISION_REQUESTED", null, null, null, null, null, null, null, released);
        assertThat(CaseMilestoneService.from(List.of(at(0, "RECEIVED")), ready).estimateReadyAt()).isEqualTo(released);
        assertThat(CaseMilestoneService.from(List.of(at(0, "RECEIVED")), revising).estimateReadyAt()).isNull();
    }
}
