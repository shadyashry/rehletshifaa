package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.NewWorkItem;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/** P1-10 (B-05): a released final quote that passes its validity is expired by the scan without moving the macro case. */
@SpringBootTest(properties="spring.task.scheduling.enabled=false")
@AutoConfigureMockMvc
@Transactional
class FinalQuoteExpiryTest {
    @Autowired CaseService cases;
    @Autowired JourneyService journey;
    @Autowired ProposalExpiryService expiry;
    @Autowired StaffWorkService work;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;
    @Autowired EntityManager entityManager;

    private static final AtomicInteger COUNTER = new AtomicInteger(3000);

    @AfterEach void clearSecurity(){SecurityContextHolder.clearContext();}

    record Released(UUID caseId, UUID versionId) {}

    @Test void lapsedFinalQuoteExpiresWithoutMovingTheCaseAndTellsTheCoordinator() {
        Released quote = releasedFinalQuote();
        lapse(quote.versionId());

        expiry.expireReleasedProposals();
        entityManager.flush();

        assertThat(jdbc.queryForObject("SELECT status FROM proposal_versions WHERE id=?", String.class, quote.versionId())).isEqualTo("EXPIRED");
        assertThat(count("SELECT COUNT(*) FROM proposal_share_tokens WHERE proposal_version_id=?", quote.versionId())).isPositive();
        assertThat(count("SELECT COUNT(*) FROM proposal_share_tokens WHERE proposal_version_id=? AND revoked_at IS NULL", quote.versionId())).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, quote.caseId())).isEqualTo("ARRIVAL_CONFIRMED");
        assertThat(jdbc.queryForObject("SELECT owner_subject FROM case_tasks WHERE case_id=? AND task_type='FINAL_QUOTE_EXPIRED' AND status='OPEN'", String.class, quote.caseId()))
            .isEqualTo("coordinator-subject");
        assertThat(jdbc.queryForObject("SELECT owner_role FROM case_tasks WHERE case_id=? AND task_type='FINAL_QUOTE_EXPIRED'", String.class, quote.caseId())).isEqualTo("COORDINATOR");
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='FINAL_QUOTE_EXPIRED' AND case_id=?", quote.caseId())).isOne();
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='PROPOSAL_EXPIRED' AND case_id=?", quote.caseId())).isOne();
    }

    @Test void scanningTwiceOpensOneCoordinatorItem() {
        Released quote = releasedFinalQuote();
        lapse(quote.versionId());

        expiry.expireReleasedProposals();
        expiry.expireReleasedProposals();
        entityManager.flush();

        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='FINAL_QUOTE_EXPIRED'", quote.caseId())).isOne();
        assertThat(count("SELECT COUNT(*) FROM audit_events WHERE event_type='FINAL_QUOTE_EXPIRED' AND case_id=?", quote.caseId())).isOne();
    }

    @Test void expiryClosesAPendingExchangeRateReapproval() {
        Released quote = releasedFinalQuote();
        work.openWorkItem(new NewWorkItem(quote.caseId(), JourneyService.FX_REAPPROVAL_WORK, "Re-approve the final quote's exchange rate", "Test",
            null, "FINANCE", true, null, "SYSTEM", "FINAL_QUOTE_FX_REAPPROVAL", "fx-reapproval:" + quote.versionId() + ":test", false));
        entityManager.flush();
        assertThat(openOfType(quote.caseId(), JourneyService.FX_REAPPROVAL_WORK)).isOne();
        lapse(quote.versionId());

        expiry.expireReleasedProposals();
        entityManager.flush();

        assertThat(openOfType(quote.caseId(), JourneyService.FX_REAPPROVAL_WORK)).isZero();
        assertThat(count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type=? AND status='COMPLETED'", quote.caseId(), JourneyService.FX_REAPPROVAL_WORK)).isOne();
    }

    private void lapse(UUID versionId) {
        jdbc.update("UPDATE proposal_versions SET valid_until=? WHERE id=?", Timestamp.from(Instant.now().minusSeconds(60)), versionId);
    }

    private long openOfType(UUID caseId, String type) {
        return count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type=? AND status IN ('OPEN','IN_PROGRESS')", caseId, type);
    }

    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }

    /** An accepted EGP estimate, arrival, the final assessment at a lower price, then a final quote created and released by the coordinator. */
    private Released releasedFinalQuote() {
        BigDecimal estimatePrice = new BigDecimal("10000.00"), finalPrice = new BigDecimal("8000.00");
        int n = COUNTER.incrementAndGet();
        var created = cases.create(new CreateCaseRequest("Expiry" + Character.toString((char) ('a' + n % 26)) + Character.toString((char) ('a' + (n / 26) % 26)), "Patient", "Kenya", "+2547" + String.format("%08d", n), "Cardiac reports", "en", true, null, "fqe" + n + "@local.test", "Africa/Nairobi", "cardiology"));
        UUID caseId = created.caseId();
        cases.submit(caseId);
        entityManager.flush();
        entityManager.clear();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", "patient-subject", caseId);
        asCoordinator();
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, caseId, "coordinator-subject")) journey.claimCoordinatorCase(caseId, "cardiac-pod");
        long v = journey.workspace(caseId).caseSummary().version();
        journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Intake complete", v));

        List<UUID> practitioners = jdbc.queryForList("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, "doctor-subject");
        UUID practitionerId;
        if (practitioners.isEmpty()) {
            practitionerId = UUID.randomUUID();
            jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", practitionerId, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
            jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), practitionerId, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); com.rehletshifaa.clinic.ClinicTestData.declareAll(jdbc);
        } else {
            practitionerId = practitioners.get(0);
        }
        UUID serviceId = UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", serviceId, practitionerId, "SVC-FQE-" + n, "Service 0", "Consultation", estimatePrice, true, "admin-subject", Instant.now(), Instant.now());
        var doctorAssignment = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        asDoctor();
        journey.acceptDoctorAssignment(caseId, doctorAssignment.id(), new AssignmentDecisionRequest(true, null));
        var review = journey.saveClinicalReview(caseId, new ClinicalReviewRequest("Reviewed", "SUITABLE", null, "Imaging", "Recommended", "Alt", "Risks", "Seq", "7 days", "Follow-up"));
        journey.approveClinicalReview(caseId, review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,catalog_service_id,price_egp,price_egp_min,price_egp_max,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?)", UUID.randomUUID(), review.id(), "Service 0", estimatePrice, "EGP", 0, serviceId, estimatePrice, estimatePrice, estimatePrice, false);
        List<ProposalItemRequest> items = new ArrayList<>();
        items.add(new ProposalItemRequest("MEDICAL", "Service 0", BigDecimal.ONE, estimatePrice, false, 0));
        asCoordinator();
        var estimate = journey.createProposal(caseId, new ProposalDraftRequest(review.id(), "en", "Plan", "EGP", "Incl", "Excl", "Deposit", "Refund", "Consent", Instant.now().plusSeconds(86400), items, null));
        // Skip release/decide: mark the preliminary accepted and the patient arrived.
        jdbc.update("UPDATE proposal_versions SET status='ACCEPTED', released_at=? WHERE id=?", Timestamp.from(Instant.now()), estimate.versionId());
        jdbc.update("UPDATE medical_cases SET status='ARRIVAL_CONFIRMED' WHERE id=?", caseId);

        jdbc.update("UPDATE consultant_service_catalog SET price_egp=? WHERE id=?", finalPrice, serviceId);
        asDoctor();
        UUID finalReviewId = journey.saveFinalAssessment(caseId, new FinalAssessmentRequest("Scope confirmed on examination", "Standard risks",
            List.of(new CostEstimateItem("Service 0", finalPrice, "EGP", serviceId)))).id();
        asCoordinator();
        var finalQuote = journey.createFinalQuote(caseId, new FinalQuoteRequest(finalReviewId, "EGP", null, "Excl", "Deposit", "Refund", "Consent", null, null));
        var released = journey.releaseFinalQuote(caseId, finalQuote.versionId());
        assertThat(released.status()).isEqualTo("RELEASED");
        entityManager.flush();
        return new Released(caseId, finalQuote.versionId());
    }

    private void asCoordinator() { authenticate("coordinator-subject", Role.COORDINATOR); }
    private void asDoctor() { authenticate("doctor-subject", Role.CONSULTANT); }
    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
