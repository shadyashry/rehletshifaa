package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.journey.api.DischargeDtos.DepartureRequest;
import com.rehletshifaa.journey.api.DischargeDtos.DischargeBlocker;
import com.rehletshifaa.journey.api.DischargeDtos.DischargeView;
import com.rehletshifaa.journey.api.DischargeDtos.PackItemRequest;
import com.rehletshifaa.journey.api.DischargeDtos.PackItemView;
import com.rehletshifaa.journey.api.DischargeDtos.PatientDischargeView;
import com.rehletshifaa.journey.api.DischargeDtos.ReturnTravelRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CommercialPolicyRequest;
import com.rehletshifaa.journey.api.JourneyDtos.TransitionRequest;
import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-17 session 1 (post-deposit design §5 stage 5, decision D-F; architecture §3.1, §4.1a, §5.4): the discharge gate (the treatment
 * checklist, the pack, the follow-up plan, the final invoice), the typed pack documents and their encrypted facts, the handover
 * letter in English and Arabic, the fit-to-fly window on a return flight, the departure, and the patient's "Going home".
 *
 * <p>Worked example: the P1-15 case (package EGP 100,000, deposit 17,250, cashier receipt 97,750) with one stent placed.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class DischargeServiceTest extends DischargeFixture {
    @Autowired CommercialPolicyService commercialPolicies; @Autowired CaseTransitionPolicy policy;

    @Test void theDischargeGateWaitsForThePackThePlanAndTheFinalInvoiceThenTellsThePatient() {
        Arrived c = inTreatment();
        treated(c);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='DISCHARGE_PACK' AND owner_subject=? AND status='OPEN'", c.caseId, DOCTOR)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_FINAL_INVOICE' AND owner_subject=? AND status='OPEN'", c.caseId, OPS)).isEqualTo(1);
        asOps();
        DischargeView view = discharge.view(c.caseId);
        assertThat(view.blockers()).extracting(DischargeBlocker::code).containsExactly("DISCHARGE_SUMMARY_MISSING", "MEDICATION_LIST_MISSING",
                "IMPLANT_RECORD_MISSING", "FOLLOW_UP_PLAN_MISSING", "FINAL_INVOICE_MISSING");
        assertThat(item(view, "OPERATIVE_NOTE").status()).as("the completed procedure's document is the operative note").isEqualTo("DONE");
        assertThat(item(view, "IMPLANT_RECORD").requiredForDischarge()).as("a stent was placed").isTrue();
        assertThat(item(view, "FIT_TO_FLY").status()).as("owed before a return flight, not before discharge").isEqualTo("BEFORE_RETURN");
        assertThat(view.treatmentChecklist().complete()).isTrue();
        assertThat(view.readyForDischarge()).isFalse();
        assertThatThrownBy(() -> policy.assertAllowed(c.caseId, "TREATMENT_IN_PROGRESS", "DISCHARGED"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("DISCHARGE_NOT_READY");
        asCoordinator();
        long version = jdbc.queryForObject("SELECT version FROM medical_cases WHERE id=?", Long.class, c.caseId);
        assertThatThrownBy(() -> journey.transition(c.caseId, new TransitionRequest("DISCHARGED", "Going home", version)))
                .as("discharge has its own path").isInstanceOf(ApiException.class).extracting("code").isEqualTo("DEDICATED_OPERATION_REQUIRED");

        asFinance();
        assertThatThrownBy(() -> discharge.recordPackItem(c.caseId, summary(c))).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asDoctor();
        assertThatThrownBy(() -> discharge.recordPackItem(c.caseId, new PackItemRequest("DISCHARGE_SUMMARY", document(c.caseId), "CAD", null, null, null, null, null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("DISCHARGE_SUMMARY_DETAILS_REQUIRED");
        assertThatThrownBy(() -> discharge.recordPackItem(c.caseId, new PackItemRequest("MEDICATION_LIST", document(c.caseId), null, null, null, null, List.of(), null, null, null, null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("MEDICATIONS_REQUIRED");
        java.util.UUID otherDocument = document(cases.create(new com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest("Other", "Patient", "Kenya", "+254799001717",
                "Reports", "en", true, null, "other-p117@local.test", "Africa/Nairobi", "cardiology")).caseId());
        asDoctor();
        assertThatThrownBy(() -> discharge.recordPackItem(c.caseId, new PackItemRequest("DISCHARGE_SUMMARY", otherDocument, "CAD", null, null, "Chest pain", null, null, null, null, null)))
                .as("a document of another case").isInstanceOf(ApiException.class).extracting("code").isEqualTo("INVALID_EVIDENCE_DOCUMENT");
        packed(c);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='DISCHARGE_PACK' AND status='OPEN'", c.caseId)).as("the pack is complete").isZero();
        assertThat(caseStatus(c.caseId)).as("the final invoice is still owed").isEqualTo("TREATMENT_IN_PROGRESS");
        assertThat(jdbc.queryForObject("SELECT payload FROM case_evidence WHERE case_id=? AND kind='DISCHARGE_SUMMARY'", String.class, c.caseId))
                .as("the pack's facts are encrypted at rest").doesNotContain("coronary");

        invoiced(c, "100000.00");
        assertThat(caseStatus(c.caseId)).isEqualTo("DISCHARGED");
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='discharge-pack-ready'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECORD_FINAL_INVOICE' AND status='OPEN'", c.caseId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='RECONCILE_INVOICE' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_status_history WHERE case_id=? AND to_status='DISCHARGED'", c.caseId)).isEqualTo(1);
        asPatient();
        assertThat(journey.workspace(c.caseId).actions().currentAction().code()).isEqualTo("GOING_HOME");
        // Finance reads the panel while the invoice is unreconciled, without the clinical facts.
        asFinance();
        DischargeView finance = discharge.view(c.caseId);
        assertThat(item(finance, "DISCHARGE_SUMMARY").status()).isEqualTo("DONE");
        assertThat(item(finance, "DISCHARGE_SUMMARY").diagnosis()).isNull();
        assertThat(finance.finalInvoice().amountEgp()).isEqualByComparingTo("100000");
        assertThat(finance.reconciliationSettled()).isFalse();
    }

    @Test void aReturnFlightNeedsAFitToFlyExaminedWithinTheWindowAndTheDepartureFollowsTheReturn() {
        Arrived c = discharged("100000.00");
        asOps();
        assertThatThrownBy(() -> discharge.confirmDeparture(c.caseId, new DepartureRequest(Instant.now())))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("RETURN_NOT_CONFIRMED");
        assertThatThrownBy(() -> discharge.confirmReturn(c.caseId, new ReturnTravelRequest("FLIGHT", Instant.now().plus(2, ChronoUnit.DAYS), "MS-777")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("FIT_TO_FLY_REQUIRED");
        asDoctor();
        Instant examined = Instant.now().minus(1, ChronoUnit.HOURS);
        assertThatThrownBy(() -> discharge.recordPackItem(c.caseId, fitToFly(c, Instant.now().plus(1, ChronoUnit.DAYS))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("FIT_TO_FLY_IN_FUTURE");
        DischargeView view = discharge.recordPackItem(c.caseId, fitToFly(c, examined));
        assertThat(item(view, "FIT_TO_FLY").validUntil()).isEqualTo(examined.plus(72, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MICROS));
        asOps();
        // D-F: 72 hours by default, so a flight 80 hours after the examination needs a new certificate.
        assertThatThrownBy(() -> discharge.confirmReturn(c.caseId, new ReturnTravelRequest("FLIGHT", examined.plus(80, ChronoUnit.HOURS), "MS-777")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("FIT_TO_FLY_NOT_VALID");
        assertThatThrownBy(() -> discharge.confirmReturn(c.caseId, new ReturnTravelRequest("FLIGHT", examined.minus(2, ChronoUnit.HOURS), "MS-777")))
                .as("a flight before the examination").isInstanceOf(ApiException.class).extracting("code").isEqualTo("FIT_TO_FLY_NOT_VALID");
        // The Finance Manager widens the care area's window to 96 hours: the same flight is now covered.
        signIn("finance-manager-subject", Role.FINANCE_MANAGER);
        assertThatThrownBy(() -> commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"), null, null, null, null, null, 12)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("FIT_TO_FLY_WINDOW_INVALID");
        assertThat(commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"), null, null, null, null, null, 96)).fitToFlyHours())
                .isEqualTo(96);
        assertThat(commercialPolicies.configure(new CommercialPolicyRequest("Cardiology", "cardiology", new BigDecimal("0.15"))).fitToFlyHours())
                .as("left out, the window carries over").isEqualTo(96);
        asOps();
        view = discharge.confirmReturn(c.caseId, new ReturnTravelRequest("FLIGHT", examined.plus(80, ChronoUnit.HOURS), "MS-777"));
        assertThat(view.returnTravel().mode()).isEqualTo("FLIGHT");
        assertThat(view.returnTravel().fitToFlyEvidenceId()).isEqualTo(item(view, "FIT_TO_FLY").evidenceId());
        assertThat(view.fitToFlyHours()).isEqualTo(96);
        assertThatThrownBy(() -> discharge.confirmDeparture(c.caseId, new DepartureRequest(Instant.now().plus(1, ChronoUnit.DAYS))))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("DEPARTURE_IN_FUTURE");
        view = discharge.confirmDeparture(c.caseId, new DepartureRequest(Instant.now()));
        assertThat(view.departedAt()).isNotNull();
        assertThatThrownBy(() -> discharge.confirmDeparture(c.caseId, new DepartureRequest(Instant.now())))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ALREADY_DEPARTED");
        assertThatThrownBy(() -> discharge.confirmReturn(c.caseId, new ReturnTravelRequest("GROUND", Instant.now(), null)))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("ALREADY_DEPARTED");
        asPatient();
        PatientDischargeView mine = discharge.patientView(c.caseId);
        assertThat(mine.returnMode()).isEqualTo("FLIGHT");
        assertThat(mine.departed()).isTrue();
    }

    @Test void aGroundReturnNeedsNoFitToFly() {
        Arrived c = discharged("100000.00");
        asOps();
        assertThat(discharge.confirmReturn(c.caseId, new ReturnTravelRequest("GROUND", Instant.now().plus(1, ChronoUnit.DAYS), "Car to Aswan")).returnTravel().mode())
                .isEqualTo("GROUND");
    }

    @Test void theHandoverLetterIsWrittenInEnglishAndArabicFromThePackAndThePatientGoesHomeWithIt() {
        Arrived c = inTreatment();
        treated(c);
        asDoctor();
        assertThatThrownBy(() -> discharge.generateHandoverLetter(c.caseId)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("HANDOVER_PACK_INCOMPLETE");
        packed(c);
        DischargeView view = discharge.generateHandoverLetter(c.caseId);
        assertThat(view.handoverLetter().english()).contains("Single-vessel coronary artery disease", "Clopidogrel — 75 mg, once a day, for 12 months",
                "Drug-eluting coronary stent 3.0 x 18 mm (Example Medical) — LOT-4411", "Warning signs", "Chest pain, shortness of breath", "a video consultation",
                "Operative note: on file (reference OP-17)", caseNumber(c.caseId));
        assertThat(view.handoverLetter().arabic()).contains("التشخيص", "Single-vessel coronary artery disease", "علامات الخطر", "استشارة مرئية");
        assertThat(jdbc.queryForObject("SELECT payload FROM case_evidence WHERE case_id=? AND kind='HANDOVER_LETTER'", String.class, c.caseId)).doesNotContain("Clopidogrel");
        // Generating again replaces it: one live letter.
        discharge.generateHandoverLetter(c.caseId);
        assertThat(count("SELECT COUNT(*) FROM case_evidence e WHERE e.case_id=? AND e.kind='HANDOVER_LETTER' AND NOT EXISTS (SELECT 1 FROM case_evidence s WHERE s.supersedes_id=e.id)", c.caseId))
                .isEqualTo(1);

        asPatient();
        assertThat(discharge.patientView(c.caseId).discharged()).as("nothing to show before discharge").isFalse();
        invoiced(c, "100000.00");
        asPatient();
        PatientDischargeView mine = discharge.patientView(c.caseId);
        assertThat(mine.discharged()).isTrue();
        assertThat(mine.documents()).extracting(d -> d.kind()).containsExactlyInAnyOrder("DISCHARGE_SUMMARY", "MEDICATION_LIST", "OPERATIVE_NOTE", "IMPLANT_RECORD");
        assertThat(mine.medications()).extracting(m -> m.name()).containsExactly("Clopidogrel");
        assertThat(mine.warningSigns()).contains("Chest pain");
        assertThat(mine.followUpMode()).isEqualTo("VIDEO");
        assertThat(mine.handoverLetter().arabic()).contains("التشخيص");
    }

    @Test void theTreatmentChecklistHoldsDischargeUntilAnInterimBillIsCountersigned() {
        Arrived c = inTreatment();
        treated(c);
        packed(c);
        asOps();
        java.util.UUID bill = interimBills.record(c.caseId, new com.rehletshifaa.journey.api.TreatmentDtos.InterimBillRequest(document(c.caseId), "IB-1",
                new BigDecimal("60000.00"), Instant.now().minusSeconds(3600))).interimBills().get(0).id();
        invoiced(c, "100000.00");
        assertThat(caseStatus(c.caseId)).isEqualTo("TREATMENT_IN_PROGRESS");
        asOps();
        assertThat(discharge.view(c.caseId).blockers()).extracting(DischargeBlocker::code).containsExactly("TREATMENT_CHECKLIST_INCOMPLETE");
        asFinance();
        interimBills.countersign(c.caseId, bill);
        assertThat(caseStatus(c.caseId)).as("the countersignature completes the checklist and the gate passes").isEqualTo("DISCHARGED");
    }

    @Autowired InterimBillService interimBills;

    private static PackItemView item(DischargeView view, String kind) {
        return view.pack().stream().filter(i -> i.kind().equals(kind)).findFirst().orElseThrow();
    }

    private PackItemRequest fitToFly(Arrived c, Instant examinedAt) {
        return new PackItemRequest("FIT_TO_FLY", document(c.caseId), null, null, null, null, null, null, examinedAt, null, null);
    }
}
