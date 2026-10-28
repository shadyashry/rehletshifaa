package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.CostEstimateItem;
import com.rehletshifaa.journey.api.JourneyDtos.CustomerReadiness;
import com.rehletshifaa.journey.api.JourneyDtos.FinalAssessmentRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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

    private int openStep(UUID caseId) {
        return count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_FINAL_ASSESSMENT' AND owner_subject=? AND status='OPEN'", caseId, DOCTOR);
    }
}
