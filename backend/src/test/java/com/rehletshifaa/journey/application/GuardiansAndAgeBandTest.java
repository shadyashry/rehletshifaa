package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.api.CaseDtos.RepresentativeContact;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.BlockerView;
import com.rehletshifaa.journey.api.JourneyDtos.OnboardingSubjectRequest;
import com.rehletshifaa.journey.api.SafetyDtos.GuardianView;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.WorkforceTestData;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1-13 (review 2026-10-14, A-05): the age band captured at intake, the GUARDIAN delegation with its evidence and its own
 * consent type. A minor is onboarded by a guardian only; a guardian counts once a coordinator has verified the evidence.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class GuardiansAndAgeBandTest {
    static final String COORDINATOR = "guardian-coordinator", PARENT = "guardian-parent", SIBLING = "guardian-sibling", CONSULTANT = "guardian-consultant";

    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired OnboardingService onboarding; @Autowired GuardianService guardians;
    @Autowired CustomerReadinessService readiness; @Autowired CaseActionService caseActions; @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- age band ----------

    @Test void intakeStatesTheAgeBandStaffSeeAndThePatientDoesNot() throws Exception {
        UUID childCase = childCase("+254700002001", "AGE_12_17");
        UUID unstated = adultCase("+254700002002");
        assertThat(jdbc.queryForObject("SELECT age_band FROM medical_cases WHERE id=?", String.class, childCase)).isEqualTo("AGE_12_17");
        assertThat(jdbc.queryForObject("SELECT age_band FROM medical_cases WHERE id=?", String.class, unstated)).isNull();
        authenticate(COORDINATOR, Role.COORDINATOR);
        assertThat(journey.workspace(childCase).caseSummary().ageBand()).isEqualTo("AGE_12_17");
        assertThat(journey.workspace(unstated).caseSummary().ageBand()).isNull();
    }

    @Test void aCoordinatorRecordsAndCorrectsTheBandAndNobodyElseCan() throws Exception {
        UUID caseId = adultCase("+254700002003");
        authenticate(CONSULTANT, Role.CONSULTANT);
        assertThatThrownBy(() -> guardians.recordAgeBand(caseId, "UNDER_12"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isIn(401, 403));
        authenticate(COORDINATOR, Role.COORDINATOR);
        var view = guardians.recordAgeBand(caseId, "UNDER_12");
        em.flush();
        assertThat(view.minor()).isTrue();
        assertThat(jdbc.queryForObject("SELECT age_band FROM medical_cases WHERE id=?", String.class, caseId)).isEqualTo("UNDER_12");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='CASE_AGE_BAND_RECORDED' AND case_id=? AND reason='null -> UNDER_12'", caseId)).isEqualTo(1);
        assertThat(guardians.recordAgeBand(caseId, "AGE_18_64").minor()).isFalse();
    }

    // ---------- minors are onboarded by a guardian ----------

    @Test void aMinorsOnboardingStartsAsAGuardianAndNobodyElseMayBeChosen() throws Exception {
        UUID childCase = childCase("+254700002004", "UNDER_12"), adult = adultCase("+254700002005");
        onboarding.createForAcknowledgement(childCase, null); onboarding.createForAcknowledgement(adult, null); em.flush();
        assertThat(subjectType(childCase)).isEqualTo("GUARDIAN");
        assertThat(subjectType(adult)).isNull();
        jdbc.update("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,created_at) "
                + "SELECT ?,patient_id,?,'SIBLING','VIEW',?,? FROM medical_cases WHERE id=?", UUID.randomUUID(), SIBLING, Instant.now().minusSeconds(60), Instant.now(), childCase);
        authenticate(SIBLING, Role.PATIENT_REPRESENTATIVE);
        for (String other : List.of("PATIENT", "REPRESENTATIVE", "PAYER"))
            assertThatThrownBy(() -> onboarding.setSubject(childCase, new OnboardingSubjectRequest(other, "Sibling", null, null, version(childCase))))
                    .as(other).isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("MINOR_REQUIRES_GUARDIAN"));
        assertThat(codes(childCase)).contains("GUARDIAN_AUTH_MISSING");
    }

    @Test void recordingAMinorBandMovesAnOpenOnboardingToGuardianAndACompletedOneIsBlocked() throws Exception {
        UUID open = adultCase("+254700002006"), done = adultCase("+254700002007");
        onboarding.createForAcknowledgement(open, null); onboarding.createForAcknowledgement(done, null); em.flush();
        jdbc.update("UPDATE patient_onboardings SET subject_type='PATIENT', state='COMPLETED' WHERE case_id=?", done);
        authenticate(COORDINATOR, Role.COORDINATOR);
        guardians.recordAgeBand(open, "AGE_12_17"); guardians.recordAgeBand(done, "AGE_12_17"); em.flush();
        assertThat(subjectType(open)).isEqualTo("GUARDIAN");
        assertThat(subjectType(done)).as("a completed onboarding is not rewritten").isEqualTo("PATIENT");
        assertThat(codes(done)).contains("MINOR_REQUIRES_GUARDIAN");
    }

    // ---------- the guardian's authority is evidence, verified by a coordinator ----------

    @Test void aGuardianCountsOnlyOnceTheirEvidenceIsVerifiedAndTheirConsentIsTheirOwn() throws Exception {
        UUID caseId = childCase("+254700002008", "AGE_12_17");
        onboarding.createForAcknowledgement(caseId, null); em.flush();
        UUID patientId = patientOf(caseId);
        // The account that sent the case for a child becomes a guardian when it is the child's parent.
        guardians.grantAtIntake(caseId, patientId, PARENT, "PARENT", Instant.now()); em.flush();
        assertThat(jdbc.queryForMap("SELECT delegation_type, legal_basis FROM patient_representatives WHERE representative_subject=?", PARENT))
                .containsEntry("DELEGATION_TYPE", "GUARDIAN").containsEntry("LEGAL_BASIS", "PARENT");
        assertThat(codes(caseId)).contains("GUARDIAN_EVIDENCE_MISSING").doesNotContain("REPRESENTATIVE_AUTH_MISSING", "GUARDIAN_AUTH_MISSING");
        assertThat(readiness.requiredConsentTypes("GUARDIAN")).contains("GUARDIAN_AUTHORIZATION").doesNotContain("REPRESENTATIVE_AUTHORIZATION");
        assertThat(readiness.requiredConsentTypes("REPRESENTATIVE")).contains("REPRESENTATIVE_AUTHORIZATION").doesNotContain("GUARDIAN_AUTHORIZATION");
        assertThat(PatientActivationService.consentPolicyVersion("GUARDIAN_AUTHORIZATION")).isEqualTo("guardian-v0-placeholder");

        // Evidence must be a clean document of this case.
        UUID pending = document(caseId, "PENDING"), foreign = document(adultCase("+254700002009"), "CLEAN"), clean = document(caseId, "CLEAN");
        authenticate(PARENT, Role.PATIENT_REPRESENTATIVE);
        for (UUID bad : List.of(pending, foreign))
            assertThatThrownBy(() -> guardians.attachEvidence(caseId, bad))
                    .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("GUARDIAN_EVIDENCE_INVALID"));
        GuardianView attached = guardians.attachEvidence(caseId, clean); em.flush();
        assertThat(attached.state()).isEqualTo("EVIDENCE_UNVERIFIED");
        assertThat(codes(caseId)).contains("GUARDIAN_EVIDENCE_UNVERIFIED").doesNotContain("GUARDIAN_EVIDENCE_MISSING");
        // Unverified evidence is the coordinator's to check: staff-owned, still gating, and the patient can submit meanwhile.
        BlockerView check = caseActions.readinessBlockers(caseId).stream().filter(b -> b.code().equals("GUARDIAN_EVIDENCE_UNVERIFIED")).findFirst().orElseThrow();
        assertThat(check.owner()).isEqualTo("STAFF");
        assertThat(check.gating()).isTrue();

        // Only the case's coordinator decides.
        authenticate(CONSULTANT, Role.CONSULTANT);
        assertThatThrownBy(() -> guardians.decideEvidence(caseId, "VERIFY")).isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isIn(401, 403));
        authenticate(COORDINATOR, Role.COORDINATOR);
        GuardianView verified = guardians.decideEvidence(caseId, "VERIFY"); em.flush();
        assertThat(verified.state()).isEqualTo("VERIFIED");
        assertThat(verified.evidenceVerifiedBy()).isEqualTo(COORDINATOR);
        assertThat(codes(caseId)).noneMatch(c -> c.startsWith("GUARDIAN_") || c.equals("MINOR_REQUIRES_GUARDIAN") || c.equals("REPRESENTATIVE_AUTH_MISSING"));
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='GUARDIAN_EVIDENCE_VERIFIED' AND case_id=?", caseId)).isEqualTo(1);

        // Replacing the evidence starts the check again.
        UUID replacement = document(caseId, "CLEAN");
        authenticate(PARENT, Role.PATIENT_REPRESENTATIVE);
        assertThat(guardians.attachEvidence(caseId, replacement).state()).isEqualTo("EVIDENCE_UNVERIFIED");
        authenticate(COORDINATOR, Role.COORDINATOR);
        // A refusal drops the document so the guardian provides another.
        assertThat(guardians.decideEvidence(caseId, "REJECT").state()).isEqualTo("EVIDENCE_MISSING"); em.flush();
        assertThat(codes(caseId)).contains("GUARDIAN_EVIDENCE_MISSING");
        assertThatThrownBy(() -> guardians.decideEvidence(caseId, "VERIFY"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("NO_EVIDENCE_TO_DECIDE"));
    }

    @Test void onlyAParentOrGuardianBecomesAGuardianAtIntake() throws Exception {
        UUID caseId = childCase("+254700002010", "UNDER_12");
        UUID patientId = patientOf(caseId);
        guardians.grantAtIntake(caseId, patientId, SIBLING, "SIBLING", Instant.now());
        guardians.grantAtIntake(caseId, patientId, "guardian-legal", "GUARDIAN", Instant.now()); em.flush();
        assertThat(jdbc.queryForObject("SELECT delegation_type FROM patient_representatives WHERE representative_subject=?", String.class, SIBLING)).isEqualTo("REPRESENTATIVE");
        assertThat(jdbc.queryForMap("SELECT delegation_type, legal_basis FROM patient_representatives WHERE representative_subject='guardian-legal'"))
                .containsEntry("DELEGATION_TYPE", "GUARDIAN").containsEntry("LEGAL_BASIS", "LEGAL_GUARDIAN");
        // An adult's relatives stay representatives whatever the relationship.
        UUID adult = adultCase("+254700002011");
        guardians.grantAtIntake(adult, patientOf(adult), "adult-parent", "PARENT", Instant.now()); em.flush();
        assertThat(jdbc.queryForObject("SELECT delegation_type FROM patient_representatives WHERE representative_subject='adult-parent'", String.class)).isEqualTo("REPRESENTATIVE");
    }

    @Test void choosingGuardianNeedsALegalBasisAndMayCarryTheEvidence() throws Exception {
        UUID caseId = childCase("+254700002012", "AGE_12_17");
        onboarding.createForAcknowledgement(caseId, null); em.flush();
        UUID clean = document(caseId, "CLEAN");
        // The sender already acts for the child (a sibling at intake); they declare themselves the legal guardian with a court order.
        guardians.grantAtIntake(caseId, patientOf(caseId), PARENT, "OTHER", Instant.now()); em.flush();
        authenticate(PARENT, Role.PATIENT_REPRESENTATIVE);
        assertThatThrownBy(() -> onboarding.setSubject(caseId, new OnboardingSubjectRequest("GUARDIAN", "Uncle", null, null, version(caseId))))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("GUARDIAN_LEGAL_BASIS_REQUIRED"));
        assertThat(jdbc.queryForObject("SELECT delegation_type FROM patient_representatives WHERE representative_subject=?", String.class, PARENT)).isEqualTo("REPRESENTATIVE");
        onboarding.setSubject(caseId, new OnboardingSubjectRequest("GUARDIAN", "Uncle", null, null, version(caseId), "COURT_ORDER", clean)); em.flush();
        assertThat(jdbc.queryForMap("SELECT delegation_type, legal_basis, evidence_document_id FROM patient_representatives WHERE representative_subject=?", PARENT))
                .containsEntry("DELEGATION_TYPE", "GUARDIAN").containsEntry("LEGAL_BASIS", "COURT_ORDER").containsEntry("EVIDENCE_DOCUMENT_ID", clean);
        assertThat(codes(caseId)).contains("GUARDIAN_EVIDENCE_UNVERIFIED");
    }

    @Test void theDatabaseRefusesAGuardianWithoutABasisAndVerificationWithoutEvidence() throws Exception {
        UUID caseId = childCase("+254700002013", "UNDER_12");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,created_at,delegation_type) "
                + "SELECT ?,patient_id,'g-x','PARENT','VIEW',?,?,'GUARDIAN' FROM medical_cases WHERE id=?", UUID.randomUUID(), Instant.now(), Instant.now(), caseId)).isInstanceOf(Exception.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO patient_representatives(id,patient_id,representative_subject,relationship,permissions,effective_from,created_at,delegation_type,legal_basis,evidence_verified_at,evidence_verified_by) "
                + "SELECT ?,patient_id,'g-y','PARENT','VIEW',?,?,'GUARDIAN','PARENT',?,'x' FROM medical_cases WHERE id=?", UUID.randomUUID(), Instant.now(), Instant.now(), Instant.now(), caseId)).isInstanceOf(Exception.class);
    }

    // ---------- fixture ----------

    /** A case sent by a parent for their child: the patient has no personal contact yet, the sender's number is the case's. */
    private UUID childCase(String whatsapp, String band) throws Exception {
        var created = cases.create(new CreateCaseRequest("SOMEONE_ELSE", "Little", "Patient", false, new RepresentativeContact("Parent Person", "PARENT"), "Kenya",
                whatsapp, "Needs a review", "en", true, null, "child-" + whatsapp + "@local.test", "Africa/Nairobi", "cardiology", false, band));
        return submitted(created.caseId());
    }

    private UUID adultCase(String whatsapp) throws Exception {
        var created = cases.create(new CreateCaseRequest("Adult", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, "adult-" + whatsapp + "@local.test", "Africa/Nairobi", "cardiology"));
        return submitted(created.caseId());
    }

    private UUID submitted(UUID caseId) throws Exception {
        cases.submit(caseId); em.flush(); em.clear();
        if (count("SELECT count(*) FROM workforce_people WHERE subject=?", COORDINATOR) == 0)
            WorkforceTestData.staff(jdbc, COORDINATOR, "COORDINATOR", crypto.encrypt("Coordinator One"));
        authenticate(COORDINATOR, Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, COORDINATOR);
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, caseId, COORDINATOR)) journey.claimCoordinatorCase(caseId, "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return caseId;
    }

    private UUID document(UUID caseId, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO medical_documents(id,case_id,object_key,original_file_name,safe_file_name,content_type,size_bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                id, caseId, "cases/" + caseId + "/" + id, "birth-certificate.pdf", "birth-certificate.pdf", "application/pdf", 2048L, status, Instant.now());
        return id;
    }

    private List<String> codes(UUID caseId) {
        em.flush(); em.clear();
        return readiness.compute(caseId).blockingItems().stream().map(b -> b.code()).toList();
    }

    private UUID patientOf(UUID caseId) { return jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId); }
    private String subjectType(UUID caseId) { return jdbc.queryForObject("SELECT subject_type FROM patient_onboardings WHERE case_id=?", String.class, caseId); }
    private long version(UUID caseId) { return jdbc.queryForObject("SELECT version FROM patient_onboardings WHERE case_id=?", Long.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, Role role) { com.rehletshifaa.authority.TestPrincipals.signIn(jdbc, crypto, subject, role); }
}
