package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.CostEstimateItem;
import com.rehletshifaa.journey.api.JourneyDtos.CustomerReadiness;
import com.rehletshifaa.journey.api.JourneyDtos.FinalAssessmentRequest;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * B-3-1a: once the patient has arrived the Consultant's step is the final assessment, on the strip and in My work, until one
 * is saved; nobody else's step changes. The fixture's patient never went through onboarding, so their readiness is read as complete here.
 */
class FinalAssessmentStepTest extends AdmissionFixture {
    @MockitoSpyBean CustomerReadinessService patientReadiness;

    @BeforeEach void patientReady() {
        doAnswer(call -> {
            CustomerReadiness r = (CustomerReadiness) call.callRealMethod();
            return new CustomerReadiness(true, true, r.verifiedChannel(), r.identityRequired(), true, true, true, true,
                    r.depositRequired(), r.depositStatus(), true, List.of(), true, r.updatedAt());
        }).when(patientReadiness).compute(any());
    }

    @Test void onArrivalTheConsultantOwesTheFinalAssessmentUntilItIsSaved() {
        Arrived c = arrivedThroughTheArrivalMove();
        assertThat(openStep(c.caseId)).as("in the Consultant's My work").isEqualTo(1);

        asDoctor();
        var step = journey.workspace(c.caseId).actions().currentAction();
        assertThat(step.code()).as("the preliminary review is not the final assessment").isEqualTo("RECORD_FINAL_ASSESSMENT");
        assertThat(step.kind()).isEqualTo("FOCUS");
        asOps();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("only the Consultant's step").isNotEqualTo("RECORD_FINAL_ASSESSMENT");
        asCoordinator();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isNotEqualTo("RECORD_FINAL_ASSESSMENT");
        asPatient();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isNotEqualTo("RECORD_FINAL_ASSESSMENT");

        UUID service = jdbc.queryForObject("SELECT catalog_service_id FROM clinical_review_cost_estimates WHERE clinical_review_id=?", UUID.class, c.reviewId);
        asDoctor();
        journey.saveFinalAssessment(c.caseId, new FinalAssessmentRequest("Scope confirmed on examination", "Standard risks",
                List.of(new CostEstimateItem("Angioplasty package", new BigDecimal("100000.00"), "EGP", service))));
        em.flush(); em.clear();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("saved: the step is done").isNotEqualTo("RECORD_FINAL_ASSESSMENT");
        assertThat(openStep(c.caseId)).as("and gone from My work").isZero();
    }

    /** G-2: a draft is kept like the review's, and is never the saved final assessment. */
    @Test void aDraftKeepsTheWorkWithoutSavingTheFinalAssessment() {
        Arrived c = arrivedThroughTheArrivalMove();
        UUID service = jdbc.queryForObject("SELECT catalog_service_id FROM clinical_review_cost_estimates WHERE clinical_review_id=?", UUID.class, c.reviewId);
        asDoctor();
        UUID first = journey.saveFinalAssessmentDraft(c.caseId, new FinalAssessmentRequest("Scope to confirm", null,
                List.of(new CostEstimateItem("Angioplasty package", new BigDecimal("100000.00"), "EGP", service)))).id();
        em.flush(); em.clear();
        assertThat(status(first)).isEqualTo("DRAFT");
        assertThat(count("SELECT COUNT(*) FROM clinical_review_cost_estimates WHERE clinical_review_id=?", first)).as("the lines picked so far").isEqualTo(1);
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).as("a draft is not the final assessment").isEqualTo("RECORD_FINAL_ASSESSMENT");
        assertThat(openStep(c.caseId)).as("the work item stays open").isEqualTo(1);

        UUID second = journey.saveFinalAssessmentDraft(c.caseId, new FinalAssessmentRequest("Scope confirmed", null, List.of())).id();
        em.flush(); em.clear();
        assertThat(status(first)).as("a later draft supersedes the earlier one").isEqualTo("SUPERSEDED");
        assertThat(status(second)).isEqualTo("DRAFT");

        UUID saved = journey.saveFinalAssessment(c.caseId, new FinalAssessmentRequest("Scope confirmed on examination", null,
                List.of(new CostEstimateItem("Angioplasty package", new BigDecimal("100000.00"), "EGP", service)))).id();
        em.flush(); em.clear();
        assertThat(status(second)).as("saving the final assessment supersedes the draft").isEqualTo("SUPERSEDED");
        assertThat(status(saved)).isEqualTo("APPROVED");
        assertThat(openStep(c.caseId)).isZero();
    }

    @Test void aDraftIsOnlyTheCaseConsultantsAndOnlyAtArrival() {
        Arrived c = arrived("17250.00");
        var request = new FinalAssessmentRequest("Scope to confirm", null, List.of());
        jdbc.update("UPDATE medical_cases SET status='TRAVEL_COORDINATION' WHERE id=?", c.caseId);
        em.clear();
        asDoctor();
        assertThatThrownBy(() -> journey.saveFinalAssessmentDraft(c.caseId, request)).as("before arrival")
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("CASE_STATE_CONFLICT");
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?", c.caseId);
        em.clear();
        asCoordinator();
        assertThatThrownBy(() -> journey.saveFinalAssessmentDraft(c.caseId, request)).as("not the coordinator")
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        signIn("another-doctor", com.rehletshifaa.authority.domain.Role.CONSULTANT);
        assertThatThrownBy(() -> journey.saveFinalAssessmentDraft(c.caseId, request)).as("not a Consultant off the case")
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThat(count("SELECT COUNT(*) FROM clinical_review_versions WHERE case_id=? AND status='DRAFT'", c.caseId)).isZero();
    }

    /** The fixture's arrived case, taken through the real arrival move so the timeline holds it. */
    private Arrived arrivedThroughTheArrivalMove() {
        Arrived c = arrived("17250.00");
        jdbc.update("UPDATE medical_cases SET status='TRAVEL_COORDINATION' WHERE id=?", c.caseId);
        jdbc.update("INSERT INTO travel_plans(id,case_id,planned_arrival,status,updated_at,version) VALUES(?,?,?,?,?,0)",
                UUID.randomUUID(), c.caseId, Instant.now().plusSeconds(3600), "CONFIRMED", Instant.now());
        // The fixture approves the review directly; the decision itself closes the clinical review item.
        jdbc.update("UPDATE case_tasks SET status='COMPLETED' WHERE case_id=? AND task_type='CLINICAL_REVIEW'", c.caseId);
        em.clear();
        asPatient();
        admissions.patientArrived(c.caseId);
        em.flush(); em.clear();
        return c;
    }

    private String status(UUID reviewId) {
        return jdbc.queryForObject("SELECT status FROM clinical_review_versions WHERE id=?", String.class, reviewId);
    }

    private int openStep(UUID caseId) {
        return count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_FINAL_ASSESSMENT' AND owner_subject=? AND status='OPEN'", caseId, DOCTOR);
    }
}
