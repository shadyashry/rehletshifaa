package com.rehletshifaa.journey.application;

import com.rehletshifaa.authority.domain.Role;

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
    @Autowired PatientAccountService accounts; @Autowired CustomerReadinessService readiness; @Autowired com.rehletshifaa.authority.application.Authority authority; @Autowired CaseActionService caseActions; @Autowired CaseTransitionPolicy transitions;
    @Autowired JdbcTemplate jdbc; @Autowired com.rehletshifaa.casemanagement.application.IntakeLifecycleService intakeLifecycle; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;

    /** Raw SQL behind JPA's back: flush pending entity changes first, then drop managed instances the SQL made stale. */
    private int raw(String sql, Object... args) { em.flush(); int changed = jdbc.update(sql, args); em.clear(); return changed; }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- Contact verification vs account activation vs identity ----------

    @Test void whatsappOtpSetsPhoneVerifiedOnly() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        journey.verifyProposalAccess(ctx.token, proposalCode(ctx.token, "WHATSAPP"));
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNotNull();
        assertThat(verifiedAt(ctx.caseId, "email_verified_at")).isNull();
    }

    @Test void emailOtpSetsEmailVerifiedOnly() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        journey.verifyProposalAccess(ctx.token, proposalCode(ctx.token, "EMAIL"));
        assertThat(verifiedAt(ctx.caseId, "email_verified_at")).isNotNull();
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNull();
    }

    @Test void profileActivationSetsNeitherVerificationTimestamp() throws Exception {
        // Verify via EMAIL only (phone stays unverified), acknowledge, then activate the profile. Profile
        // activation must NOT set phone_verified_at; only the matching channel's OTP may verify contact.
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        var grant = journey.verifyProposalAccess(ctx.token, proposalCode(ctx.token, "EMAIL"));
        journey.decideProposalPublic(ctx.token, grant.grant(), new PublicProposalDecisionRequest(grant.grant(), "ACKNOWLEDGED", null, true)); em.flush();
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNull();
        authenticate("patient-subject-a", Role.PATIENT);
        startAuthenticatedAccount(ctx, "patient-subject-a");
        assertThat(verifiedAt(ctx.caseId, "phone_verified_at")).isNull(); // activation added no verification
    }

    @Test void defaultChannelIsWhatsApp() throws Exception {
        var ctx = releasePreliminary();
        journey.requestProposalAccess(ctx.token); em.flush(); // no channel => default WhatsApp
        assertThat(activeChannel(ctx.caseId)).isEqualTo("WHATSAPP");
        journey.verifyProposalAccess(ctx.token, proposalCode(ctx.token, "WHATSAPP"));
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
        String firstCode = proposalCode(ctx.token, "WHATSAPP");
        journey.requestProposalAccess(ctx.token, "EMAIL"); em.flush();
        // The prior WhatsApp challenge was revoked when the email challenge was minted.
        assertThatThrownBy(() -> journey.verifyProposalAccess(ctx.token, firstCode)).isInstanceOf(ApiException.class);
    }

    @Test void otpVerificationProducesContactVerifiedNeverIdentityVerified() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, Role.PATIENT);
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
        var grant = journey.verifyProposalAccess(ctx.token, proposalCode(ctx.token, "WHATSAPP"));
        journey.decideProposalPublic(ctx.token, grant.grant(), new PublicProposalDecisionRequest(grant.grant(), "DECLINED", null)); em.flush();
        assertThat(count("SELECT count(*) FROM patient_onboardings WHERE case_id=?", ctx.caseId)).isZero();
    }

    @Test void activationResumesTheCorrectOnboarding() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, Role.PATIENT);
        OnboardingView view = onboarding.myOnboarding(ctx.caseId);
        assertThat(view.caseId()).isEqualTo(ctx.caseId);
        assertThat(view.readiness().accountActivated()).isTrue();
    }

    @Test void theOnboardingPageShowsTheCaseItsPatientAndOnlyTheOnboardingConsentsCoveringTheCase() throws Exception {
        var ctx = onboardedCase();
        var other = onboardedCase("patient-subject-other", "+254700000045", "other2@local.test");
        UUID patientId = patientOf(ctx.caseId);
        authenticate(ctx.patientSubject, Role.PATIENT);
        onboarding.recordConsent(ctx.caseId, new OnboardingConsentRequest("CROSS_BORDER_CARE", "I agree to cross-border care", "v1", "en", null, null));
        consent(patientId, null, "PRIVACY_DATA_PROCESSING", null);                                // patient-wide: covers every case
        consent(patientId, other.caseId, "TELECONSULTATION", null);                               // another case's consent
        consent(patientId, ctx.caseId, "DEPOSIT_CANCELLATION_TERMS", Instant.now().minusSeconds(60)); // revoked
        consent(patientId, null, "PROCEDURE_SPECIFIC", null);                                     // not an onboarding consent
        raw("UPDATE patient_profiles SET phone_verified_at=?, email_verified_at=NULL WHERE id=?", Instant.now(), patientId);

        OnboardingView view = onboarding.myOnboarding(ctx.caseId);
        assertThat(view.caseNumber()).isEqualTo(ctx.caseNumber);
        assertThat(view.completedConsentTypes()).containsExactlyInAnyOrder("CROSS_BORDER_CARE", "PRIVACY_DATA_PROCESSING");
        var p = jdbc.queryForMap("SELECT given_name,family_name,country,whatsapp_number,email FROM patient_profiles WHERE id=?", patientId);
        String name = (p.get("given_name") + " " + (p.get("family_name") == null ? "" : p.get("family_name"))).trim();
        assertThat(view.profile()).isEqualTo(new PatientProfileSummary(name, (String) p.get("country"), (String) p.get("whatsapp_number"), (String) p.get("email"), true, false));
        var row = jdbc.queryForMap("SELECT id,state,subject_type,version FROM patient_onboardings WHERE case_id=?", ctx.caseId);
        assertThat(view.id()).isEqualTo(row.get("id"));
        assertThat(view.state()).isEqualTo(row.get("state"));
        assertThat(view.subjectType()).isEqualTo(row.get("subject_type"));
        assertThat(view.version()).isEqualTo(((Number) row.get("version")).longValue());
        assertThat(view.requiredConsentTypes()).doesNotContain("REPRESENTATIVE_AUTHORIZATION");
        assertThat(onboarding.viewForCase(ctx.caseId)).usingRecursiveComparison().ignoringFields("readiness.updatedAt").isEqualTo(view); // staff see the same page

        // Choosing who onboards needs the version the patient saw; a representative must also authorise.
        assertThatThrownBy(() -> onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("REPRESENTATIVE", "Parent", null, null, view.version() + 1)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("ONBOARDING_VERSION_CONFLICT"));
        OnboardingView chosen = onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("REPRESENTATIVE", "Parent", null, null, view.version()));
        assertThat(chosen.subjectType()).isEqualTo("REPRESENTATIVE");
        assertThat(chosen.version()).isEqualTo(view.version() + 1);
        assertThat(chosen.requiredConsentTypes()).contains("REPRESENTATIVE_AUTHORIZATION");
        assertThat(chosen.completedConsentTypes()).containsExactlyInAnyOrder("CROSS_BORDER_CARE", "PRIVACY_DATA_PROCESSING");
        assertThatThrownBy(() -> onboarding.submit(ctx.caseId, new OnboardingSubmitRequest(view.version())))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("ONBOARDING_VERSION_CONFLICT"));
    }
    private void consent(UUID patientId, UUID caseId, String type, Instant revokedAt) {
        raw("INSERT INTO consent_records(id,patient_id,case_id,consent_type,policy_version,language,exact_text,purpose,scope,channel,captured_by,effective_from,revoked_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), patientId, caseId, type, "v1", "en", "I agree", "Test", "Test", "ONBOARDING_PORTAL", "test", Instant.now(), revokedAt, Instant.now());
    }

    @Test void patientCannotAccessAnotherPatientsOnboarding() throws Exception {
        var mine = onboardedCase();
        var other = onboardedCase("patient-subject-other", "+254700000044", "other@local.test");
        authenticate(mine.patientSubject, Role.PATIENT);
        assertThatThrownBy(() -> onboarding.myOnboarding(other.caseId)).isInstanceOf(ApiException.class).hasMessageContaining("authorized");
    }

    // ---------- Representative / payer ----------

    @Test void representativeAuthorizationScopeAndExpiryAreEnforced() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, Role.PATIENT);
        long v = onboarding.myOnboarding(ctx.caseId).version();
        onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("REPRESENTATIVE", "Parent", "COORDINATION", Instant.now().plusSeconds(86400), v));
        assertThat(journey.customerReadiness(ctx.caseId).representativeAuthorizationValid()).isTrue();
        // Expire the delegation: readiness must now flag missing representative authorization.
        raw("UPDATE patient_representatives SET expires_at=? WHERE representative_subject=?", Instant.now().minusSeconds(60), ctx.patientSubject);
        assertThat(journey.customerReadiness(ctx.caseId).representativeAuthorizationValid()).isFalse();
    }

    @Test void payerOnlyDoesNotGrantRepresentativeAccess() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, Role.PATIENT);
        long v = onboarding.myOnboarding(ctx.caseId).version();
        onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("PAYER", null, null, null, v));
        // A payer never receives a representative (medical-record access) row.
        assertThat(count("SELECT count(*) FROM patient_representatives WHERE patient_id=(SELECT patient_id FROM medical_cases WHERE id=?)", ctx.caseId)).isZero();
    }

    // ---------- Identity verification authority ----------

    @Test void coordinatorCannotMarkIdentityVerified() throws Exception {
        var ctx = onboardedCase();
        UUID identityId = startIdentityAs(ctx);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> identity.review(identityId, new IdentityReviewRequest("VERIFY", "looks fine", "HIGH"))).isInstanceOf(ApiException.class);
    }

    @Test void identityReviewRequiresRecentAuthenticationAndReason() throws Exception {
        var ctx = onboardedCase();
        UUID identityId = startIdentityAs(ctx);
        authenticateStale("reviewer-subject", Role.PATIENT_IDENTITY_REVIEWER);
        assertThatThrownBy(() -> identity.review(identityId, new IdentityReviewRequest("VERIFY", "ok", "HIGH")))
                .isInstanceOf(ApiException.class).hasMessageContaining("Sign in again");
        authenticate("reviewer-subject", Role.PATIENT_IDENTITY_REVIEWER);
        assertThatThrownBy(() -> identity.review(identityId, new IdentityReviewRequest("VERIFY", "  ", "HIGH")))
                .isInstanceOf(ApiException.class);
    }

    @Test void identityReviewIsAuditedAndFlowsToReadiness() throws Exception {
        var ctx = onboardedCase();
        UUID identityId = startIdentityAs(ctx);
        authenticate("reviewer-subject", Role.PATIENT_IDENTITY_REVIEWER);
        identity.review(identityId, new IdentityReviewRequest("VERIFY", "Passport checked against provider record", "HIGH"));
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='IDENTITY_VERIFIED' AND entity_id=?", identityId.toString())).isEqualTo(1);
        authenticate(ctx.patientSubject, Role.PATIENT);
        assertThat(journey.customerReadiness(ctx.caseId).identityVerified()).isTrue();
        // The legal name is encrypted at rest, never stored as plaintext.
        assertThat(jdbc.queryForObject("SELECT status FROM patient_identity_verifications WHERE id=?", String.class, identityId)).isEqualTo("VERIFIED");
        assertThat(jdbc.queryForObject("SELECT legal_name_encrypted FROM patient_identity_verifications WHERE id=?", String.class, identityId)).isNotEqualTo("Jane Doe");
    }

    @Test void identityViewsShowTheLatestCheckTheQueueInRequestOrderAndEachDecisionOnItsCase() throws Exception {
        var ctx = onboardedCase();
        var other = onboardedCase("patient-subject-other", "+254700000044", "other@local.test");
        // The account owner acts for the patient: a representative check names their representation and the case's onboarding.
        authenticate(ctx.patientSubject, Role.PATIENT);
        onboarding.setSubject(ctx.caseId, new OnboardingSubjectRequest("REPRESENTATIVE", "Parent", "COORDINATION", Instant.now().plusSeconds(86400), onboarding.myOnboarding(ctx.caseId).version()));
        UUID first = startIdentityAs(ctx);
        raw("UPDATE patient_identity_verifications SET requested_at=?,created_at=? WHERE id=?", Instant.now().minusSeconds(120), Instant.now().minusSeconds(120), first);
        authenticate(ctx.patientSubject, Role.PATIENT);
        IdentityVerificationView second = identity.start(ctx.caseId, new IdentityStartRequest("REPRESENTATIVE", "Parent", "DOCUMENT", "John Doe", "1980-05-05", "Kenya", "NATIONAL_ID", "Kenya", "12 34 5678"));
        assertThat(second).extracting(IdentityVerificationView::subjectType, IdentityVerificationView::status, IdentityVerificationView::assuranceLevel,
                IdentityVerificationView::provider, IdentityVerificationView::documentReferenceMasked, IdentityVerificationView::verifiedAt)
                .containsExactly("REPRESENTATIVE", "MANUAL_REVIEW", "LOW", "LOCAL_SIMULATOR", "***5678", null);
        assertThat(jdbc.queryForObject("SELECT representative_id FROM patient_identity_verifications WHERE id=?", UUID.class, second.id()))
                .isEqualTo(jdbc.queryForObject("SELECT id FROM patient_representatives WHERE representative_subject=? AND patient_id=?", UUID.class, ctx.patientSubject, patientOf(ctx.caseId)));
        assertThat(jdbc.queryForObject("SELECT onboarding_id FROM patient_identity_verifications WHERE id=?", UUID.class, second.id()))
                .isEqualTo(onboarding.myOnboarding(ctx.caseId).id());
        // Latest first for the patient behind the case (also on the onboarding page); another patient's case is refused.
        assertThat(identity.latestForCase(ctx.caseId, authorityCheck())).isEqualTo(second);
        assertThat(onboarding.myOnboarding(ctx.caseId).identity()).isEqualTo(second);
        assertThat(identity.latestForPatient(patientOf(other.caseId))).isNull();
        assertThatThrownBy(() -> identity.latestForCase(other.caseId, authorityCheck()))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("CASE_ACCESS_DENIED"));

        authenticate("reviewer-subject", Role.PATIENT_IDENTITY_REVIEWER);
        assertThat(identity.reviewQueue()).extracting(IdentityVerificationView::id).containsSubsequence(first, second.id());
        IdentityVerificationView rejected = identity.review(first, new IdentityReviewRequest("REJECT", "Document unreadable", null));
        assertThat(rejected).extracting(IdentityVerificationView::status, IdentityVerificationView::assuranceLevel, IdentityVerificationView::rejectionReason, IdentityVerificationView::verifiedAt, IdentityVerificationView::expiresAt)
                .containsExactly("REJECTED", "LOW", "Document unreadable", null, null);
        assertThat(rejected.version()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT case_id FROM audit_events WHERE event_type='IDENTITY_REJECTED' AND entity_id=?", UUID.class, first.toString())).isEqualTo(ctx.caseId);
        assertThat(identity.reviewQueue()).extracting(IdentityVerificationView::id).doesNotContain(first).contains(second.id());
        assertThatThrownBy(() -> identity.review(first, new IdentityReviewRequest("VERIFY", "Second look", "HIGH")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("IDENTITY_NOT_REVIEWABLE"));
        assertThatThrownBy(() -> identity.review(UUID.randomUUID(), new IdentityReviewRequest("VERIFY", "Unknown", "HIGH")))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("IDENTITY_NOT_FOUND"));

        IdentityVerificationView verified = identity.review(second.id(), new IdentityReviewRequest("VERIFY", "Matches provider record", "HIGH"));
        assertThat(verified.status()).isEqualTo("VERIFIED");
        assertThat(verified.assuranceLevel()).isEqualTo("HIGH");
        assertThat(verified.expiresAt()).isEqualTo(verified.verifiedAt().plus(java.time.Duration.ofDays(730)));
        assertThat(identity.reviewQueue()).extracting(IdentityVerificationView::id).doesNotContain(first, second.id());
        assertThat(jdbc.queryForObject("SELECT case_id FROM audit_events WHERE event_type='IDENTITY_VERIFIED' AND entity_id=?", UUID.class, second.id().toString())).isEqualTo(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT identity_verified_at FROM patient_onboardings WHERE case_id=?", Instant.class, ctx.caseId)).isNotNull();
        assertThat(identity.latestForPatient(patientOf(ctx.caseId))).isEqualTo(verified);
    }
    private com.rehletshifaa.authority.application.Actor authorityCheck() { return authority.authorize(com.rehletshifaa.authority.domain.Permission.PATIENT_SELF_SERVICE); }
    private UUID patientOf(UUID caseId) { return jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId); }

    @Test void onboardingConsentDoesNotDuplicateProcedureSpecificConsent() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, Role.PATIENT);
        assertThatThrownBy(() -> onboarding.recordConsent(ctx.caseId, new OnboardingConsentRequest("PROCEDURE_SPECIFIC", "text", "v1", "en", null, null)))
                .isInstanceOf(ApiException.class).hasMessageContaining("not part of onboarding");
    }

    // ---------- Onboarding completion + readiness gate ----------

    @Test void onboardingCannotCompleteWithMissingSteps() throws Exception {
        var ctx = onboardedCase();
        authenticate(ctx.patientSubject, Role.PATIENT);
        long v = onboarding.myOnboarding(ctx.caseId).version();
        assertThatThrownBy(() -> onboarding.submit(ctx.caseId, new OnboardingSubmitRequest(v))).isInstanceOf(ApiException.class);
    }

    @Test void fullyReadyPatientCanSubmitAndReachReadiness() throws Exception {
        var ctx = onboardedCase();
        makeReady(ctx);
        authenticate(ctx.patientSubject, Role.PATIENT);
        long v = onboarding.myOnboarding(ctx.caseId).version();
        OnboardingView done = onboarding.submit(ctx.caseId, new OnboardingSubmitRequest(v));
        assertThat(done.state()).isEqualTo("COMPLETED");
        assertThat(journey.customerReadiness(ctx.caseId).readyForCoordination()).isTrue();
    }

    // ---------- Deposit waiver authority ----------

    @Test void coordinatorCannotWaiveDeposit() throws Exception {
        var ctx = onboardedCase();
        UUID depositId = depositId(ctx.caseId);
        authenticate("coordinator-subject", Role.COORDINATOR);
        assertThatThrownBy(() -> payment.waiveDeposit(ctx.caseId, depositId, "please waive")).isInstanceOf(ApiException.class);
    }

    @Test void financeWaiverRequiresRecentAuthenticationAndReason() throws Exception {
        var ctx = onboardedCase();
        UUID depositId = depositId(ctx.caseId);
        authenticateStale("finance-subject", Role.FINANCE);
        assertThatThrownBy(() -> payment.waiveDeposit(ctx.caseId, depositId, "reason")).isInstanceOf(ApiException.class).hasMessageContaining("Sign in again");
        authenticate("finance-subject", Role.FINANCE);
        assertThatThrownBy(() -> payment.waiveDeposit(ctx.caseId, depositId, "  ")).isInstanceOf(ApiException.class);
        payment.waiveDeposit(ctx.caseId, depositId, "Hardship approved by senior finance");
        assertThat(payment.depositSatisfied(ctx.caseId)).isTrue();
        assertThat(payment.depositStatusFor(ctx.caseId)).isEqualTo("WAIVED");
    }

    // ---------- Commitment gate ----------

    @Test void nonCancellableCommitmentRejectedWhenNotReady() throws Exception {
        var ctx = onboardedCase();
        driveToTravelCoordination(ctx);
        authenticate("operations-subject", Role.OPERATIONS);
        assertThatThrownBy(() -> journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "OK", null, null, null, null, null, "Facility", null, "CONFIRMED")))
                .isInstanceOf(ApiException.class).hasMessageContaining("not ready");
    }

    @Test void paidDepositDoesNotBypassMissingOnboardingForCommitment() throws Exception {
        var ctx = releasePreliminary();
        acknowledge(ctx);
        raw("DELETE FROM patient_onboardings WHERE case_id=?", ctx.caseId);
        UUID depositId = depositId(ctx.caseId);
        authenticate("finance-subject", Role.FINANCE);
        payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(new BigDecimal("3000.00"), "BANK", "ref-1", "missing-onboarding-pay-1"));
        driveToTravelCoordination(ctx);
        authenticate("operations-subject", Role.OPERATIONS);
        assertThat(readiness.compute(ctx.caseId).blockingItems()).extracting(BlockingItem::code).contains("ONBOARDING_NOT_STARTED");
        assertThatThrownBy(() -> journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "OK", null, null, null, null, null, "Facility", null, "CONFIRMED")))
                .isInstanceOf(ApiException.class).hasMessageContaining("start onboarding");
        // CL3: no deposit-only gate — without onboarding evidence the case does not even enter treatment coordination.
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
    }

    @Test void aMissingOnboardingHoldsAReadyPaidCaseOutOfTreatmentCoordinationAndOperations() throws Exception {
        // CL2+CL3 review: a missing onboarding is owed by staff, yet it must still gate — not only the patient's own steps.
        var ctx = onboardedCase();
        raw("DELETE FROM patient_onboardings WHERE case_id=?", ctx.caseId);
        UUID patient = patientOf(ctx.caseId);
        for (String type : List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"))
            consent(patient, null, type, null);
        authenticate("finance-subject", Role.FINANCE);
        payment.recordReceipt(ctx.caseId, depositId(ctx.caseId), new RecordReceiptRequest(new BigDecimal("3000.00"), "BANK", "no-onboarding", "no-onboarding-" + ctx.caseId));
        em.flush();
        assertThat(caseActions.readinessBlockers(ctx.caseId)).as("nothing is left for the patient").noneMatch(CaseActionService::patientGate);
        assertThat(readiness.compute(ctx.caseId).readyForCoordination()).isFalse();
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED");
        assertThat(transitions.entryBlockers(ctx.caseId, "TRAVEL_COORDINATION")).singleElement().asString().contains("onboarding not started");
        assertThat(transitions.mayEnter(ctx.caseId, "ACCEPTED", "TRAVEL_COORDINATION")).isFalse();
        raw("UPDATE medical_cases SET status='TRAVEL_COORDINATION' WHERE id=?", ctx.caseId);
        assertThat(caseActions.operationsAssignable(ctx.caseId)).isFalse();
        assertThatThrownBy(() -> caseActions.assertOperationsAssignable(ctx.caseId))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("COORDINATION_NOT_READY"))
                .hasMessageContaining("Onboarding not started");
    }

    @Test void completedProfileWithPendingAccountDoesNotSatisfyAccountReadiness() throws Exception {
        var ctx = onboardedCase();
        raw("UPDATE patient_profiles SET account_status='SETUP_PENDING' WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", ctx.caseId);
        assertThat(readiness.compute(ctx.caseId).accountActivated()).isFalse();
        assertThat(readiness.compute(ctx.caseId).blockingItems()).extracting(BlockingItem::code).contains("ACCOUNT_NOT_ACTIVATED");
    }

    @Test void missingOnboardingReadDoesNotInventProgressEvidence() throws Exception {
        var ctx = onboardedCase();
        raw("DELETE FROM patient_onboardings WHERE case_id=?", ctx.caseId);
        raw("UPDATE medical_cases SET status='TRAVEL_COORDINATION' WHERE id=?", ctx.caseId);
        authenticate(ctx.patientSubject, Role.PATIENT);
        assertThatThrownBy(() -> onboarding.myOnboarding(ctx.caseId))
                .isInstanceOf(ApiException.class).hasMessageContaining("no onboarding");
        assertThat(count("SELECT count(*) FROM patient_onboardings WHERE case_id=?", ctx.caseId)).isZero();
    }

    // ================= helpers =================
    private record Ctx(UUID caseId, UUID versionId, String token, String caseNumber, String patientSubject) {}

    private Ctx releasePreliminary() throws Exception { return releasePreliminary("+254700000020", "link@local.test"); }
    private Ctx releasePreliminary(String whatsapp, String email) throws Exception {
        var created = cases.create(new CreateCaseRequest("Link", "Patient", "Kenya", whatsapp, "Cardiac reports", "en", true, null, email, "Africa/Nairobi", "cardiology"));
        cases.submit(created.caseId()); em.flush(); em.clear();
        raw("UPDATE medical_cases SET travel_package_requested=true WHERE id=?", created.caseId());
        authenticate("coordinator-subject", Role.COORDINATOR);
        com.rehletshifaa.coordination.CoordinationTestData.eligibleCoordinator(jdbc, "coordinator-subject");
        if (!com.rehletshifaa.coordination.CoordinationTestData.hasActiveCoordinator(jdbc, created.caseId(), "coordinator-subject"))
            journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        seedDoctor(); seedStaff();
        var doctorAssignment = journey.assign(created.caseId(), new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", Role.CONSULTANT);
        journey.acceptDoctorAssignment(created.caseId(), doctorAssignment.id(), new AssignmentDecisionRequest(true,null));
        var review = journey.saveClinicalReview(created.caseId(), new ClinicalReviewRequest("Reviewed", "SUITABLE", null, "Imaging", "Recommended intervention", "Alt", "Risks", "Seq", "7 days", "Follow-up"));
        journey.approveClinicalReview(created.caseId(), review.id());
        raw("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), review.id(), "Consultant treatment package", new BigDecimal("1000.00"), "EGP", 0, new BigDecimal("1000.00"), true);
        authenticate("coordinator-subject", Role.COORDINATOR);
        var proposal = journey.createProposal(created.caseId(), new ProposalDraftRequest(review.id(), "en", "Plan", "EGP", "Incl", "Excl", "Deposit", "Refund", "Not consent", Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Treatment package", BigDecimal.ONE, new BigDecimal("1000.00"), false, 0)), null));
        var operationsAssignment = journey.assign(created.caseId(), new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", "cardiac-pod", "Ops"));
        var financeAssignment = journey.assign(created.caseId(), new AssignmentRequest("finance-subject", "FINANCE", "PRIMARY", "cardiac-pod", "Finance"));
        authenticate("operations-subject", Role.OPERATIONS); journey.decideAssignment(created.caseId(), operationsAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.OPERATIONS); journey.completeOperations(created.caseId(), proposal.versionId(), "Ops plan");
        authenticate("finance-subject", Role.FINANCE); journey.decideAssignment(created.caseId(), financeAssignment.id(), new AssignmentDecisionRequest(true,null), com.rehletshifaa.authority.domain.Role.FINANCE); journey.approveFinance(created.caseId(), proposal.versionId());
        authenticate("coordinator-subject", Role.COORDINATOR); journey.releaseProposal(created.caseId(), proposal.versionId());
        em.flush();
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, "proposal-ready:" + proposal.versionId()));
        String raw = json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
        SecurityContextHolder.clearContext();
        return new Ctx(created.caseId(), proposal.versionId(), raw, created.caseNumber(), null);
    }

    private void acknowledge(Ctx ctx) throws Exception {
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        var grant = journey.verifyProposalAccess(ctx.token, proposalCode(ctx.token, "WHATSAPP"));
        journey.decideProposalPublic(ctx.token, grant.grant(), new PublicProposalDecisionRequest(grant.grant(), "ACKNOWLEDGED", null, true)); em.flush();
        SecurityContextHolder.clearContext();
    }

    private Ctx onboardedCase() throws Exception { return onboardedCase("patient-subject-main", "+254700000020", "link@local.test"); }
    private Ctx onboardedCase(String patientSubject, String whatsapp, String email) throws Exception {
        var ctx = releasePreliminary(whatsapp, email);
        acknowledge(ctx);
        authenticate(patientSubject, Role.PATIENT);
        startAuthenticatedAccount(ctx, patientSubject);
        em.flush(); SecurityContextHolder.clearContext();
        return new Ctx(ctx.caseId, ctx.versionId, ctx.token, ctx.caseNumber, patientSubject);
    }

    private UUID startIdentityAs(Ctx ctx) {
        authenticate(ctx.patientSubject, Role.PATIENT);
        IdentityVerificationView v = identity.start(ctx.caseId, new IdentityStartRequest("PATIENT", null, "DOCUMENT", "Jane Doe", "1990-01-01", "Kenya", "PASSPORT", "Kenya", "A1234567"));
        SecurityContextHolder.clearContext();
        return v.id();
    }

    /** Satisfy every readiness gate except the final submission. */
    private void makeReady(Ctx ctx) throws Exception {
        UUID identityId = startIdentityAs(ctx);
        authenticate("reviewer-subject", Role.PATIENT_IDENTITY_REVIEWER);
        identity.review(identityId, new IdentityReviewRequest("VERIFY", "Verified against provider record", "HIGH"));
        authenticate(ctx.patientSubject, Role.PATIENT);
        for (String type : List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"))
            onboarding.recordConsent(ctx.caseId, new OnboardingConsentRequest(type, "I agree to " + type, "v1", "en", null, null));
        UUID depositId = depositId(ctx.caseId);
        authenticate("finance-subject", Role.FINANCE);
        payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(new BigDecimal("3000.00"), "BANK", "ready-pay", "ready-pay-" + ctx.caseId));
        SecurityContextHolder.clearContext();
    }

    /**
     * Operations planning on a case that has not settled its deposit. The coordinator can no longer assign
     * Operations at that point (the deposit gate), so the pre-existing assignment is seeded directly — this
     * helper exercises the travel-confirmation gate, not assignment policy.
     */
    private void driveToTravelCoordination(Ctx ctx) {
        raw("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
                UUID.randomUUID(), ctx.caseId, "operations-subject", "OPERATIONS", "PRIMARY", "ACTIVE", "Ops", "coordinator-subject", Instant.now(), Instant.now());
        authenticate("operations-subject", Role.OPERATIONS);
        journey.upsertTravel(ctx.caseId, new TravelPlanRequest(Instant.now().plusSeconds(86400), null, "OK", null, null, null, null, null, "Facility", null, "PLANNING"));
    }

    private void seedDoctor() { if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return; UUID id = UUID.randomUUID(); raw("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now()); raw("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); }
    private void seedStaff() { if (count("SELECT count(*) FROM workforce_people WHERE subject=?", "operations-subject") > 0) return; com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "operations-subject", "OPERATIONS", crypto.encrypt("Operations One")); com.rehletshifaa.workforce.WorkforceTestData.staff(jdbc, "finance-subject", "FINANCE", crypto.encrypt("Finance One")); }

    // Outbox reads are scoped to the link/share token/case that owns the row; _ROWID_ (insertion order) breaks created_at ties on coarse clocks.
    private String proposalCode(String token, String channel) throws Exception { String raw = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o JOIN proposal_access_challenges ch ON o.idempotency_key='proposal-access:'||ch.id JOIN proposal_share_tokens st ON st.id=ch.share_token_id WHERE st.token_hash=? AND o.channel=? ORDER BY o.created_at DESC, o._ROWID_ DESC LIMIT 1", String.class, intakeLifecycle.hash(token), channel)); return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code"); }
    private String activeChannel(UUID caseId) { return jdbc.queryForObject("SELECT delivery_channel FROM proposal_access_challenges WHERE case_id=? AND revoked_at IS NULL AND consumed_at IS NULL", String.class, caseId); }
    /** The binding credential is internal now - no customer message carries it, so the test asks for it directly. */
    private void startAuthenticatedAccount(Ctx ctx, String subject) {
        raw("UPDATE patient_profiles SET external_subject=?,account_status='SETUP_PENDING',profile_status='ACTIVE',profile_completed_at=CURRENT_TIMESTAMP WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", subject, ctx.caseId);
        accounts.session();
    }
    private Instant verifiedAt(UUID caseId, String column) { return jdbc.queryForObject("SELECT " + column + " FROM patient_profiles WHERE id=(SELECT patient_id FROM medical_cases WHERE id=?)", Instant.class, caseId); }
    private UUID depositId(UUID caseId) { return jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1", UUID.class, caseId); }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private void authenticate(String subject, Role role) { authenticate(subject, role, Instant.now()); }
    private void authenticateStale(String subject, Role role) { authenticate(subject, role, Instant.now().minusSeconds(3600)); }
    private void authenticate(String subject, Role role, Instant authTime) { com.rehletshifaa.authority.TestPrincipals.grant(jdbc, crypto, subject, role); com.rehletshifaa.authority.TestPrincipals.signIn(subject, authTime); }
}
