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
 * The shared fixture of the post-deposit tests (P1-15 admission, P1-16 treatment): a cardiology case with an accepted EGP
 * estimate of 100,000 (fee 15%), the deposit paid, arrival confirmed, Operations and Finance on it, and the helpers that take it
 * through the hospital letter, the voucher, the receipt and the treatment episode.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
abstract class AdmissionFixture {
    static final String OPS = "admission-ops", FINANCE = "admission-finance", DOCTOR = "doctor-subject",
            COORDINATOR = "coordinator-subject", PATIENT = "patient-subject";
    private static final AtomicInteger COUNTER = new AtomicInteger(5000);

    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired AdmissionService admissions; @Autowired AdmissionReadiness readiness; @Autowired SlaPolicy sla;
    @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- fixture ----------

    /** The arrived case (fields, not a record, so the tests that extend this fixture read them as before). */
    static final class Arrived {
        final UUID caseId, estimateVersionId, finalVersionId, reviewId, facilityId;
        Arrived(UUID caseId, UUID estimateVersionId, UUID finalVersionId, UUID reviewId, UUID facilityId) {
            this.caseId = caseId; this.estimateVersionId = estimateVersionId; this.finalVersionId = finalVersionId; this.reviewId = reviewId; this.facilityId = facilityId;
        }
    }

