package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.AdmissionDtos.AdmissionLetterRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.LetterDecisionRequest;
import com.rehletshifaa.journey.api.AdmissionDtos.ReserveAdmissionRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CustomerReadiness;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

/**
 * B-5-1: in treatment coordination Operations' step is the hospital file's open act — the reservation, then the admission letter —
 * and only then the travel plan, on the strip and in My work; the travel plan stays open beside the hospital steps. The fixture's
 * patient never went through onboarding, so their readiness is read as complete here.
 */
class HospitalFileStepTest extends AdmissionFixture {
    @MockitoSpyBean CustomerReadinessService patientReadiness;
    @Autowired CaseActionService actions;

    @BeforeEach void patientReady() {
        doAnswer(call -> {
            CustomerReadiness r = (CustomerReadiness) call.callRealMethod();
            return new CustomerReadiness(true, true, r.verifiedChannel(), r.identityRequired(), true, true, true, true,
                    r.depositRequired(), r.depositStatus(), true, List.of(), true, r.updatedAt());
        }).when(patientReadiness).compute(any());
    }

    @Test void operationsReserveTheHospitalThenRecordTheLetterThenArrangeTravel() {
        UUID caseId = inTreatmentCoordination();
        assertStep(caseId, "RESERVE_HOSPITAL");
        assertThat(journey.workspace(caseId).actions().availableActions()).as("the travel plan stays open beside it").contains("UPDATE_TRAVEL_PLAN");

        asOps();
        admissions.reserve(caseId, new ReserveAdmissionRequest(facility("admissions@hospital.test"), Instant.now().plusSeconds(2 * 86400)));
        em.flush(); em.clear();
        assertStep(caseId, "RECORD_ADMISSION_LETTER");

        var view = admissions.recordLetter(caseId, new AdmissionLetterRequest(document(caseId), new BigDecimal("100000.00"), "PF-1"));
        em.flush(); em.clear();
        assertStep(caseId, "UPDATE_TRAVEL_PLAN");

        asFinance();
        admissions.decideLetter(caseId, new LetterDecisionRequest(latest(view, "FACILITY_ADMISSION_LETTER"), "REFUSE", "Wrong package"));
        em.flush(); em.clear();
        assertThat(readiness.hospitalStep(caseId)).as("a refused letter is owed again").contains("RECORD_ADMISSION_LETTER");
        asOps();
        assertThat(journey.workspace(caseId).actions().currentAction().workType()).as("the refusal's own item leads")
                .isEqualTo(AdmissionService.REVISE_LETTER);
        assertThat(openItems(caseId)).as("one Operations item: the refusal's, never the stage step beside it").containsExactly(AdmissionService.REVISE_LETTER);
    }

    @Test void beforeTheDepositIsSettledTheStepIsStillTheTravelPlan() {
        UUID caseId = inTreatmentCoordination();
        jdbc.update("UPDATE medical_cases SET status='ACCEPTED' WHERE id=?", caseId);
        em.clear();
        asOps();
        assertThat(journey.workspace(caseId).actions().currentAction().code()).isEqualTo("UPDATE_TRAVEL_PLAN");
    }

    /** The fixture's case, back in treatment coordination with nothing reserved, and its stage steps synced. */
    private UUID inTreatmentCoordination() {
        UUID caseId = arrived("17250.00").caseId;
        jdbc.update("UPDATE medical_cases SET status='TRAVEL_COORDINATION' WHERE id=?", caseId);
        jdbc.update("UPDATE case_tasks SET status='COMPLETED' WHERE case_id=? AND task_type='CLINICAL_REVIEW'", caseId);
        em.clear();
        asOps();
        actions.syncStageWork(caseId);
        em.flush(); em.clear();
        return caseId;
    }

    private void assertStep(UUID caseId, String code) {
        asOps();
        var step = journey.workspace(caseId).actions().currentAction();
        assertThat(step.code()).isEqualTo(code);
        assertThat(step.kind()).isEqualTo("FOCUS");
        assertThat(openItems(caseId)).as("in Operations' My work").containsExactly(code);
    }

    private List<String> openItems(UUID caseId) {
        em.flush();
        return jdbc.queryForList("SELECT task_type FROM case_tasks WHERE case_id=? AND owner_subject=? AND status='OPEN'", String.class, caseId, OPS);
    }
}
