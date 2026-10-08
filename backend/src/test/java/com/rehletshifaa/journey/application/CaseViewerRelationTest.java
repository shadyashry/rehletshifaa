package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Who is looking at this case, per case: the patient themselves, someone who represents them, or staff. The portal says
 * "Care for …" from this — never from the account's roles, which cannot tell a person's own case from a relative's.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class CaseViewerRelationTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void thePatientSeesTheirOwnCaseAsSelf() throws Exception {
        UUID caseId = submittedCase("+254700000901", "viewer-a@local.test");
        linkPatient(caseId, "viewer-self-a");
        authenticate("viewer-self-a", Role.PATIENT);
        assertThat(journey.workspace(caseId).actions().viewer()).isEqualTo("SELF");
    }

    @Test void anAuthorisedRepresentativeSeesTheCaseAsRepresentative() throws Exception {
        UUID caseId = submittedCase("+254700000902", "viewer-b@local.test");
        represent(caseId, "viewer-rep-b", null, null);
        authenticate("viewer-rep-b", Role.PATIENT_REPRESENTATIVE);
        assertThat(journey.workspace(caseId).actions().viewer()).isEqualTo("REPRESENTATIVE");
    }

    @Test void aPatientWhoAlsoActsForARelativeSeesEachCaseByItsOwnRelation() throws Exception {
        UUID own = submittedCase("+254700000903", "viewer-c@local.test");
        UUID relative = submittedCase("+254700000904", "viewer-d@local.test");
        linkPatient(own, "viewer-both");
        represent(relative, "viewer-both", null, null);
        authenticate("viewer-both", Role.PATIENT, Role.PATIENT_REPRESENTATIVE);
        assertThat(journey.workspace(own).actions().viewer()).isEqualTo("SELF");
        assertThat(journey.workspace(relative).actions().viewer()).isEqualTo("REPRESENTATIVE");
    }

    @Test void staffSeeTheCaseAsStaff() throws Exception {
        UUID caseId = submittedCase("+254700000905", "viewer-e@local.test");
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, caseId, "coordinator-subject")) journey.claimCoordinatorCase(caseId, "pod");
        em.flush();
        assertThat(journey.workspace(caseId).actions().viewer()).isEqualTo("STAFF");
    }

    // ---------------- fixtures (synthetic data only) ----------------

    private UUID submittedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Viewer", "Patient", "Libya", whatsapp, "Reports", "en", true, null, email, "Africa/Tripoli", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", "coordinator-subject") == 0)
            com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "coordinator-subject", "COORDINATOR", crypto.encrypt("Coordinator One"));
        return created.caseId();
    }

    private void linkPatient(UUID caseId, String subject) {
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", subject, caseId);
    }

    private void represent(UUID caseId, String subject, Instant expiresAt, Instant revokedAt) {
        Instant now = Instant.now();
        jdbc.update("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,expires_at,revoked_at,created_at) "
                        + "SELECT ?,patient_id,?,'PARENT','VIEW,MESSAGE,COORDINATE',?,?,?,? FROM medical_cases WHERE id=?",
                UUID.randomUUID(), subject, now.minusSeconds(60), expiresAt, revokedAt, now, caseId);
    }

    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role... roles) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, roles); }
}