    /** A cardiology case with an accepted EGP estimate of 100,000 (fee 15%), the deposit paid, arrival confirmed, Operations and Finance on it. */
    Arrived arrived(String depositPaidEgp) {
        int n = COUNTER.incrementAndGet();
        var created = cases.create(new CreateCaseRequest("Admit" + letters(n), "Patient", "Kenya", "+2547" + String.format("%08d", n), "Cardiac reports", "en", true, null,
                "adm" + n + "@local.test", "Africa/Nairobi", "cardiology"));
        UUID caseId = created.caseId();
        cases.submit(caseId);
        em.flush(); em.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", PATIENT, caseId);
        signIn(COORDINATOR, Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, COORDINATOR);
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, caseId, COORDINATOR)) journey.claimCoordinatorCase(caseId, "cardiac-pod");
        long v = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Intake complete", v));
        List<UUID> practitioners = jdbc.queryForList("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, DOCTOR);
        UUID practitionerId;
        if (practitioners.isEmpty()) {
            practitionerId = UUID.randomUUID();
            jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                    practitionerId, DOCTOR, "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
            jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                    UUID.randomUUID(), practitionerId, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
        } else practitionerId = practitioners.get(0);
        com.rehletshifaa.clinic.ClinicTestData.declareAll(jdbc);
        UUID service = UUID.randomUUID();
        BigDecimal price = new BigDecimal("100000.00");
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                service, practitionerId, "ADM-" + n, "Angioplasty package", "Procedure", price, true, "admin-subject", Instant.now(), Instant.now());
        var doctorAssignment = journey.assign(caseId, new AssignmentRequest(DOCTOR, "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        asDoctor();
        journey.acceptDoctorAssignment(caseId, doctorAssignment.id(), new AssignmentDecisionRequest(true, null));
        var review = journey.saveClinicalReview(caseId, new ClinicalReviewRequest("Reviewed", "SUITABLE", null, "Imaging", "Recommended", "Alt", "Risks", "Seq", "7 days", "Follow-up"));
        journey.approveClinicalReview(caseId, review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), review.id(), "Angioplasty package", price, "EGP", 0, service, price, price, price, false);
        signIn(COORDINATOR, Role.COORDINATOR);
        var proposal = journey.createProposal(caseId, new ProposalDraftRequest(review.id(), "en", "Plan", "EGP", "Incl", "Excl", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Angioplasty package", BigDecimal.ONE, price, false, 0)), null));
        jdbc.update("UPDATE proposal_versions SET status='ACCEPTED', released_at=? WHERE id=?", java.sql.Timestamp.from(Instant.now()), proposal.versionId());
        UUID deposit = UUID.randomUUID();
        jdbc.update("INSERT INTO deposits(id,case_id,currency,total_egp,status,created_at,version) VALUES(?,?,'EGP',?,'PAID',?,0)", deposit, caseId, new BigDecimal(depositPaidEgp), Instant.now());
        jdbc.update("INSERT INTO payment_events(id,case_id,deposit_id,event_type,amount_egp,currency,provider,status,idempotency_key,occurred_at) VALUES(?,?,?,'PAYMENT_RECORDED',?,'EGP','OFFLINE','RECORDED',?,?)",
                UUID.randomUUID(), caseId, deposit, new BigDecimal(depositPaidEgp), "adm-deposit-" + caseId, Instant.now());
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?", caseId);
        assign(caseId, OPS, "OPERATIONS");
        signIn(FINANCE, Role.FINANCE);
        em.flush(); em.clear();
        return new Arrived(caseId, proposal.versionId(), null, review.id(), facility("admissions@hospital.test"));
    }

    /** As {@link #arrived}, with the Consultant's final assessment at the same 100,000 and a released EGP final quote. */
    Arrived arrivedWithFinalQuote(String depositPaidEgp) {
        Arrived c = arrived(depositPaidEgp);
        UUID service = jdbc.queryForObject("SELECT catalog_service_id FROM clinical_review_cost_estimates WHERE clinical_review_id=?", UUID.class, c.reviewId);
        asDoctor();
        UUID finalReview = journey.saveFinalAssessment(c.caseId, new FinalAssessmentRequest("Scope confirmed on examination", "Standard risks",
                List.of(new CostEstimateItem("Angioplasty package", new BigDecimal("100000.00"), "EGP", service)))).id();
        signIn(COORDINATOR, Role.COORDINATOR);
        var fq = journey.createFinalQuote(c.caseId, new FinalQuoteRequest(finalReview, "EGP", null, "Excl", "Deposit", "Refund", "Consent", null, null));
        journey.releaseFinalQuote(c.caseId, fq.versionId());
        em.flush();
        return new Arrived(c.caseId, c.estimateVersionId, fq.versionId(), finalReview, c.facilityId);
    }

    /** P1-16/P1-17: {@link #arrived} with the final quote accepted, the letter checked, consent, the receipt countersigned and the admission number recorded. */
    Arrived inTreatment() {
        Arrived c = arrivedWithFinalQuote("17250.00");
        admissions.arrivalAttested(c.caseId, Instant.now().minusSeconds(7200), OPS);
        reserveAndCheckLetter(c, "100000.00");
        acceptFinalQuote(c);
        consent(c.caseId);
        asOps();
        UUID receipt = latest(admissions.recordBalance(c.caseId, receipt("97750.00")), "BALANCE_EVIDENCED");
        asFinance();
        admissions.countersign(c.caseId, receipt);
        asOps();
        admissions.recordAdmissionNumber(c.caseId, new AdmissionNumberRequest("ADM-7001"));
        assertThat(caseStatus(c.caseId)).isEqualTo("TREATMENT_IN_PROGRESS");
        return c;
    }

    void reserveAndCheckLetter(Arrived c, String quotedEgp) {
        asOps();
        admissions.reserve(c.caseId, new ReserveAdmissionRequest(c.facilityId, Instant.now().plusSeconds(2 * 86400)));
        var view = admissions.recordLetter(c.caseId, new AdmissionLetterRequest(document(c.caseId), new BigDecimal(quotedEgp), "PF-1"));
        asFinance();
        admissions.decideLetter(c.caseId, new LetterDecisionRequest(latest(view, "FACILITY_ADMISSION_LETTER"), "ACCEPT", null));
    }

    void acceptFinalQuote(Arrived c) {
        asPatient();
        journey.decideProposal(c.caseId, c.finalVersionId, new ProposalDecisionRequest("ACCEPTED", List.of(), null));
        em.flush();
    }

    void consent(UUID caseId) {
        asDoctor();
        journey.captureProcedureConsent(caseId, new ProcedureConsentRequest("Explained; I consent.", "en", "v1", null, null, "Provider consent ref #P115"));
    }

    AdmissionView view(UUID caseId) { asOps(); return admissions.view(caseId); }

    static BalanceReceiptRequest receipt(String egp) { return new BalanceReceiptRequest("RCPT-" + egp, new BigDecimal(egp), Instant.now().minusSeconds(600), "CARD", null, "EGP", new BigDecimal(egp)); }

    /** The newest live row of a kind in the view's trail. */
    static UUID latest(AdmissionView view, String kind) {
        List<EvidenceView> rows = new ArrayList<>(view.evidence().stream().filter(e -> e.kind().equals(kind) && !e.superseded()).toList());
        return rows.get(rows.size() - 1).id();
    }

    UUID facility(String contactEmail) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO facilities(id,name,city,kind,status,accreditation_status,contact_email,settlement_terms,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                id, "Cairo Heart " + id, "Cairo", "HOSPITAL", "ACTIVE", "NONE", contactEmail, "NET_30", "test", Instant.now(), "test", Instant.now());
        return id;
    }

    UUID document(UUID caseId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO medical_documents(id,case_id,object_key,original_file_name,safe_file_name,content_type,size_bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                id, caseId, "cases/" + caseId + "/" + id, "letter.pdf", "letter.pdf", "application/pdf", 2048L, "CLEAN", Instant.now());
        return id;
    }

    void assign(UUID caseId, String subject, String role) {
        jdbc.update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), caseId, subject, role, "PRIMARY", "ACTIVE", "Admission", COORDINATOR, Instant.now(), Instant.now());
    }

    String caseStatus(UUID caseId) { em.flush(); return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    String caseNumber(UUID caseId) { return jdbc.queryForObject("SELECT case_number FROM medical_cases WHERE id=?", String.class, caseId); }
    int count(String sql, Object... args) { em.flush(); Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    static String letters(int n) { StringBuilder b = new StringBuilder(); for (char ch : Integer.toString(n).toCharArray()) b.append((char) ('a' + (ch - '0'))); return b.toString(); }

    void asOps() { signIn(OPS, Role.OPERATIONS); }
    void asFinance() { signIn(FINANCE, Role.FINANCE); }
    void asDoctor() { signIn(DOCTOR, Role.CONSULTANT); }
    void asPatient() { signIn(PATIENT, Role.PATIENT); }
    void asCoordinator() { signIn(COORDINATOR, Role.COORDINATOR); }
    void signIn(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
