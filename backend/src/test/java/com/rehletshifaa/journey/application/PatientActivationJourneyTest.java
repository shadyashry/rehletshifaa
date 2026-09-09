package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.journey.api.ActivationDtos.*;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
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
import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * The continuous "accepted proposal -> activate profile -> deposit -> coordinator" journey: secure
 * continuation link, prefill of the existing patient, authoritative validation, automatic + idempotent
 * activation, server-resolved deposit, and the post-settlement handoff back to the original coordinator.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PatientActivationJourneyTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired PatientActivationService activation; @Autowired PaymentService payment;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- secure continuation link ----------

    @Test void acceptanceIssuesAnOnboardingLinkForTheExistingPatient() throws Exception {
        var ctx = accepted();
        assertThat(onboardingToken()).isNotBlank();
        // The same canonical patient still owns the case — activation never mints a second patient.
        assertThat(count("SELECT count(*) FROM patient_profiles")).isEqualTo(patientsBefore);
    }

    @Test void sensitiveDataRequiresAVerifiedGrant() throws Exception {
        var ctx = accepted();
        String token = onboardingToken();
        assertThatThrownBy(() -> activation.prefill(token, "not-a-grant"))
                .isInstanceOf(ApiException.class).hasMessageContaining("verify");
    }

    @Test void aStatusLinkCannotBeReplayedAgainstOnboarding() throws Exception {
        var ctx = accepted();
        String statusToken = publicCases.issueStatusLink(ctx.caseId, "en", "case-status-link", "status-" + ctx.caseId);
        em.flush();
        assertThatThrownBy(() -> publicCases.onboardingSummary(statusToken))
                .isInstanceOf(ApiException.class).hasMessageContaining("cannot be used");
    }

    @Test void anInvalidOrExpiredLinkIsRejected() throws Exception {
        accepted();
        assertThatThrownBy(() -> publicCases.onboardingSummary("clearly-invalid-token")).isInstanceOf(ApiException.class);
        String token = onboardingToken();
        jdbc.update("UPDATE case_access_links SET expires_at=? WHERE purpose='ONBOARDING'", Instant.now().minusSeconds(60));
        assertThatThrownBy(() -> publicCases.onboardingSummary(token)).isInstanceOf(ApiException.class);
    }

    // ---------- prefill ----------

    @Test void prefillReturnsWhatThePatientAlreadyProvided() throws Exception {
        var ctx = accepted();
        var pre = activation.prefill(ctx.token, grant(ctx));
        assertThat(pre.fullName()).isEqualTo("Link Patient");
        assertThat(pre.phone()).isEqualTo("+254700000020");
        assertThat(pre.email()).isEqualTo("link@local.test");
        assertThat(pre.countryOfResidence()).isEqualTo("KE");
        assertThat(pre.profileActive()).isFalse();
        assertThat(pre.requiredConsents()).contains("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS");
    }

    // ---------- validation ----------

    @Test void invalidFieldsAreRejectedPerField() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        var bad = new ProfileActivationRequest("A", "not-an-email", "123", LocalDate.now().plusDays(1),
                "Nowhere", "Nowhere", "en", "ROBOT", consents());
        assertThatThrownBy(() -> activation.activate(ctx.token, g, bad))
                .isInstanceOf(FieldValidationException.class)
                .satisfies(e -> assertThat(((FieldValidationException) e).errors()).extracting("field")
                        .contains("fullName", "email", "phone", "dateOfBirth", "nationality", "countryOfResidence", "sex"));
    }

    @Test void internationalAndArabicNamesAreAccepted() throws Exception {
        var ctx = accepted();
        var result = activation.activate(ctx.token, grant(ctx), request("محمد عبد الله الأحمد"));
        assertThat(result.profileActive()).isTrue();
        assertThat(jdbc.queryForObject("SELECT full_name FROM patient_profiles WHERE id=?", String.class, patientId(ctx.caseId)))
                .isEqualTo("محمد عبد الله الأحمد");
    }

    @Test void missingConsentBlocksActivation() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        var noConsent = new ProfileActivationRequest("Link Patient", "link@local.test", "+254700000020",
                LocalDate.of(1990, 1, 1), "KE", "KE", "en", "MALE", List.of());
        assertThatThrownBy(() -> activation.activate(ctx.token, g, noConsent)).isInstanceOf(FieldValidationException.class);
        assertThat(profileStatus(ctx.caseId)).isEqualTo("PENDING");
    }

    // ---------- automatic, idempotent activation ----------

    @Test void activationIsAutomaticAndNeedsNoApproval() throws Exception {
        var ctx = accepted();
        var result = activation.activate(ctx.token, grant(ctx), request("Link Patient"));
        em.flush();
        assertThat(result.profileActive()).isTrue();
        assertThat(profileStatus(ctx.caseId)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT state FROM patient_onboardings WHERE case_id=?", String.class, ctx.caseId)).isEqualTo("COMPLETED");
        // No identity/KYC evidence was required to get here.
        assertThat(count("SELECT count(*) FROM patient_identity_verifications WHERE patient_id=?", patientId(ctx.caseId))).isZero();
    }

    @Test void replayedActivationChangesNothing() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        activation.activate(ctx.token, g, request("Link Patient")); em.flush();
        int consents = count("SELECT count(*) FROM consent_records WHERE case_id=?", ctx.caseId);
        var again = activation.activate(ctx.token, g, request("Link Patient")); em.flush();
        assertThat(again.profileActive()).isTrue();
        assertThat(count("SELECT count(*) FROM consent_records WHERE case_id=?", ctx.caseId)).isEqualTo(consents);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_PROFILE_ACTIVATED'", ctx.caseId)).isEqualTo(1);
    }

    @Test void aCancelledCaseCannotBeActivated() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        jdbc.update("UPDATE medical_cases SET status='CANCELLED' WHERE id=?", ctx.caseId);
        assertThatThrownBy(() -> activation.activate(ctx.token, g, request("Link Patient")))
                .isInstanceOf(ApiException.class).hasMessageContaining("no longer active");
    }

    // ---------- deposit ----------

    @Test void depositAmountAndCurrencyComeFromTheBackend() throws Exception {
        var ctx = accepted();
        var summary = activation.deposit(ctx.token, grant(ctx));
        BigDecimal expected = jdbc.queryForObject("SELECT total_display FROM deposits WHERE case_id=?", BigDecimal.class, ctx.caseId);
        assertThat(summary.amountDue()).isEqualByComparingTo(expected);
        assertThat(summary.currency()).isEqualTo(jdbc.queryForObject("SELECT currency FROM deposits WHERE case_id=?", String.class, ctx.caseId));
        assertThat(summary.satisfied()).isFalse();
    }

    // ---------- post-deposit handoff ----------

    @Test void settlingTheDepositContinuesTheJourneyAndRestoresTheCoordinator() throws Exception {
        var ctx = accepted();
        activation.activate(ctx.token, grant(ctx), request("Link Patient")); em.flush();
        assertThat(status(ctx.caseId)).isEqualTo("ACCEPTED"); // still awaiting the deposit

        settleDeposit(ctx, "pay-1"); em.flush();

        assertThat(status(ctx.caseId)).isEqualTo("TRAVEL_COORDINATION");
        assertThat(jdbc.queryForObject("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND status='ACTIVE'", String.class, ctx.caseId))
                .isEqualTo("coordinator-subject");
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_role='COORDINATOR' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
        // The coordinator gets real work, an in-app notification and one work email — not a status change.
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=? AND event_type='DEPOSIT_SETTLED'", "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?", "work-email:deposit-settled:" + ctx.caseId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT waiting_on FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo("STAFF");
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key=?", "deposit-settled-patient:" + ctx.caseId)).isEqualTo(1);
    }

    @Test void aDuplicateSettlementDoesNotDuplicateTasksOrEvents() throws Exception {
        var ctx = accepted();
        activation.activate(ctx.token, grant(ctx), request("Link Patient")); em.flush();
        settleDeposit(ctx, "pay-1"); em.flush();
        settleDeposit(ctx, "pay-2"); em.flush(); // a second authoritative receipt on an already-paid deposit

        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='CASE_DEPOSIT_HANDOFF'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_tasks WHERE case_id=? AND owner_role='COORDINATOR' AND status='OPEN'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM staff_notifications WHERE recipient_subject=?", "coordinator-subject")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM case_status_history WHERE case_id=? AND to_status='TRAVEL_COORDINATION'", ctx.caseId)).isEqualTo(1);
    }

    @Test void anIdenticalReceiptIsIgnoredByIdempotencyKey() throws Exception {
        var ctx = accepted();
        activation.activate(ctx.token, grant(ctx), request("Link Patient")); em.flush();
        settleDeposit(ctx, "same-key"); em.flush();
        settleDeposit(ctx, "same-key"); em.flush();
        assertThat(count("SELECT count(*) FROM payment_events WHERE case_id=? AND event_type='PAYMENT_RECORDED'", ctx.caseId)).isEqualTo(1);
    }

    // ---------- one journey: profile activation continues into the authenticated portal ----------

    @Test void theAcceptedPatientReceivesOneContinuationMessageOnly() throws Exception {
        var ctx = accepted();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION'")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='ACCOUNT_ACTIVATION'")).isZero();
        // The account-binding capability itself is preserved — it is simply no longer a second customer journey.
        assertThat(count("SELECT count(*) FROM account_activations WHERE case_id=?", ctx.caseId)).isEqualTo(1);
    }

    @Test void portalAccessIsRefusedUntilTheProfileIsActive() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        assertThatThrownBy(() -> activation.portalAccess(ctx.token, g))
                .isInstanceOf(ApiException.class).hasMessageContaining("complete your profile");
        assertThat(jdbc.queryForObject("SELECT external_subject FROM patient_profiles WHERE id=?", String.class, patientId(ctx.caseId))).isNull();
    }

    @Test void activationHandsOverAnAccountBindingThatOpensEveryAuthorizedCase() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        activation.activate(ctx.token, g, request("Link Patient")); em.flush();
        var handoff = activation.portalAccess(ctx.token, g); em.flush();
        assertThat(handoff.alreadyLinked()).isFalse();
        assertThat(handoff.activationToken()).isNotBlank();

        authenticate("portal-patient-subject", "PATIENT");
        assertThat(journey.activateAccount(handoff.activationToken()).status()).isEqualTo("ACTIVATED");
        // Only now — behind Keycloak, as the bound patient — does the portal list every authorized case.
        assertThat(journey.patientCases()).extracting(CaseView::caseNumber).contains(ctx.caseNumber);
        assertThatThrownBy(() -> journey.activateAccount(handoff.activationToken()))
                .isInstanceOf(ApiException.class).hasMessageContaining("already been used");
    }

    @Test void anAlreadyLinkedProfileIsSentStraightToSignIn() throws Exception {
        var ctx = accepted(); String g = grant(ctx);
        activation.activate(ctx.token, g, request("Link Patient")); em.flush();
        jdbc.update("UPDATE patient_profiles SET external_subject=? WHERE id=?", "already-bound", patientId(ctx.caseId));
        var handoff = activation.portalAccess(ctx.token, g);
        assertThat(handoff.alreadyLinked()).isTrue();
        assertThat(handoff.activationToken()).isNull();
    }

    // ---------- authorization ----------

    @Test void aGrantCannotBeUsedAgainstAnotherPatientsCase() throws Exception {
        var first = accepted();
        String firstGrant = grant(first);
        var second = acceptedFor("+254700000099", "second@local.test");
        String secondToken = onboardingTokenFor(second.caseId);
        // A grant is bound to its own link: replaying it on another patient's link must fail.
        assertThatThrownBy(() -> activation.prefill(secondToken, firstGrant)).isInstanceOf(ApiException.class);
        // And the first patient's own view never leaks the second case.
        assertThat(activation.prefill(first.token, firstGrant).caseNumber()).isEqualTo(first.caseNumber);
    }

    // ================= helpers =================
    private record Ctx(UUID caseId, UUID versionId, String token, String caseNumber) {}
    private int patientsBefore;

    private List<String> consents() { return List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"); }

    private ProfileActivationRequest request(String name) {
        return new ProfileActivationRequest(name, "link@local.test", "+254700000020", LocalDate.of(1990, 1, 1),
                "KE", "KE", "en", "MALE", consents());
    }

    private Ctx accepted() throws Exception { return acceptedFor("+254700000020", "link@local.test"); }

    private Ctx acceptedFor(String whatsapp, String email) throws Exception {
        var ctx = releasePreliminary(whatsapp, email);
        patientsBefore = count("SELECT count(*) FROM patient_profiles");
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        var g = journey.verifyProposalAccess(ctx.token, proposalCode("WHATSAPP"));
        journey.decideProposalPublic(ctx.token, g.grant(), new PublicProposalDecisionRequest(g.grant(), "ACKNOWLEDGED", null));
        em.flush(); SecurityContextHolder.clearContext();
        return new Ctx(ctx.caseId(), ctx.versionId(), onboardingTokenFor(ctx.caseId()), ctx.caseNumber());
    }

    /** Verify the one-time code on the onboarding link and return the short-lived grant. */
    private String grant(Ctx ctx) throws Exception {
        publicCases.requestAccess(ctx.token, "WHATSAPP"); em.flush();
        var g = publicCases.verify(ctx.token, accessCode());
        SecurityContextHolder.clearContext();
        return g.grant();
    }

    private void settleDeposit(Ctx ctx, String key) {
        UUID depositId = jdbc.queryForObject("SELECT id FROM deposits WHERE case_id=? ORDER BY created_at DESC LIMIT 1", UUID.class, ctx.caseId);
        BigDecimal total = jdbc.queryForObject("SELECT total_egp FROM deposits WHERE id=?", BigDecimal.class, depositId);
        authenticate("finance-subject", "FINANCE");
        payment.recordReceipt(ctx.caseId, depositId, new RecordReceiptRequest(total, "BANK", "ref-" + key, key + "-" + ctx.caseId));
        SecurityContextHolder.clearContext();
    }

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
        return new Ctx(created.caseId(), proposal.versionId(), raw, created.caseNumber());
    }

    private String onboardingToken() throws Exception {
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION' ORDER BY created_at DESC LIMIT 1", String.class));
        return json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String onboardingTokenFor(UUID caseId) throws Exception {
        String key = jdbc.queryForObject("SELECT idempotency_key FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION' AND idempotency_key IN (SELECT 'onboarding:'||id FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING') ORDER BY created_at DESC LIMIT 1", String.class, caseId);
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, key));
        return json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String accessCode() throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='CASE_ACCESS' ORDER BY created_at DESC LIMIT 1", String.class));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private String proposalCode(String channel) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PROPOSAL_ACCESS' AND channel=? ORDER BY created_at DESC LIMIT 1", String.class, channel));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private UUID patientId(UUID caseId) { return jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId); }
    private String profileStatus(UUID caseId) { return jdbc.queryForObject("SELECT profile_status FROM patient_profiles WHERE id=?", String.class, patientId(caseId)); }
    private String status(UUID caseId) { return jdbc.queryForObject("SELECT status FROM medical_cases WHERE id=?", String.class, caseId); }
    private void seedDoctor() { if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return; UUID id = UUID.randomUUID(); jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now()); jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); }
    private void seedStaff() { if (count("SELECT count(*) FROM staff_members WHERE external_subject=?", "operations-subject") > 0) return; jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"), Instant.now(), Instant.now()); jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "finance-subject", "FINANCE", crypto.encrypt("Finance One"), Instant.now(), Instant.now()); }
    private void authenticate(String subject, String... roles) {
        var jwt = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,
                Arrays.stream(roles).map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList()));
    }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
