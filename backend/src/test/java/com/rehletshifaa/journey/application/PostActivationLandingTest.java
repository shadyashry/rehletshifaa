package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.api.WorkDtos.InformationRequestCommand;
import com.rehletshifaa.journey.api.WorkDtos.RequestedItem;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * What a patient lands on right after activating their account: the backend resolves one authoritative
 * "current step" (FOCUS only when the patient owes something, otherwise a WAIT naming whose move it is),
 * the deposit truthfully as staff-arranged work, the proposal through one action, and the current case
 * through one rule — so the portal never infers any of it from the stage.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PostActivationLandingTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired PatientAccountService accounts; @Autowired PaymentService payment;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---- scenarios 2, 3, 5, 6, 9: the deposit stage right after activation ----

    @Test void afterAcknowledgingTheEstimateThePatientHasNothingToDoAndSeesTheDepositBeingArranged() throws Exception {
        UUID caseId = ownedCase("+254700000601", "landing-a@local.test");
        UUID versionId = releasedUsdProposal(caseId);
        seedDepositPolicy(new BigDecimal("25000.00"));
        acknowledge(caseId, "+254700000601");
        linkPatient(caseId, "patient-landing-a");
        markProfileActive(caseId); // activation completed the profile and the base consents

        authenticate("patient-landing-a", "PATIENT");
        CaseWorkspace ws = journey.workspace(caseId);
        assertThat(ws.caseSummary().status()).isEqualTo("ACCEPTED");
        // One authoritative step: a WAIT, never a "pay" or "continue" action the patient cannot act on.
        assertThat(ws.actions().currentAction().code()).isEqualTo("WAIT_DEPOSIT_ARRANGEMENT");
        assertThat(ws.actions().currentAction().kind()).isEqualTo("WAIT");
        assertThat(ws.actions().waitingOn()).isEqualTo("STAFF");
        assertThat(ws.actions().blockers()).isEmpty(); // nothing left that only the patient can do
        assertThat(ws.actions().availableActions()).containsExactly("MESSAGE_COORDINATOR");
        // The deposit: authoritative amount, in the proposal's currency at its snapshot rate, arranged on our side.
        assertThat(ws.deposit()).isNotNull();
        assertThat(ws.deposit().status()).isEqualTo("REQUESTED");
        assertThat(ws.deposit().currency()).isEqualTo("USD");
        assertThat(ws.deposit().totalEgp()).isEqualByComparingTo("25000.00");
        assertThat(ws.deposit().totalDisplay()).isEqualByComparingTo("500.00"); // 25,000 EGP × 0.02
        // The proposal: acknowledged, exactly one read-only action, the version the patient decided on.
        assertThat(ws.patientProposal().state()).isEqualTo("ACCEPTED");
        assertThat(ws.patientProposal().action()).isEqualTo("VIEW_PROPOSAL");
        assertThat(ws.patientProposal().versionId()).isEqualTo(versionId);
        assertThat(ws.proposal().versionId()).isEqualTo(versionId);
        assertThat(ws.proposal().currency()).isEqualTo("USD");
        // The coordinator shown is the case's actual owner, by name — never a subject.
        assertThat(ws.caseSummary().coordinatorName()).isEqualTo("Coordinator One");
        assertThat(ws.caseSummary().coordinatorSubject()).isNull();
    }

    @Test void onceTheDepositIsConfirmedTheStepMovesOnAndTheDepositReadsAsReceived() throws Exception {
        UUID caseId = ownedCase("+254700000602", "landing-b@local.test");
        releasedUsdProposal(caseId);
        seedDepositPolicy(new BigDecimal("25000.00"));
        acknowledge(caseId, "+254700000602");
        linkPatient(caseId, "patient-landing-b");
        markProfileActive(caseId);
        authenticate("patient-landing-b", "PATIENT");
        UUID depositId = journey.workspace(caseId).deposit().id();
        assertThat(journey.workspace(caseId).actions().currentAction().code()).isEqualTo("WAIT_DEPOSIT_ARRANGEMENT");

        seedStaff("finance-subject", "FINANCE");
        authenticate("finance-subject", "FINANCE");
        payment.recordReceipt(caseId, depositId, new RecordReceiptRequest(new BigDecimal("25000.00"), "BANK", "ref-1", "landing-b:" + caseId));
        em.flush();

        authenticate("patient-landing-b", "PATIENT");
        CaseWorkspace ws = journey.workspace(caseId);
        assertThat(ws.deposit().status()).isEqualTo("PAID");
        assertThat(ws.deposit().paidDisplay()).isEqualByComparingTo("500.00");
        assertThat(ws.actions().currentAction().code()).isNotEqualTo("WAIT_DEPOSIT_ARRANGEMENT"); // the stale step is gone
        assertThat(ws.actions().currentAction().code()).isEqualTo("WAIT_COORDINATION");
        assertThat(ws.actions().currentAction().kind()).isEqualTo("WAIT");
    }

    // ---- the patient owes something: exactly one FOCUS ----

    @Test void aReleasedProposalIsTheOneThingToDo() throws Exception {
        UUID caseId = ownedCase("+254700000603", "landing-c@local.test");
        UUID versionId = releasedUsdProposal(caseId);
        linkPatient(caseId, "patient-landing-c");
        authenticate("patient-landing-c", "PATIENT");
        CaseWorkspace ws = journey.workspace(caseId);
        assertThat(ws.actions().currentAction().code()).isEqualTo("REVIEW_PROPOSAL");
        assertThat(ws.actions().currentAction().kind()).isEqualTo("FOCUS");
        assertThat(ws.patientProposal().action()).isEqualTo("REVIEW_PROPOSAL");
        assertThat(ws.patientProposal().versionId()).isEqualTo(versionId);
        assertThat(ws.deposit()).isNull(); // nothing to say about a deposit before the decision
    }

    @Test void anOpenInformationRequestOutranksEverythingElse() throws Exception {
        UUID caseId = ownedCase("+254700000604", "landing-d@local.test");
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(caseId, new InformationRequestCommand("Please send your latest ECG.",
                List.of(new RequestedItem("DOCUMENT", "ECG", "Latest ECG report", true)), true, null, "en"));
        em.flush();
        linkPatient(caseId, "patient-landing-d");
        authenticate("patient-landing-d", "PATIENT");
        CaseWorkspace ws = journey.workspace(caseId);
        assertThat(ws.actions().currentAction().code()).isEqualTo("PROVIDE_INFORMATION");
        assertThat(ws.actions().currentAction().kind()).isEqualTo("FOCUS");
        assertThat(ws.actions().currentAction().context()).isEqualTo("Please send your latest ECG.");
        assertThat(ws.actions().waitingOn()).isEqualTo("PATIENT");
        assertThat(ws.patientAction().items()).hasSize(1);
    }

    @Test void whileTheTeamWorksTheStepNamesWhoseMoveItIs() throws Exception {
        UUID caseId = ownedCase("+254700000605", "landing-e@local.test");
        linkPatient(caseId, "patient-landing-e");
        authenticate("patient-landing-e", "PATIENT");
        assertThat(journey.workspace(caseId).actions().currentAction().code()).isEqualTo("WAIT_COORDINATOR_REVIEW");
        toClinicalRecommendation(caseId, "USD");
        authenticate("patient-landing-e", "PATIENT");
        assertThat(journey.workspace(caseId).actions().currentAction().code()).isEqualTo("WAIT_CONSULTANT_REVIEW");
        authenticate("coordinator-subject", "COORDINATOR");
        journey.createProposal(caseId, draftRequest(approvedReview(caseId)));
        authenticate("patient-landing-e", "PATIENT");
        CaseWorkspace ws = journey.workspace(caseId);
        assertThat(ws.actions().currentAction().code()).isEqualTo("WAIT_PROPOSAL");
        assertThat(ws.actions().currentAction().kind()).isEqualTo("WAIT");
        assertThat(ws.patientProposal().state()).isEqualTo("PREPARING");
        assertThat(ws.proposal()).isNull(); // the draft never reaches the patient
    }

    // ---- scenarios 1, 7, 8: which case the patient lands on ----

    @Test void theSessionResolvesTheCaseThatNeedsThePatientBeforeTheMostRecentOne() throws Exception {
        UUID older = ownedCase("+254700000606", "landing-f@local.test");
        UUID patientId = jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, older);
        // A second case for the same canonical patient, more recently updated.
        var second = cases.create(new CreateCaseRequest("Landing", "Patient", "Kenya", "+254700000606", "Follow-up reports", "en", true, null, "landing-f@local.test", "Africa/Nairobi", "cardiology"));
        cases.submit(second.caseId()); em.flush(); em.clear();
        jdbc.update("UPDATE medical_cases SET patient_id=? WHERE id=?", patientId, second.caseId());
        jdbc.update("UPDATE medical_cases SET updated_at=? WHERE id=?", Instant.now().plusSeconds(60), second.caseId());
        jdbc.update("UPDATE patient_profiles SET external_subject=?,account_status='ACTIVE',profile_status='ACTIVE' WHERE id=?", "patient-landing-f", patientId);

        authenticate("patient-landing-f", "PATIENT");
        assertThat(accounts.session().currentCaseId()).isEqualTo(second.caseId()); // most recently active

        // The older case now waits on the patient: it becomes the current one, whatever was touched last.
        authenticate("coordinator-subject", "COORDINATOR");
        journey.requestInformation(older, new InformationRequestCommand("Please confirm your medication.", List.of(), true, null, "en"));
        em.flush();
        jdbc.update("UPDATE medical_cases SET updated_at=? WHERE id=?", Instant.now().plusSeconds(120), second.caseId());
        authenticate("patient-landing-f", "PATIENT");
        AccountSessionView session = accounts.session();
        assertThat(session.linked()).isTrue();
        assertThat(session.accountStatus()).isEqualTo("ACTIVE");
        assertThat(session.currentCaseId()).isEqualTo(older);
        assertThat(journey.patientCases()).extracting(CaseView::id).containsExactlyInAnyOrder(older, second.caseId());
    }

    @Test void theFirstSignInAfterSetupActivatesTheAccountAndPointsAtTheCase() throws Exception {
        UUID caseId = ownedCase("+254700000607", "landing-g@local.test");
        UUID patientId = jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId);
        jdbc.update("UPDATE patient_profiles SET external_subject=?,account_status='SETUP_PENDING' WHERE id=?", "patient-landing-g", patientId);
        authenticate("patient-landing-g", "PATIENT");
        AccountSessionView session = accounts.session();
        assertThat(session.accountStatus()).isEqualTo("ACTIVE");
        assertThat(session.currentCaseId()).isEqualTo(caseId);
        assertThat(jdbc.queryForObject("SELECT account_status FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("ACTIVE");
    }

    // ---- Profile & Security: account facts only, owner only ----

    @Test void theProfileCarriesAccountFactsAndNothingFromTheCase() throws Exception {
        UUID caseId = ownedCase("+254700000608", "landing-h@local.test");
        linkPatient(caseId, "patient-landing-h");
        authenticate("patient-landing-h", "PATIENT");
        PatientProfileView profile = accounts.myProfile();
        assertThat(profile.givenName()).isEqualTo("Landing");
        assertThat(profile.familyName()).isEqualTo("Patient");
        assertThat(profile.displayName()).isEqualTo("Landing Patient");
        assertThat(profile.country()).isEqualTo("Kenya");
        assertThat(profile.preferredLanguage()).isEqualTo("en");
        assertThat(profile.email()).isEqualTo("landing-h@local.test");
        assertThat(profile.whatsappNumber()).isEqualTo("+254700000608");
        assertThat(json.convertValue(profile, new TypeReference<Map<String, Object>>() {}).keySet())
                .noneMatch(key -> key.toLowerCase().contains("case") || key.toLowerCase().contains("proposal") || key.toLowerCase().contains("deposit"));
        authenticate("patient-nobody", "PATIENT");
        assertThatThrownBy(() -> accounts.myProfile()).isInstanceOf(ApiException.class);
    }

    // ================= helpers =================

    private UUID ownedCase(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Landing", "Patient", "Kenya", whatsapp, "Reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        seedDoctorProfile(); seedCoordinatorProfile();
        authenticate("coordinator-subject", "COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(), "pod");
        em.flush(); SecurityContextHolder.clearContext();
        return created.caseId();
    }

    private void toClinicalRecommendation(UUID caseId, String proposalCurrency) throws Exception {
        authenticate("coordinator-subject", "COORDINATOR");
        long version = journey.workspace(caseId).caseSummary().version();
        if ("INTAKE_REVIEW".equals(status(caseId))) journey.transition(caseId, new TransitionRequest("READY_FOR_CONSULTANT", "Ready", version));
        UUID assignment = journey.assign(caseId, new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "pod", "Clinical review")).id();
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(caseId, assignment, new AssignmentDecisionRequest(true, null));
        UUID service = seedCatalogService("PACE-DUAL", "Dual chamber pacemaker implant", "Procedure", new BigDecimal("390000.00"));
        seedFxRate("USD", new BigDecimal("0.0200"));
        journey.reviewDecision(caseId, new ReviewDecisionRequest("ACCEPT", "Pacemaker implantation", null,
                List.of(new CostEstimateItem("Dual chamber pacemaker implant", new BigDecimal("390000.00"), "EGP", service)), proposalCurrency));
        em.flush(); SecurityContextHolder.clearContext();
    }

    private UUID releasedUsdProposal(UUID caseId) throws Exception {
        toClinicalRecommendation(caseId, "USD");
        authenticate("coordinator-subject", "COORDINATOR");
        var proposal = journey.createProposal(caseId, draftRequest(approvedReview(caseId)));
        jdbc.update("UPDATE proposal_versions SET requires_finance_approval=FALSE WHERE id=?", proposal.versionId());
        journey.releaseProposal(caseId, proposal.versionId());
        em.flush(); SecurityContextHolder.clearContext();
        return proposal.versionId();
    }

    /** The patient acknowledges through the secure link, exactly as the public journey does. */
    private void acknowledge(UUID caseId, String whatsapp) throws Exception {
        String token = statusToken(caseId);
        publicCases.requestAccess(token); em.flush();
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_ACCESS' AND destination=? ORDER BY created_at DESC LIMIT 1", String.class, whatsapp));
        String code = json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
        String grant = publicCases.verify(token, code).grant();
        var handoff = publicCases.proposalAccess(token, grant); em.flush();
        journey.decideProposalPublic(handoff.token(), handoff.grant(), new PublicProposalDecisionRequest(handoff.grant(), "ACKNOWLEDGED", null, true));
        em.flush(); SecurityContextHolder.clearContext();
    }

    private String statusToken(UUID caseId) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_STATUS_LINK' AND idempotency_key IN (SELECT 'case-status:'||id FROM case_access_links WHERE case_id=? AND purpose='STATUS') ORDER BY created_at DESC LIMIT 1", String.class, caseId));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token");
    }

    private UUID approvedReview(UUID caseId) { return jdbc.queryForObject("SELECT id FROM clinical_review_versions WHERE case_id=? AND status='APPROVED'", UUID.class, caseId); }

    private ProposalDraftRequest draftRequest(UUID reviewId) {
        return new ProposalDraftRequest(reviewId, "en", "Plan", null, "Included", "Excluded", "Deposit", "Refund", "Consent",
                Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Line", BigDecimal.ONE, new BigDecimal("1.00"), false, 0)), null);
    }

    /** Binds the profile to a signed-in account, as activation does; contact already verified by the OTP flows. */
    private void linkPatient(UUID caseId, String subject) {
        jdbc.update("UPDATE patient_profiles SET external_subject=?,account_status='ACTIVE',profile_status='ACTIVE' WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", subject, caseId);
    }

    /** Activation records the onboarding as completed and the base consents as given. */
    private void markProfileActive(UUID caseId) {
        UUID patientId = jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId);
        jdbc.update("UPDATE patient_onboardings SET state='COMPLETED',subject_type='PATIENT' WHERE case_id=?", caseId);
        for (String consent : CustomerReadinessService.BASE_CONSENTS)
            jdbc.update("INSERT INTO consent_records(id,patient_id,case_id,consent_type,policy_version,language,exact_text,purpose,scope,channel,captured_by,effective_from,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(), patientId, caseId, consent, "v1", "en", consent, "Onboarding", "Case", "WEB", "patient", Instant.now(), Instant.now());
        jdbc.update("UPDATE patient_profiles SET phone_verified_at=? WHERE id=?", Instant.now(), patientId);
    }

    private void seedCoordinatorProfile() {
        if (count("SELECT count(*) FROM staff_members WHERE external_subject=?", "coordinator-subject") > 0) return;
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",
                UUID.randomUUID(), "coordinator-subject", "COORDINATOR", crypto.encrypt("Coordinator One"), Instant.now(), Instant.now());
    }
    private void seedStaff(String subject, String role) {
        if (count("SELECT count(*) FROM staff_members WHERE external_subject=?", subject) > 0) return;
        jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)",
                UUID.randomUUID(), subject, role, crypto.encrypt(role + " One"), Instant.now(), Instant.now());
    }
    private void seedDoctorProfile() {
        if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now());
        jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now());
    }
    private UUID seedCatalogService(String code, String name, String category, BigDecimal priceEgp) {
        UUID practitioner = jdbc.queryForObject("SELECT id FROM practitioner_profiles WHERE external_subject=?", UUID.class, "doctor-subject");
        UUID existing = jdbc.query("SELECT id FROM consultant_service_catalog WHERE practitioner_id=? AND service_code=?", rs -> rs.next() ? rs.getObject("id", UUID.class) : null, practitioner, code);
        if (existing != null) return existing;
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO consultant_service_catalog(id,practitioner_id,service_code,service_name,category,price_egp,active,created_by,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                id, practitioner, code, name, category, priceEgp, true, "admin", Instant.now(), Instant.now());
        return id;
    }
    private void seedFxRate(String quoteCurrency, BigDecimal rate) {
        jdbc.update("DELETE FROM fx_rates WHERE quote_currency=? AND rate_date=?", quoteCurrency, java.time.LocalDate.now(java.time.ZoneOffset.UTC));
        jdbc.update("INSERT INTO fx_rates(id,base_currency,quote_currency,rate,rate_date,source,fetched_at) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID(), "EGP", quoteCurrency, rate, java.time.LocalDate.now(java.time.ZoneOffset.UTC), "API", Instant.now());
    }
    private void seedDepositPolicy(BigDecimal egp) {
        jdbc.update("UPDATE deposit_policies SET active=FALSE");
        jdbc.update("INSERT INTO deposit_policies(id,name,care_category,coordination_deposit_egp,active,version,created_by,valid_from,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), "Landing deposit", null, egp, true, 1, "test", java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(1), Instant.now());
    }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private void authenticate(String subject, String role) {
        Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), subject));
    }
}
