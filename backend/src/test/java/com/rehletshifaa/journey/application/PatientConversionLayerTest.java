package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * Focused verification of the additive patient conversion layer: the contact-verification / account-activation
 * / identity-verification split, contact-channel choice, the onboarding sub-workflow, deposit waiver, and the
 * backend-computed customer-readiness gate.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PatientConversionLayerTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired OnboardingService onboarding; @Autowired IdentityVerificationService identity; @Autowired PaymentService payment;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- Contact verification vs account activation vs identity ----------

    @Test void whatsappOtpSetsPhoneVerifiedOnly() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        journey.verifyProposalAccess(ctx.token, proposalCode("WHATSAPP"));
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNotNull();
        assertThat(verifiedAt(ctx.caseId, "email_verified_at")).isNull();
    }

    @Test void emailOtpSetsEmailVerifiedOnly() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        journey.verifyProposalAccess(ctx.token, proposalCode("EMAIL"));
        assertThat(verifiedAt(ctx.caseId, "email_verified_at")).isNotNull();
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNull();
    }

    @Test void accountActivationSetsNeitherVerificationTimestamp() throws Exception {
        // Verify via EMAIL only (phone stays unverified), acknowledge, then activate. Activation must NOT
        // set phone_verified_at — the old conflation bug that this regression guards against.
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        var grant = journey.verifyProposalAccess(ctx.token, proposalCode("EMAIL"));
        journey.decideProposalPublic(ctx.token, grant.grant(), new PublicProposalDecisionRequest(grant.grant(), "ACKNOWLEDGED", null)); em.flush();
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNull();
        authenticate("patient-subject-a", "PATIENT");
        journey.activateAccount(activationToken());
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNull(); // activation added no verification
    }

    @Test void defaultChannelRemainsBackwardCompatible() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token); em.flush(); // no channel => default WhatsApp
        assertThat(activeChannel(ctx.caseId)).isEqualTo("WHATSAPP");
        journey.verifyProposalAccess(ctx.token, proposalCode("WHATSAPP"));
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNotNull();
    }

    @Test void patientMaySelectEitherRegisteredChannel() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        assertThat(activeChannel(ctx.caseId)).isEqualTo("EMAIL");
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        assertThat(activeChannel(ctx.caseId)).isEqualTo("WHATSAPP");
    }

    @Test void arbitraryOrUnavailableChannelIsRejected() throws Exception {
        var ctx = releasePreliminary();
        assertThatThrownBy(() -> journey.requestProposalAccess(ctx.token, "SMS")).isInstanceOf(ApiException.class);
        // A case with only WhatsApp on file cannot request an email OTP.
        var whatsappOnly = releasePreliminary("+254700000099", null);
        assertThatThrownBy(() -> journey.requestProposalAccess(whatsappOnly.token, "EMAIL"))
                .isInstanceOf(ApiException.class).hasMessageContaining("not on file");
    }

    @Test void switchingChannelInvalidatesPriorChallenge() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        String firstCode = proposalCode("WHATSAPP");
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        // The prior WhatsApp challenge was revoked when the email challenge was minted.
        assertThatThrownBy(() -> journey.verifyProposalAccess(ctx.token, firstCode)).isInstanceOf(ApiException.class);
    }

    @Test void otpVerificationProducesContactVerifiedNeverIdentityVerified() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, "PATIENT");
        CustomerReadiness r = journey.customerReadiness(ctx.caseId);
        assertThat(r.contactVerified()).isTrue();
        assertThat(r.identityVerified()).isFalse();
        assertThat(r.readyForCoordination()).isFalse();
    }

    // ---------- Onboarding creation ----------

    @Test void acknowledgementCreatesExactlyOneOnboardingAndDeposit() throws Exception {
        var ctx = releasePreliminary();
        acknowledge(ctx);
        assertThat(count("SELECT count(*) FROM patient_onboardings WHERE case_id=?", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM deposits WHERE case_id=?", ctx.caseId)).isEqualTo(1);
    }

    @Test void replayedAcknowledgementDoesNotDuplicateRecords() throws Exception {
        var ctx = releasePreliminary();
        acknowledge(ctx);
        onboarding.createForAcknowledgement(ctx.caseId, ctx.versionId); // idempotent replay
        payment.createDepositForAcknowledgement(ctx.caseId, ctx.versionId);
        assertThat(count("SELECT count(*) FROM patient_onboardings WHERE case_id=?", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM deposits WHERE case_id=?", ctx.caseId)).isEqualTo(1);
    }

    @Test void declineDoesNotCreateOnboarding() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        var grant = journey.verifyProposalAccess(ctx.token, proposalCode("WHATSAPP"));
        journey.decideProposalPublic(ctx.token, grant.grant(), new PublicProposalDecisionRequest(grant.grant(), "DECLINED", null)); em.flush();
        assertThat(count("SELECT count(*) FROM patient_onboardings WHERE case_id=?", ctx.caseId)).isZero();
    }

    @Test void activationResumesTheCorrectOnboarding() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, "PATIENT");
        OnboardingView view = onboarding.myOnboarding(ctx.caseId);
        assertThat(view.caseId()).isEqualTo(ctx.caseId);
        assertThat(view.readiness().accountActivated()).isTrue();
    }

    @Test void patientCannotAccessAnotherPatientsOnboarding() throws Exception {
        var mine = onboardedCase();
        var other = onboardedCase("patient-subject-other", "+254700000044", "other@local.test");
        authenticate(mine.patientSubject, "PATIENT");
        assertThatThrownBy(() -> onboarding.myOnboarding(other.caseId)).isInstanceOf(ApiException.class).hasMessageContaining("authorized");
    }

    // ---------- Representative / payer ----------

    @Test void representativeAuthorizationScopeAndExpiryAreEnforced() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, "PATIENT");
        long v = onboarding.myOnboarding(ctx.caseId).version();
        onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("REPRESENTATIVE", "Parent", "COORDINATION", Instant.now().plusSeconds(86400), v));
        assertThat(journey.customerReadiness(ctx.caseId).representativeAuthorizationValid()).isTrue();
        // Expire the delegation: readiness must now flag missing representative authorization.
        jdbc.update("UPDATE patient_representatives SET expires_at=? WHERE representative_subject=?", Instant.now().minusSeconds(60), ctx.patientSubject);
        assertThat(journey.customerReadiness(ctx.caseId).representativeAuthorizationValid()).isFalse();
    }

    @Test void payerOnlyDoesNotGrantRepresentativeAccess() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, "PATIENT");
        long v = onboarding.myOnboarding(ctx.caseId).version();
        onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("PAYER", null, null, null, v));
        // A payer never receives a representative (medical-record access) row.
        assertThat(count("SELECT count(*) FROM patient_representatives WHERE patient_id=(SELECT patient_id FROM medical_cases WHERE id=?)", ctx.caseId)).isZero();
    }

    // ---------- Identity verification authority ----------

    @Test void coordinatorCannotMarkIdentityVerified() throws Exception {
        var ctx = onboardedCase();
        UUID identityId = startIdentityAs(ctx);
        authenticate("coordinator-subject", "COORDINATOR");
        assertThatThrownBy(() -> identity.review(identityId, new IdentityReviewRequest("VERIFY", "looks fine", "HIGH"))).isInstanceOf(ApiException.class);
    }

    @Test void identityReviewRequiresRecentAuthenticationAndReason() throws Exception {
        var ctx = onboardedCase();
        UUID identityId = startIdentityAs(ctx);
        authenticateStale("reviewer-subject", "PATIENT_IDENTITY_REVIEWER");
        assertThatThrownBy(() -> identity.review(identityId, new IdentityReviewRequest("VERIFY", "ok", "HIGH")))
                .isInstanceOf(ApiException.class).hasMessageContaining("authenticate again");
        authenticate("reviewer-subject", "PATIENT_IDENTITY_REVIEWER");
        assertThatThrownBy(() -> identity.review(identityId, new IdentityReviewRequest("VERIFY", "  ", "HIGH")))
                .isInstanceOf(ApiException.class);
    }

    @Test void identityReviewIsAuditedAndFlowsToReadiness() throws Exception {
        var ctx = onboardedCase();
        UUID identityId = startIdentityAs(ctx);
        authenticate("reviewer-subject", "PATIENT_IDENTITY_REVIEWER");
        identity.review(identityId, new IdentityReviewRequest("VERIFY", "Passport checked against provider record", "HIGH"));
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='IDENTITY_VERIFIED' AND entity_id=?", identityId.toString())).isEqualTo(1);
        authenticate(ctx.patientSubject, "PATIENT");
        assertThat(journey.customerReadiness(ctx.caseId).identityVerified()).isTrue();
        // The legal name is encrypted at rest, never stored as plaintext.
        assertThat(jdbc.queryForObject("SELECT status FROM patient_identity_verifications WHERE id=?", String.class, identityId)).isEqualTo("VERIFIED");
        assertThat(jdbc.queryForObject("SELECT legal_name_encrypted FROM patient_identity_verifications WHERE id=?", String.class, identityId)).isNotEqualTo("Jane Doe");
    }

    @Test void onboardingConsentDoesNotDuplicateProcedureSpecificConsent() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, "PATIENT");
        assertThatThrownBy(() -> onboarding.recordConsent(ctx.caseId, new OnboardingConsentRequest("PROCEDURE_SPECIFIC", "text", "v1", "en", null, null)))
                .isInstanceOf(ApiException.class).hasMessageContaining("not part of onboarding");
    }

    // ---------- Onboarding completion + readiness gate ----------

    @Test void onboardingCannotCompleteWithMissingSteps() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, "PATIENT");
        long v = onboarding.myOnboarding(ctx.caseId).version();
        assertThatThrownBy(() -> onboarding.submit(ctx.caseId, new OnboardingSubmitRequest(v))).isInstanceOf(ApiException.class);
    }

    @Test void fullyReadyPatientCanSubmitAndReachReadiness() throws Exception {
        var ctx = onboardedCase();
        makeReady(ctx);
        authenticate(ctx.patientSubject, "PATIENT");
        long v = onboarding.myOnboarding(ctx.caseId).version();
        OnboardingView done = onboarding.submit(ctx.caseId, new OnboardingSubmitRequest(v));
        assertThat(done.state()).isEqualTo("COMPLETED");
        assertThat(journey.customerReadiness(ctx.caseId).readyForCoordination()).isTrue();
    }

    // ---------- Deposit waiver authority ----------

    @Test void coordinatorCannotWaiveDeposit() throws Exception {
        var ctx = onboardedCase();
        UUID depositId = depositId(ctx.caseId);
        authenticate("coordinator-subject", "COORDINATOR");
        assertThatThrownBy(() -> payment.waiveDeposit(ctx.caseId, depositId, "please waive")).isInstanceOf(ApiException.class);
    }

    @Test void financeWaiverRequiresRecentAuthenticationAndReason() throws Exception {
        var ctx = onboardedCase();
        UUID depositId = depositId(ctx.caseId);
        authenticateStale("finance-subject", "FINANCE");
        assertThatThrownBy(() -> payment.waiveDeposit(ctx.caseId, depositId, "reason")).isInstanceOf(ApiException.class).hasMessageContaining("authenticate again");
        authenticate("finance-subject", "FINANCE");
        assertThatThrownBy(() -> payment.waiveDeposit(ctx.caseId, depositId, "  ")).isInstanceOf(ApiException.class);
        payment.waiveDeposit(ctx.caseId, depositId, "Hardship approved by senior finance");
        assertThat(payment.depositSatisfied(ctx.caseId)).isTrue();
        assertThat(payment.depositStatusFor(ctx.caseId)).isEqualTo("WAIVED");
    }

    // ---------- Commitment gate ----------

    @Test void nonCancellableCommitmentRejectedWhenNotReady() throws Exception {
        var ctx = onboardedCase();
        driveToTravelCoordination(ctx);
        authenticate("operations-subject", "OPERATIONS");
        assertThatThrownBy(() -> journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "OK", null, null, null, null, null, "Facility", null, "CONFIRMED")))
                .isInstanceOf(ApiException.class).hasMessageContaining("not ready");
    }

    @Test void legacyProgressedCaseKeepsDepositOnlyGate() throws Exception {
        // A case with NO onboarding record (predates this layer) with a paid deposit may still confirm.
        var ctx = releasePreliminary();
        acknowledge(ctx);
        jdbc.update("DELETE FROM patient_onboardings WHERE case_id=?", ctx.caseId); // simulate legacy: no onboarding
        UUID depositId = depositId(ctx.caseId);
        authenticate("finance-subject", "FINANCE");
        payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(new BigDecimal("3000.00"), "BANK", "ref-1", "legacy-pay-1"));
        driveToTravelCoordination(ctx);
        authenticate("operations-subject", "OPERATIONS");
        // Deposit is paid and there is no onboarding record => legacy path allows confirmation.
        journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "OK", null, null, null, null, null, "Facility", null, "CONFIRMED"));
        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");
    }

    // ================= helpers =================
    private record Ctx(UUID caseId, UUID versionId, String token, String caseNumber, String patientSubject) {}

    private Ctx releasePreliminary() throws Exception { return releasePreliminary("+254700000020", "link@local.test"); }
    private Ctx releasePreliminary(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Link Patient", "Kenya", whatsapp, "Cardiac reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        jdbc.update("UPDATE medical_cases SET travel_package_requested=true WHERE id=?", created.caseId());
        authenticate("coordinator-subject", "COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        seedDoctor(); seedStaff();
        var doctorAssignment = journey.assign(created.caseId(), new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(created.caseId(), doctorAssignment.id(), true);
        var review = journey.saveClinicalReview(created.caseId(), new ClinicalReviewRequest("Reviewed", "SUITABLE", null, "Imaging", "Recommended intervention", "Alt", "Risks", "Seq", "7 days", "Follow-up"));
        journey.approveClinicalReview(created.caseId(), review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), review.id(), "Consultant treatment package", new BigDecimal("1000.00"), "EGP", 0, new BigDecimal("1000.00"), true);
        authenticate("coordinator-subject", "COORDINATOR");
        var proposal = journey.createProposal(created.caseId(), new ProposalDraftRequest(review.id(), "en", "Plan", "EGP", "Incl", "Excl", "Deposit", "Refund", "Not consent", Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Treatment package", BigDecimal.ONE, new BigDecimal("1000.00"), false, 0)), null));
        var operationsAssignment = journey.assign(created.caseId(), new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", "cardiac-pod", "Ops"));
        var financeAssignment = journey.assign(created.caseId(), new AssignmentRequest("finance-subject", "FINANCE", "PRIMARY", "cardiac-pod", "Finance"));
        authenticate("operations-subject", "OPERATIONS"); journey.decideAssignment(created.caseId(), operationsAssignment.id(), true, com.rehletshifaa.security.ActorRole.OPERATIONS); journey.completeOperations(created.caseId(), proposal.versionId(), "Ops plan");
        authenticate("finance-subject", "FINANCE"); journey.decideAssignment(created.caseId(), financeAssignment.id(), true, com.rehletshifaa.security.ActorRole.FINANCE); journey.approveFinance(created.caseId(), proposal.versionId());
        authenticate("coordinator-subject", "COORDINATOR"); journey.releaseProposal(created.caseId(), proposal.versionId());
        em.flush();
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, "proposal-ready:" + proposal.versionId()));
        String raw = json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
        SecurityContextHolder.clearContext();
        return new Ctx(created.caseId(), proposal.versionId(), raw, created.caseNumber(), null);
    }

    private void acknowledge(Ctx ctx) throws Exception {
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        var grant = journey.verifyProposalAccess(ctx.token, proposalCode("WHATSAPP"));
        journey.decideProposalPublic(ctx.token, grant.grant(), new PublicProposalDecisionRequest(grant.grant(), "ACKNOWLEDGED", null)); em.flush();
        SecurityContextHolder.clearContext();
    }

    private Ctx onboardedCase() throws Exception { return onboardedCase("patient-subject-main", "+254700000020", "link@local.test"); }
    private Ctx onboardedCase(String patientSubject, String whatsapp, String email) throws Exception {
        var ctx = releasePreliminary(whatsapp, email);
        acknowledge(ctx);
        authenticate(patientSubject, "PATIENT");
        journey.activateAccount(activationToken());
        em.flush(); SecurityContextHolder.clearContext();
        return new Ctx(ctx.caseId, ctx.versionId, ctx.token, ctx.caseNumber, patientSubject);
    }

    private UUID startIdentityAs(Ctx ctx) {
        authenticate(ctx.patientSubject, "PATIENT");
        IdentityVerificationView v = identity.start(ctx.caseId, new IdentityStartRequest("PATIENT", null, "DOCUMENT", "Jane Doe", "1990-01-01", "Kenya", "PASSPORT", "Kenya", "A1234567"));
        SecurityContextHolder.clearContext();
        return v.id();
    }

    /** Satisfy every readiness gate except the final submission. */
    private void makeReady(Ctx ctx) throws Exception {
        UUID identityId = startIdentityAs(ctx);
        authenticate("reviewer-subject", "PATIENT_IDENTITY_REVIEWER");
        identity.review(identityId, new IdentityReviewRequest("VERIFY", "Verified against provider record", "HIGH"));
        authenticate(ctx.patientSubject, "PATIENT");
        for (String type : List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"))
            onboarding.recordConsent(ctx.caseId, new OnboardingConsentRequest(type, "I agree to " + type, "v1", "en", null, null));
        UUID depositId = depositId(ctx.caseId);
        authenticate("finance-subject", "FINANCE");
        payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(new BigDecimal("3000.00"), "BANK", "ready-pay", "ready-pay-" + ctx.caseId));
        SecurityContextHolder.clearContext();
    }

    private void driveToTravelCoordination(Ctx ctx) {
        authenticate("coordinator-subject", "COORDINATOR");
        journey.assign(ctx.caseId, new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", "cardiac-pod", "Ops"));
        UUID opsAssignment = jdbc.queryForObject("SELECT id FROM case_assignments WHERE case_id=? AND assignee_role='OPERATIONS' AND status='PENDING' ORDER BY assigned_at DESC LIMIT 1", UUID.class, ctx.caseId);
        authenticate("operations-subject", "OPERATIONS");
        journey.decideAssignment(ctx.caseId, opsAssignment, true, com.rehletshifaa.security.ActorRole.OPERATIONS);
        journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "OK", null, null, null, null, null, "Facility", null, "PLANNING"));
    }

    private void seedDoctor() { if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return; UUID id = UUID.randomUUID(); jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now()); jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); }
    private void seedStaff() { if (count("SELECT count(*) FROM staff_members WHERE external_subject=?", "operations-subject") > 0) return; jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"), Instant.now(), Instant.now()); jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "finance-subject", "FINANCE", crypto.encrypt("Finance One"), Instant.now(), Instant.now()); }

    private String proposalCode(String channel) throws Exception { String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PROPOSAL_ACCESS' AND channel=? ORDER BY created_at DESC LIMIT 1", String.class, channel)); return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code"); }
    private String activeChannel(UUID caseId) { return jdbc.queryForObject("SELECT delivery_channel FROM proposal_access_challenges WHERE case_id=? AND revoked_at IS NULL AND consumed_at IS NULL", String.class, caseId); }
    private String activationToken() throws Exception { String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='ACCOUNT_ACTIVATION' ORDER BY created_at DESC LIMIT 1", String.class)); return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("token"); }
    private Instant verifiedAt(UUID caseId, String column) { return jdbc.queryForObject("SELECT " + column + " FROM patient_profiles WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", Instant.class, caseId); }
    private UUID depositId(UUID caseId) { return jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1", UUID.class, caseId); }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private void authenticate(String subject, String role) { authenticate(subject, role, Instant.now()); }
    private void authenticateStale(String subject, String role) { authenticate(subject, role, Instant.now().minusSeconds(3600)); }
    private void authenticate(String subject, String role, Instant authTime) { Jwt jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", authTime.getEpochSecond()).issuedAt(authTime).expiresAt(Instant.now().plusSeconds(3600)).build(); SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("ROLE_" + role)), subject)); }
}
