package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.AdmissionDtos.*;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-15 session 1 (post-deposit design §5 stages 1-3, §6 rules 2 and 3; architecture §5.1 and §14; owner decisions D-B, D-C,
 * D-D 2026-10-15): the hospital admission, the platform's voucher with its frozen money split, the cashier receipt countersigned
 * by Finance, the platform fee balance, pay to admit and its emergency override, and the one path ARRIVAL_CONFIRMED ->
 * ADMISSION_READY -> TREATMENT_IN_PROGRESS.
 *
 * <p>Worked example throughout: provider package EGP 100,000, platform fee 15% = 15,000, deposit 15% of 115,000 = 17,250.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class AdmissionServiceTest extends AdmissionFixture {
    // ---------- the voucher (D-B) ----------

    @Test void aFinalQuoteAcceptedAfterTheLetterIsCheckedIssuesTheVoucherWithTheFrozenSplit() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        reserveAndCheckLetter(c, "100000.00");
        assertThat(count("SELECT COUNT(*) FROM admission_vouchers WHERE case_id=?", c.caseId)).as("no voucher before the quote is accepted").isZero();

        acceptFinalQuote(c);
        Map<String, Object> v = jdbc.queryForMap("SELECT * FROM admission_vouchers WHERE case_id=? AND status='ISSUED'", c.caseId);
        assertThat(v.get("VOUCHER_NUMBER")).isEqualTo("RS-V-" + caseNumber(c.caseId).substring(3) + "-1");
        assertThat(v.get("PROPOSAL_VERSION_ID")).isEqualTo(c.finalVersionId);
        assertThat((BigDecimal) v.get("PACKAGE_TOTAL_EGP")).isEqualByComparingTo("100000");
        assertThat((BigDecimal) v.get("PLATFORM_FEE_EGP")).isEqualByComparingTo("15000");
        assertThat((BigDecimal) v.get("DEPOSIT_PAID_EGP")).isEqualByComparingTo("17250");
        assertThat((BigDecimal) v.get("DEPOSIT_CREDIT_EGP")).isEqualByComparingTo("2250");
        assertThat((BigDecimal) v.get("PATIENT_PAYS_AT_FACILITY_EGP")).isEqualByComparingTo("97750");
        assertThat((BigDecimal) v.get("FEE_BALANCE_EGP")).isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("SELECT status FROM facility_admissions WHERE case_id=?", String.class, c.caseId)).isEqualTo("CONFIRMED");
        // The hospital gets the voucher by email; the patient is told to pay at the cashier (a link to their case page, nothing more).
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='admission-voucher-facility' AND channel='EMAIL'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='admission-balance-due'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='ADMISSION_VOUCHER_ISSUED'", c.caseId)).isEqualTo(1);
        // The patient's view: the voucher number and what to pay at the hospital, in EGP and at the frozen rate.
        asPatient();
        PatientAdmissionView mine = admissions.patientView(c.caseId);
        assertThat(mine.voucherNumber()).isEqualTo(v.get("VOUCHER_NUMBER"));
        assertThat(mine.payAtFacilityEgp()).isEqualByComparingTo("97750");
        assertThat(mine.balanceState()).isEqualTo("DUE");
        assertThat(mine.cleared()).isFalse();
        // Replaying the acceptance event changes nothing: same quote, same deposit, same hospital is the same voucher.
        admissions.onFinalQuoteAccepted(c.caseId);
        assertThat(count("SELECT COUNT(*) FROM admission_vouchers WHERE case_id=?", c.caseId)).isEqualTo(1);
    }

    @Test void aNewHospitalSupersedesTheVoucherAndItsLetterIsCheckedAgain() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(facility("other@hospital.test"), Instant.now().plusSeconds(3 * 86400)));
        assertThat(jdbc.queryForObject("SELECT status FROM admission_vouchers WHERE case_id=? AND revision=1", String.class, c.caseId)).isEqualTo("SUPERSEDED");
        assertThat(readiness.currentVoucher(c.caseId)).isEmpty();
        // The letter on file was the other hospital's: a new one is recorded, checked, and the voucher comes back as revision 2.
        var letter = admissions.recordLetter(c.caseId, new AdmissionLetterRequest(document(c.caseId), new BigDecimal("100000.00"), "PF-2"));
        asFinance();
        admissions.decideLetter(c.caseId, new LetterDecisionRequest(latest(letter, "FACILITY_ADMISSION_LETTER"), "ACCEPT", null));
        assertThat(jdbc.queryForObject("SELECT voucher_number FROM admission_vouchers WHERE case_id=? AND status='ISSUED'", String.class, c.caseId)).endsWith("-2");
    }

    @Test void aCaseWithoutAFinalQuoteGetsItsVoucherFromOperationsAgainstTheAcceptedEstimate() {
        Arrived c = arrived("17250.00");
        reserveAndCheckLetter(c, "100000.00");
        assertThat(readiness.currentVoucher(c.caseId)).as("never issued on its own from an estimate").isEmpty();
        asOps();
        AdmissionView view = admissions.issueVoucher(c.caseId);
        assertThat(view.voucher().proposalVersionId()).isEqualTo(c.estimateVersionId);
        assertThat(view.voucher().patientPaysAtFacilityEgp()).isEqualByComparingTo("97750");
    }

    @Test void aVoucherThatCannotBeIssuedNeverUndoesThePatientsAcceptanceAndBecomesFinanceWork() {
        Arrived c = arrivedWithFinalQuote("120000.00"); // more than the package and the fee together (115,000)
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, c.finalVersionId)).isEqualTo("ACCEPTED");
        assertThat(readiness.currentVoucher(c.caseId)).isEmpty();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='ADMISSION_VOUCHER_BLOCKED' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='ADMISSION_VOUCHER_BLOCKED' AND reason='DEPOSIT_EXCEEDS_PACKAGE'", c.caseId)).isEqualTo(1);
        asOps();
        assertThatThrownBy(() -> admissions.issueVoucher(c.caseId)).as("by hand it is refused with the reason")
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("DEPOSIT_EXCEEDS_PACKAGE");
    }

    // ---------- the hospital's letter and the price check ----------

    @Test void aPriceAboveTheEstimateIsAVarianceThatHoldsTravelUntilFinanceAcceptsItWithAReason() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(86400)));
        var view = admissions.recordLetter(c.caseId, new AdmissionLetterRequest(document(c.caseId), new BigDecimal("120000.00"), "PF-9"));
        assertThat(view.letterCheck()).isEqualTo("VARIANCE_OPEN");
        assertThat(admissions.priceVarianceOpen(c.caseId)).isTrue();
        // Due in four working hours (the priority is derived from that date as it nears, StaffWorkService.derivePriority).
        Instant due = jdbc.queryForObject("SELECT due_at FROM case_tasks WHERE case_id=? AND task_type='PRICE_VARIANCE' AND status='OPEN'", java.sql.Timestamp.class, c.caseId).toInstant();
        assertThat(due).isAfter(Instant.now().minusSeconds(60)).isBeforeOrEqualTo(sla.plusWorkingHours(Instant.now(), 4));
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='PRICE_VARIANCE' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        UUID letterId = latest(view, "FACILITY_ADMISSION_LETTER");
        asFinance();
        assertThatThrownBy(() -> admissions.decideLetter(c.caseId, new LetterDecisionRequest(letterId, "ACCEPT", " ")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("VARIANCE_REASON_REQUIRED");
        view = admissions.decideLetter(c.caseId, new LetterDecisionRequest(letterId, "ACCEPT", "Implant price rose; the patient was told by the coordinator"));
        assertThat(view.letterCheck()).isEqualTo("VARIANCE_ACCEPTED");
        assertThat(admissions.priceVarianceOpen(c.caseId)).isFalse();
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='PRICE_VARIANCE_CHECK' AND reference='ACCEPTED'", c.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT payload FROM case_evidence WHERE case_id=? AND kind='PRICE_VARIANCE_CHECK'", String.class, c.caseId))
                .as("the reason is encrypted at rest").doesNotContain("Implant");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='PRICE_VARIANCE' AND status='OPEN'", c.caseId)).isZero();
    }

    @Test void aRefusedLetterGoesBackToOperations() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(86400)));
        var view = admissions.recordLetter(c.caseId, new AdmissionLetterRequest(document(c.caseId), new BigDecimal("90000.00"), null));
        assertThat(view.letterCheck()).isEqualTo("CHECK_PENDING");
        asFinance();
        view = admissions.decideLetter(c.caseId, new LetterDecisionRequest(latest(view, "FACILITY_ADMISSION_LETTER"), "REFUSE", "Not on hospital letterhead"));
        assertThat(view.letterCheck()).isEqualTo("REFUSED");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='REVISE_ADMISSION_LETTER' AND owner_subject=? AND status='OPEN'", c.caseId, OPS)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='CHECK_PROFORMA' AND status='OPEN'", c.caseId)).isZero();
        asOps();
        admissions.recordLetter(c.caseId, new AdmissionLetterRequest(document(c.caseId), new BigDecimal("90000.00"), "PF-3"));
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='REVISE_ADMISSION_LETTER' AND status='OPEN'", c.caseId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='FACILITY_ADMISSION_LETTER' AND supersedes_id IS NOT NULL", c.caseId))
                .as("the new letter corrects the old one, both stay on the trail").isEqualTo(1);
    }

    // ---------- the balance and ADMISSION_READY (D-C, D-D) ----------

    @Test void theCountersignedReceiptClearsThePatientForAdmissionAndTheAdmissionNumberOpensTreatment() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        consent(c.caseId);
        assertThat(caseStatus(c.caseId)).as("consent and the quote are not enough").isEqualTo("ARRIVAL_CONFIRMED");
        assertThat(readiness.admissionBlockers(c.caseId)).containsExactly(AdmissionReadiness.BALANCE_NOT_EVIDENCED);

        asOps();
        assertThatThrownBy(() -> admissions.recordBalance(c.caseId, receipt("97750.01")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("AMOUNT_EXCEEDS_BALANCE");
        UUID first = latest(admissions.recordBalance(c.caseId, receipt("50000.00")), "BALANCE_EVIDENCED");
        UUID second = latest(admissions.recordBalance(c.caseId, receipt("47750.00")), "BALANCE_EVIDENCED");
        assertThatThrownBy(() -> admissions.recordBalance(c.caseId, receipt("1.00")))
                .as("recorded receipts count against the balance before Finance signs them").isInstanceOf(ApiException.class).extracting("code").isEqualTo("AMOUNT_EXCEEDS_BALANCE");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_BALANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        asPatient();
        assertThat(admissions.patientView(c.caseId).balanceState()).isEqualTo("CHECKING");
        // Operations cannot countersign (no permission); Finance can, with a fresh sign-in.
        asOps();
        assertThatThrownBy(() -> admissions.countersign(c.caseId, first)).isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asFinance();
        admissions.countersign(c.caseId, first);
        assertThat(caseStatus(c.caseId)).as("half the balance is not the balance").isEqualTo("ARRIVAL_CONFIRMED");
        assertThatThrownBy(() -> admissions.countersign(c.caseId, first)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("EVIDENCE_ALREADY_COUNTERSIGNED");
        admissions.countersign(c.caseId, second);

        assertThat(caseStatus(c.caseId)).isEqualTo("ADMISSION_READY");
        assertThat(count("SELECT COUNT(*) FROM case_status_history WHERE case_id=? AND from_status='ARRIVAL_CONFIRMED' AND to_status='ADMISSION_READY'", c.caseId)).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM notification_outbox WHERE template_key='cleared-for-admission'")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COUNTERSIGN_BALANCE' AND status='OPEN'", c.caseId)).isZero();
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, c.caseId)).isEqualTo("HOSPITAL");
        asPatient();
        assertThat(admissions.patientView(c.caseId).cleared()).isTrue();
        assertThat(admissions.patientView(c.caseId).balanceState()).isEqualTo("PAID");

        // Treatment opens with the hospital's admission number, never without it.
        asDoctor();
        assertThatThrownBy(() -> journey.treatment(c.caseId, episode(c, null))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("ADMISSION_NUMBER_REQUIRED");
        assertThat(caseStatus(c.caseId)).isEqualTo("ADMISSION_READY");
        journey.treatment(c.caseId, episode(c, "ADM-778812"));
        assertThat(caseStatus(c.caseId)).isEqualTo("TREATMENT_IN_PROGRESS");
        assertThat(jdbc.queryForObject("SELECT reference FROM case_evidence WHERE case_id=? AND kind='ADMISSION_NUMBER'", String.class, c.caseId)).isEqualTo("ADM-778812");
        assertThat(jdbc.queryForObject("SELECT status FROM facility_admissions WHERE case_id=?", String.class, c.caseId)).isEqualTo("ADMITTED");
    }

    @Test void nobodyCountersignsTheirOwnReceipt() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        String both = "admission-ops-and-finance";
        assign(c.caseId, both, "OPERATIONS");
        signIn(both, Role.OPERATIONS, Role.FINANCE);
        UUID mine = latest(admissions.recordBalance(c.caseId, receipt("97750.00")), "BALANCE_EVIDENCED");
        assertThatThrownBy(() -> admissions.countersign(c.caseId, mine)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("SELF_COUNTERSIGN_REFUSED");
        asFinance();
        admissions.countersign(c.caseId, mine);
        assertThat(jdbc.queryForObject("SELECT countersigned_by FROM case_evidence WHERE id=?", String.class, mine)).isEqualTo(FINANCE);
    }

    @Test void aCappedDepositLeavesAFeeBalanceThatFinanceRecordsBeforeAdmission() {
        Arrived c = arrivedWithFinalQuote("10000.00");
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        consent(c.caseId);
        AdmissionView view = view(c.caseId);
        assertThat(view.voucher().depositCreditEgp()).isEqualByComparingTo("0");
        assertThat(view.voucher().patientPaysAtFacilityEgp()).isEqualByComparingTo("100000");
        assertThat(view.voucher().feeBalanceEgp()).isEqualByComparingTo("5000");
        asOps();
        UUID receipt = latest(admissions.recordBalance(c.caseId, receipt("100000.00")), "BALANCE_EVIDENCED");
        asFinance();
        admissions.countersign(c.caseId, receipt);
        assertThat(caseStatus(c.caseId)).as("the fee balance is still owed to the platform").isEqualTo("ARRIVAL_CONFIRMED");
        assertThat(readiness.admissionBlockers(c.caseId)).containsExactly(AdmissionReadiness.FEE_BALANCE_DUE);
        assertThatThrownBy(() -> admissions.recordFeeBalance(c.caseId, new FeeBalanceRequest("FT-1", new BigDecimal("5000.01"), Instant.now())))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("AMOUNT_EXCEEDS_BALANCE");
        admissions.recordFeeBalance(c.caseId, new FeeBalanceRequest("FT-2", new BigDecimal("5000.00"), Instant.now()));
        assertThat(caseStatus(c.caseId)).isEqualTo("ADMISSION_READY");
    }

    // ---------- pay to admit and the emergency path ----------

    @Test void payToAdmitRefusesTheFirstEpisodeAndTheConsultantsEmergencyAdmissionOpensItWithAFinanceReview() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        acceptFinalQuote(c);
        consent(c.caseId);
        asDoctor();
        assertThatThrownBy(() -> journey.treatment(c.caseId, episode(c, "ADM-1"))).isInstanceOf(ApiException.class).extracting("code").isEqualTo("BALANCE_EVIDENCE_REQUIRED");
        assertThat(caseStatus(c.caseId)).isEqualTo("ARRIVAL_CONFIRMED");
        assertThatThrownBy(() -> admissions.emergencyAdmission(c.caseId, new EmergencyAdmissionRequest(" ")))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("OVERRIDE_REASON_REQUIRED");
        // Operations cannot record a clinical emergency.
        asOps();
        assertThatThrownBy(() -> admissions.emergencyAdmission(c.caseId, new EmergencyAdmissionRequest("Bleeding")))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);

        asDoctor();
        admissions.emergencyAdmission(c.caseId, new EmergencyAdmissionRequest("Acute bleeding — admitted before the cashier opened"));
        assertThat(caseStatus(c.caseId)).as("consent and quote on file, the override stands in for the balance").isEqualTo("ADMISSION_READY");
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='EMERGENCY_ADMISSION_REVIEW' AND owner_role='FINANCE' AND status='OPEN'", c.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT payload FROM case_evidence WHERE case_id=? AND kind='EMERGENCY_ADMISSION_OVERRIDE'", String.class, c.caseId)).doesNotContain("bleeding");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND reason LIKE '%bleeding%'", c.caseId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE case_id=? AND event_type='EMERGENCY_ADMISSION_OVERRIDE'", c.caseId)).isEqualTo(1);
        journey.treatment(c.caseId, episode(c, "ADM-2"));
        assertThat(caseStatus(c.caseId)).isEqualTo("TREATMENT_IN_PROGRESS");
        // The Finance review outlives the case's other work.
        assertThat(StaffWorkService.SURVIVES_EXIT).contains("EMERGENCY_ADMISSION_REVIEW");
    }

    @Test void theEmergencyAdmissionNeverStandsInForConsentOrTheFinalQuote() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        asDoctor();
        admissions.emergencyAdmission(c.caseId, new EmergencyAdmissionRequest("Unstable on arrival"));
        assertThat(caseStatus(c.caseId)).isEqualTo("ARRIVAL_CONFIRMED");
        assertThat(readiness.admissionBlockers(c.caseId)).containsExactly(AdmissionReadiness.FINAL_QUOTE_NOT_ACCEPTED, AdmissionReadiness.PROCEDURE_CONSENT_MISSING);
        acceptFinalQuote(c);
        assertThat(caseStatus(c.caseId)).isEqualTo("ARRIVAL_CONFIRMED");
        consent(c.caseId);
        assertThat(caseStatus(c.caseId)).as("the last missing piece moves it").isEqualTo("ADMISSION_READY");
    }

    // ---------- arrival and authority ----------

    @Test void thePatientConfirmsTheirArrivalOnceTravelIsConfirmed() {
        Arrived c = arrived("17250.00");
        jdbc.update("UPDATE medical_cases SET status='TRAVEL_COORDINATION' WHERE id=?", c.caseId);
        asPatient();
        assertThatThrownBy(() -> admissions.patientArrived(c.caseId)).isInstanceOf(ApiException.class).extracting("code").isEqualTo("ARRIVAL_NOT_EXPECTED");
        assertThat(readiness.arrivalDue(c.caseId)).isFalse();
        jdbc.update("INSERT INTO travel_plans(id,case_id,planned_arrival,status,updated_at,version) VALUES(?,?,?,?,?,0)",
                UUID.randomUUID(), c.caseId, Instant.now().plusSeconds(3600), "CONFIRMED", Instant.now());
        em.clear();
        assertThat(readiness.arrivalDue(c.caseId)).as("arrival within a day: the patient is asked").isTrue();
        admissions.patientArrived(c.caseId);
        assertThat(caseStatus(c.caseId)).isEqualTo("ARRIVAL_CONFIRMED");
        assertThat(jdbc.queryForObject("SELECT recorded_role FROM case_evidence WHERE case_id=? AND kind='PATIENT_ARRIVED'", String.class, c.caseId)).isEqualTo("PATIENT");
        admissions.patientArrived(c.caseId); // said twice: nothing more
        assertThat(count("SELECT COUNT(*) FROM case_evidence WHERE case_id=? AND kind='PATIENT_ARRIVED'", c.caseId)).isEqualTo(1);
    }

    @Test void financeReadsAndSignsTheMoneyOfAnOpenAdmissionButNeverReservesIt() {
        Arrived c = arrived("17250.00");
        asFinance();
        assertThatThrownBy(() -> admissions.view(c.caseId)).as("no admission, no assignment: not Finance's case").isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        assertThatThrownBy(() -> admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(86400))))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(86400)));
        asFinance();
        assertThat(admissions.view(c.caseId).admissionStatus()).as("the open admission is Finance's to read").isEqualTo("RESERVED");
        // An Operations person not on the case cannot reserve it.
        signIn("admission-other-ops", Role.OPERATIONS);
        assertThatThrownBy(() -> admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(86400))))
                .isInstanceOf(ApiException.class).extracting("status").isEqualTo(403);
    }

    @Test void aCancelledCaseCancelsItsAdmission() {
        Arrived c = arrived("17250.00");
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(86400)));
        asCoordinator();
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) "
                + "SELECT ?,?,?,'COORDINATOR','PRIMARY','ACTIVE','Owner','system',?,?,0 WHERE NOT EXISTS (SELECT 1 FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE')",
                UUID.randomUUID(), c.caseId, COORDINATOR, Instant.now(), Instant.now(), c.caseId);
        long version = jdbc.queryForObject("SELECT version FROM medical_cases WHERE id=?", Long.class, c.caseId);
        journey.transition(c.caseId, new TransitionRequest("CANCELLED", "Hospital has no bed", version, "HOSPITAL_REFUSED"));
        assertThat(jdbc.queryForObject("SELECT status FROM facility_admissions WHERE case_id=?", String.class, c.caseId)).isEqualTo("CANCELLED");
    }
}
