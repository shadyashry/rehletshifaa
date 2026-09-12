package com.rehletshifaa.journey.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.casemanagement.api.CaseDtos.*;
import com.rehletshifaa.casemanagement.application.CaseService;
import com.rehletshifaa.identity.LocalPatientIdentitySimulator;
import com.rehletshifaa.identity.PatientIdentityPort;
import com.rehletshifaa.journey.api.ActivationDtos.*;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.crypto.CryptoService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * Patient identity, contact ownership and account setup across Send My Case → Complete Profile → sign in.
 *
 * <p>What is proven: the canonical patient is the internal id (never email/phone/name); structured names are
 * stored and legacy full names are never parsed; a representative's channels are never promoted into the
 * patient; shared or already-registered email/mobile never merge, reject or reveal anything; account setup is
 * delegated to the identity provider without any password of ours; and every step is idempotent.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class PatientIdentityAndAccountTest {
    @Autowired CaseService cases; @Autowired JourneyService journey; @Autowired PublicCaseAccessService publicCases;
    @Autowired PatientActivationService activation; @Autowired PatientAccountService account;
    @Autowired PatientIdentityPort identityPort; LocalPatientIdentitySimulator identity;
    @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper json; @Autowired CryptoService crypto; @Autowired EntityManager em;

    @BeforeEach void reset() { identity = (LocalPatientIdentitySimulator) identityPort; identity.reset(); }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    // ---------- Send My Case: structured names, who the case is for, contact ownership ----------

    @Test void sendMyCaseStoresStructuredNamesAndNeverAFullNameAsIdentity() {
        var created = cases.create(new CreateCaseRequest("Mohamed Ahmed", "El Sayed", "Egypt", "+201000000001", "Reports", "en", true, null));
        UUID patientId = patientId(created.caseId());
        assertThat(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("Mohamed Ahmed");
        assertThat(jdbc.queryForObject("SELECT family_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("El Sayed");
        assertThat(jdbc.queryForObject("SELECT name_source FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("STRUCTURED");
        // The case row only carries a display snapshot; the patient row is the identity.
        assertThat(jdbc.queryForObject("SELECT full_name FROM medical_cases WHERE id=?", String.class, created.caseId())).isEqualTo("Mohamed Ahmed El Sayed");
        assertThat(jdbc.queryForObject("SELECT contact_role FROM case_submission_contacts WHERE case_id=?", String.class, created.caseId())).isEqualTo("PATIENT");
        assertThat(jdbc.queryForObject("SELECT mobile_owner FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("PATIENT");
    }

    @Test void aSingleLegalNameIsSupportedDeliberatelyNotByInventingASurname() {
        assertThatThrownBy(() -> cases.create(new CreateCaseRequest("MYSELF", "Ayaan", "", null, null, "Kenya", "+254700000002", null, "en", true, null, null, null, null, null)))
                .isInstanceOf(FieldValidationException.class);
        var created = cases.create(new CreateCaseRequest("MYSELF", "Ayaan", "", true, null, "Kenya", "+254700000002", null, "en", true, null, null, null, null, null));
        assertThat(jdbc.queryForObject("SELECT family_name FROM patient_profiles WHERE id=?", String.class, patientId(created.caseId()))).isNull();
        assertThat(jdbc.queryForObject("SELECT full_name FROM medical_cases WHERE id=?", String.class, created.caseId())).isEqualTo("Ayaan");
    }

    @Test void emailStaysOptionalAtSendMyCase() {
        var created = cases.create(new CreateCaseRequest("No", "Email", "Kenya", "+254700000003", "Reports", "en", true, null));
        assertThat(jdbc.queryForObject("SELECT email FROM patient_profiles WHERE id=?", String.class, patientId(created.caseId()))).isNull();
    }

    @Test void aCaseForSomeoneElseKeepsTheRepresentativeContactOffThePatient() {
        var created = cases.create(new CreateCaseRequest("SOMEONE_ELSE", "Layla", "Hassan", null, new RepresentativeContact("Omar Hassan", "PARENT"),
                "Egypt", "+201000000004", "Paediatric cardiology", "en", true, null, "omar@local.test", null, "cardiology", null));
        UUID patientId = patientId(created.caseId());
        // The patient is Layla: her profile has NO email and NO mobile — those belong to Omar.
        assertThat(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("Layla");
        assertThat(jdbc.queryForObject("SELECT email FROM patient_profiles WHERE id=?", String.class, patientId)).isNull();
        assertThat(jdbc.queryForObject("SELECT whatsapp_number FROM patient_profiles WHERE id=?", String.class, patientId)).isNull();
        assertThat(jdbc.queryForObject("SELECT contact_role FROM case_submission_contacts WHERE case_id=?", String.class, created.caseId())).isEqualTo("REPRESENTATIVE");
        assertThat(jdbc.queryForObject("SELECT contact_name FROM case_submission_contacts WHERE case_id=?", String.class, created.caseId())).isEqualTo("Omar Hassan");
        assertThat(jdbc.queryForObject("SELECT relationship_to_patient FROM case_submission_contacts WHERE case_id=?", String.class, created.caseId())).isEqualTo("PARENT");
        assertThat(jdbc.queryForObject("SELECT email FROM case_submission_contacts WHERE case_id=?", String.class, created.caseId())).isEqualTo("omar@local.test");
        // Communication still works — it goes to the submitter's channel.
        cases.submit(created.caseId()); em.flush();
        assertThat(jdbc.queryForObject("SELECT destination FROM notification_outbox WHERE notification_type='CASE_STATUS_LINK' AND idempotency_key LIKE 'case-status:%' ORDER BY created_at DESC LIMIT 1", String.class)).isEqualTo("+201000000004");
    }

    @Test void aSharedWhatsAppNumberIsAcceptedAndNeverMergesPatients() {
        var first = cases.create(new CreateCaseRequest("Father", "Family", "Egypt", "+201000000005", "Reports", "en", true, null));
        var second = cases.create(new CreateCaseRequest("Son", "Family", "Egypt", "+201000000005", "Reports", "en", true, null));
        assertThat(patientId(first.caseId())).isNotEqualTo(patientId(second.caseId()));
        assertThat(count("SELECT count(*) FROM patient_profiles WHERE whatsapp_number=?", "+201000000005")).isEqualTo(2);
    }

    @Test void aRepresentativesSharedNumberIsNeverStampedAsThePatientsVerifiedMobile() throws Exception {
        var ctx = accepted(new CreateCaseRequest("SOMEONE_ELSE", "Layla", "Hassan", null, new RepresentativeContact("Omar Hassan", "PARENT"),
                "Kenya", "+254700000006", "Cardiac reports", "en", true, null, "omar6@local.test", "Africa/Nairobi", "cardiology", null));
        // The OTP went to Omar's number and proved Omar's possession — the patient's profile records nothing.
        grant(ctx);
        UUID patientId = patientId(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT phone_verified_at FROM patient_profiles WHERE id=?", Object.class, patientId)).isNull();
        assertThat(jdbc.queryForObject("SELECT whatsapp_number FROM patient_profiles WHERE id=?", String.class, patientId)).isNull();
        var pre = activation.prefill(ctx.token, grant(ctx));
        assertThat(pre.submittedBy()).isEqualTo("REPRESENTATIVE");
        assertThat(pre.representativeName()).isEqualTo("Omar Hassan");
        assertThat(pre.knownMobile()).isEqualTo("+254700000006");
        assertThat(pre.mobileOwner()).isEqualTo("REPRESENTATIVE");
        // Omar's email is NOT offered as Layla's account email.
        assertThat(pre.candidateEmail()).isNull();
    }

    // ---------- Complete Profile: continuation of the same patient, email mandatory, ownership explicit ----------

    @Test void completeProfileIsPrefilledFromSendMyCaseAndRequiresAnAccountEmail() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000010", null));
        String g = grant(ctx);
        var pre = activation.prefill(ctx.token, g);
        assertThat(pre.givenName()).isEqualTo("Link"); assertThat(pre.familyName()).isEqualTo("Patient");
        assertThat(pre.countryOfResidence()).isEqualTo("KE"); assertThat(pre.knownMobile()).isEqualTo("+254700000010");
        assertThat(pre.candidateEmail()).isNull();
        assertThat(pre.nameConfirmationRequired()).isFalse();
        assertThatThrownBy(() -> activation.activate(ctx.token, g, profile("Link", "Patient", null, "+254700000010", "PATIENT")))
                .isInstanceOf(FieldValidationException.class)
                .satisfies(e -> assertThat(((FieldValidationException) e).errors()).extracting("field").contains("email"));
        assertThat(identity.accounts()).isZero();
    }

    @Test void noEmailAtIntake_thenProfileEmail_thenProviderSetup_thenActive() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000011", null));
        String g = grant(ctx);
        var result = activation.activate(ctx.token, g, profile("Link", "Patient", "new11@local.test", "+254700000011", "PATIENT")); em.flush();
        assertThat(result.profileActive()).isTrue();
        assertThat(result.account().status()).isEqualTo(AccountStatus.SETUP_PENDING);
        assertThat(result.currentAction()).isEqualTo(PatientAction.SET_UP_ACCOUNT);
        String subject = subjectOf(ctx.caseId);
        // Provisioned WITHOUT a password and with the provider's own setup actions (verify email + create password).
        assertThat(identity.findBySubject(subject).orElseThrow().requiredActions()).containsExactly("VERIFY_EMAIL", "UPDATE_PASSWORD");
        assertThat(identity.setupMailsFor(subject)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE destination=? AND template_key LIKE '%password%'", "new11@local.test")).isZero();
        finishSetup(subject);
        assertThat(accountStatus(ctx.caseId)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT email_verified_at FROM patient_profiles WHERE id=?", Object.class, patientId(ctx.caseId))).isNotNull();
        assertThat(journey.patientCases()).extracting(CaseView::caseNumber).contains(ctx.caseNumber);
    }

    @Test void intakeEmailIsOfferedAsCandidateAndReusedForTheAccount() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000012", "cand12@local.test"));
        String g = grant(ctx);
        assertThat(activation.prefill(ctx.token, g).candidateEmail()).isEqualTo("cand12@local.test");
        activation.activate(ctx.token, g, profile("Link", "Patient", "cand12@local.test", "+254700000012", "PATIENT")); em.flush();
        assertThat(identity.findBySubject(subjectOf(ctx.caseId)).orElseThrow().email()).isEqualTo("cand12@local.test");
        assertThat(identity.accounts()).isEqualTo(1);
    }

    @Test void changingTheCandidateEmailUsesTheNewOneAndPreservesTheSubmissionContact() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000013", "old13@local.test"));
        String g = grant(ctx);
        activation.activate(ctx.token, g, profile("Link", "Patient", "new13@local.test", "+254700000013", "PATIENT")); em.flush();
        UUID patientId = patientId(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT email FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("new13@local.test");
        assertThat(jdbc.queryForObject("SELECT email_verified_at FROM patient_profiles WHERE id=?", Object.class, patientId)).isNull();
        assertThat(identity.findBySubject(subjectOf(ctx.caseId)).orElseThrow().requiredActions()).contains("VERIFY_EMAIL");
        // The address given at submission is kept as history on the submission contact, not overwritten.
        assertThat(jdbc.queryForObject("SELECT email FROM case_submission_contacts WHERE case_id=?", String.class, ctx.caseId)).isEqualTo("old13@local.test");
    }

    @Test void normalFieldsCanBeCorrectedButCaseFieldsAreUntouched() throws Exception {
        var ctx = accepted(request("Lnik", "Patiemt", "+254700000014", null));
        String g = grant(ctx);
        String concernBefore = jdbc.queryForObject("SELECT condition_description FROM medical_cases WHERE id=?", String.class, ctx.caseId);
        activation.activate(ctx.token, g, profile("Link", "Patient", "fix14@local.test", "+254700000014", "PATIENT")); em.flush();
        UUID patientId = patientId(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("Link");
        assertThat(jdbc.queryForObject("SELECT family_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("Patient");
        // Case data is read-only for the profile step and the case list shows the canonical (corrected) name.
        assertThat(jdbc.queryForObject("SELECT condition_description FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo(concernBefore);
        assertThat(jdbc.queryForObject("SELECT care_category FROM medical_cases WHERE id=?", String.class, ctx.caseId)).isEqualTo("cardiology");
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.coordinatorQueue()).filteredOn(c -> c.id().equals(ctx.caseId)).extracting(CaseView::patientName).containsExactly("Link Patient");
    }

    @Test void representativeMobileAtProfileIsNotStoredAsThePatientsOwn() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000015", null));
        String g = grant(ctx);
        // The patient says the intake number belongs to a family member and gives no personal number.
        activation.activate(ctx.token, g, profile("Link", "Patient", "own15@local.test", "+254700000015", "REPRESENTATIVE")); em.flush();
        UUID patientId = patientId(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT whatsapp_number FROM patient_profiles WHERE id=?", String.class, patientId)).isNull();
        assertThat(jdbc.queryForObject("SELECT phone_verified_at FROM patient_profiles WHERE id=?", Object.class, patientId)).isNull();
        assertThat(jdbc.queryForObject("SELECT contact_role FROM case_submission_contacts WHERE case_id=?", String.class, ctx.caseId)).isEqualTo("REPRESENTATIVE");
        assertThat(jdbc.queryForObject("SELECT whatsapp_number FROM case_submission_contacts WHERE case_id=?", String.class, ctx.caseId)).isEqualTo("+254700000015");
        // Case communication still reaches the family member's number.
        String g2 = grant(ctx);
        assertThat(g2).isNotBlank();
    }

    @Test void aNumberVerifiedAsAnotherAccountsPersonalMobileIsNeverSilentlyReVerified() throws Exception {
        UUID other = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_profiles(id,external_subject,full_name,given_name,family_name,name_source,country,whatsapp_number,mobile_owner,phone_verified_at,preferred_language,account_status,profile_status,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
                other, "other-active-subject", "Other Person", "Other", "Person", "STRUCTURED", "Kenya", "+254700000016", "PATIENT", Instant.now(), "en", "ACTIVE", "ACTIVE", Instant.now(), Instant.now());
        var ctx = accepted(request("Link", "Patient", "+254700000016", null));
        String g = grant(ctx); // OTP on the shared number: possession, not exclusive identity
        activation.activate(ctx.token, g, profile("Link", "Patient", "sec16@local.test", "+254700000016", "PATIENT")); em.flush();
        UUID patientId = patientId(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT whatsapp_number FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("+254700000016");
        assertThat(jdbc.queryForObject("SELECT phone_verified_at FROM patient_profiles WHERE id=?", Object.class, patientId)).isNull();
        // The other account keeps its verified status and nothing about it leaked into this patient's result.
        assertThat(jdbc.queryForObject("SELECT phone_verified_at FROM patient_profiles WHERE id=?", Object.class, other)).isNotNull();
        assertThat(patientId).isNotEqualTo(other);
    }

    // ---------- existing accounts: signal, never proof ----------

    @Test void sendMyCaseWithAnAlreadyRegisteredEmailCreatesNoDuplicateAndRevealsNothing() {
        identity.seedActiveAccount("ahmed@local.test");
        var created = cases.create(new CreateCaseRequest("Ahmed", "Hassan", "Egypt", "+201000000020", "Reports", "en", true, null, "ahmed@local.test", null));
        cases.submit(created.caseId()); em.flush();
        assertThat(identity.accounts()).isEqualTo(1); // no second identity account
        UUID patientId = patientId(created.caseId());
        assertThat(jdbc.queryForObject("SELECT external_subject FROM patient_profiles WHERE id=?", String.class, patientId)).isNull(); // not auto-linked
        // A neutral continuation link went to the address; the public response carried nothing about it.
        assertThat(count("SELECT count(*) FROM patient_account_link_requests WHERE patient_id=? AND origin='INTAKE'", patientId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='ACCOUNT_LINK' AND destination=?", "ahmed@local.test")).isEqualTo(1);
    }

    @Test void sameEmailDifferentNameIsNeverMergedAutomatically() {
        String subject = identity.seedActiveAccount("ahmed21@local.test");
        UUID existing = seedLinkedPatient(subject, "Ahmed", "Hassan", "ahmed21@local.test");
        var created = cases.create(new CreateCaseRequest("Mohamed", "Hassan", "Egypt", "+201000000021", "Reports", "en", true, null, "ahmed21@local.test", null));
        cases.submit(created.caseId()); em.flush();
        assertThat(patientId(created.caseId())).isNotEqualTo(existing);
        assertThat(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, existing)).isEqualTo("Ahmed");
        assertThat(count("SELECT count(*) FROM medical_cases WHERE patient_id=?", existing)).isZero();
    }

    @Test void theAccountOwnerResolvesTheCaseAsTheirsAndItJoinsTheirCanonicalPatient() throws Exception {
        String subject = identity.seedActiveAccount("ahmed22@local.test");
        UUID existing = seedLinkedPatient(subject, "Ahmed", "Hassan", "ahmed22@local.test");
        var created = cases.create(new CreateCaseRequest("Ahmed", "Hassan", "Egypt", "+201000000022", "Reports", "en", true, null, "ahmed22@local.test", null));
        cases.submit(created.caseId()); em.flush();
        UUID pending = patientId(created.caseId());
        String token = linkToken(pending);
        // A different account cannot use the link, even with the token.
        authenticateWithEmail("intruder", "intruder@local.test", "PATIENT");
        assertThatThrownBy(() -> account.linkRequest(token)).isInstanceOf(ApiException.class);
        // The owner of the address sees the question and answers "this is me".
        authenticateWithEmail(subject, "ahmed22@local.test", "PATIENT");
        var view = account.linkRequest(token);
        assertThat(view.caseNumber()).isEqualTo(created.caseNumber());
        var resolved = account.resolveLinkRequest(token, new AccountLinkResolution("SAME_PATIENT", null)); em.flush();
        assertThat(resolved.resolution()).isEqualTo("SAME_PATIENT");
        assertThat(patientId(created.caseId())).isEqualTo(existing);
        assertThat(jdbc.queryForObject("SELECT merged_into_patient_id FROM patient_profiles WHERE id=?", UUID.class, pending)).isEqualTo(existing);
        assertThat(journey.patientCases()).extracting(CaseView::caseNumber).contains(created.caseNumber());
        assertThat(identity.accounts()).isEqualTo(1);
        // Replaying the resolution changes nothing.
        account.resolveLinkRequest(token, new AccountLinkResolution("REPRESENTATIVE", "PARENT"));
        assertThat(count("SELECT count(*) FROM patient_representatives WHERE patient_id=?", existing)).isZero();
    }

    @Test void theAccountOwnerResolvesAsRepresentativeAndThePatientStaysSeparate() throws Exception {
        String subject = identity.seedActiveAccount("omar23@local.test");
        UUID omar = seedLinkedPatient(subject, "Omar", "Hassan", "omar23@local.test");
        // Omar typed his own email while completing his daughter's profile.
        var ctx = accepted(request("Layla", "Hassan", "+254700000023", null));
        String g = grant(ctx);
        var result = activation.activate(ctx.token, g, profile("Layla", "Hassan", "omar23@local.test", "+254700000023", "REPRESENTATIVE")); em.flush();
        // No second account, nothing linked, neutral "check your email" answer.
        assertThat(identity.accounts()).isEqualTo(1);
        assertThat(result.account().awaitingEmail()).isTrue();
        assertThat(result.account().status()).isEqualTo(AccountStatus.NOT_PROVISIONED);
        UUID layla = patientId(ctx.caseId);
        assertThat(jdbc.queryForObject("SELECT external_subject FROM patient_profiles WHERE id=?", String.class, layla)).isNull();

        authenticateWithEmail(subject, "omar23@local.test", "PATIENT");
        account.resolveLinkRequest(linkToken(layla), new AccountLinkResolution("REPRESENTATIVE", "PARENT")); em.flush();
        assertThat(patientId(ctx.caseId)).isEqualTo(layla); // still her own case, her own patient
        assertThat(layla).isNotEqualTo(omar);
        assertThat(jdbc.queryForObject("SELECT email FROM patient_profiles WHERE id=?", String.class, layla)).isNull(); // Omar's email is not Layla's
        assertThat(count("SELECT count(*) FROM patient_representatives WHERE patient_id=? AND representative_subject=? AND relationship='PARENT'", layla, subject)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT subject_type FROM patient_onboardings WHERE case_id=?", String.class, ctx.caseId)).isEqualTo("REPRESENTATIVE");
        // Omar now sees Layla's case through the existing delegation model — as her representative.
        assertThat(journey.patientCases()).extracting(CaseView::caseNumber).contains(ctx.caseNumber);
        // Layla's own account setup will ask for HER email; resending never creates a second identity account.
        assertThat(identity.accounts()).isEqualTo(1);
    }

    @Test void completeProfileWithARegisteredEmailNeverProvisionsOrMerges() throws Exception {
        identity.seedActiveAccount("taken24@local.test");
        var ctx = accepted(request("Link", "Patient", "+254700000024", null));
        String g = grant(ctx);
        var result = activation.activate(ctx.token, g, profile("Link", "Patient", "taken24@local.test", "+254700000024", "PATIENT")); em.flush();
        assertThat(identity.accounts()).isEqualTo(1);
        assertThat(result.account().awaitingEmail()).isTrue();
        assertThat(result.journeyStage()).isEqualTo(JourneyStage.ACCOUNT_SETUP);
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE notification_type='ACCOUNT_LINK' AND destination=?", "taken24@local.test")).isEqualTo(1);
        // The same masked wording as a fresh setup — nothing distinguishes "exists" from "new".
        assertThat(result.account().emailHint()).isEqualTo("ta***@local.test");
    }

    // ---------- returning patients and idempotency ----------

    @Test void anExistingActivePatientStartsANewCaseUnderTheSamePatient() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000030", null));
        String g = grant(ctx);
        activation.activate(ctx.token, g, profile("Link", "Patient", "ret30@local.test", "+254700000030", "PATIENT")); em.flush();
        String subject = subjectOf(ctx.caseId);
        finishSetup(subject);
        int patients = count("SELECT count(*) FROM patient_profiles");
        int mails = identity.setupMails().size();

        authenticate(subject, "PATIENT");
        var next = account.startNewCase(new NewCaseForPatientRequest("Follow-up knee pain", "orthopedics", false, true)); em.flush();
        assertThat(patientId(next.caseId())).isEqualTo(patientId(ctx.caseId));
        assertThat(count("SELECT count(*) FROM patient_profiles")).isEqualTo(patients);
        assertThat(identity.accounts()).isEqualTo(1);
        assertThat(identity.setupMails()).hasSize(mails); // no new account setup
        assertThat(jdbc.queryForObject("SELECT full_name FROM medical_cases WHERE id=?", String.class, next.caseId())).isEqualTo("Link Patient");
        assertThat(jdbc.queryForObject("SELECT contact_role FROM case_submission_contacts WHERE case_id=?", String.class, next.caseId())).isEqualTo("PATIENT");
        assertThat(journey.patientCases()).extracting(CaseView::caseNumber).contains(ctx.caseNumber, next.caseNumber());
    }

    @Test void aPendingSetupIsResumedNeverDuplicated() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000031", null));
        String g = grant(ctx);
        activation.activate(ctx.token, g, profile("Link", "Patient", "pend31@local.test", "+254700000031", "PATIENT")); em.flush();
        String subject = subjectOf(ctx.caseId);
        // Retry of the profile submission: same account, no automatic second email inside the guard window.
        var again = activation.activate(ctx.token, g, profile("Link", "Patient", "pend31@local.test", "+254700000031", "PATIENT")); em.flush();
        assertThat(again.account().status()).isEqualTo(AccountStatus.SETUP_PENDING);
        assertThat(subjectOf(ctx.caseId)).isEqualTo(subject);
        assertThat(identity.accounts()).isEqualTo(1);
        assertThat(identity.setupMailsFor(subject)).isEqualTo(1);
        // Explicit resend: one more email to the same account, still no duplicate.
        var resent = activation.resendAccountSetup(ctx.token, g); em.flush();
        assertThat(resent.emailSent()).isTrue();
        assertThat(identity.accounts()).isEqualTo(1);
        assertThat(identity.setupMailsFor(subject)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_ACCOUNT_PROVISIONED'", ctx.caseId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM audit_events WHERE case_id=? AND event_type='PATIENT_PROFILE_ACTIVATED'", ctx.caseId)).isEqualTo(1);
    }

    @Test void anAlreadyActiveAccountSkipsSetupEntirely() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000032", null));
        String g = grant(ctx);
        activation.activate(ctx.token, g, profile("Link", "Patient", "act32@local.test", "+254700000032", "PATIENT")); em.flush();
        String subject = subjectOf(ctx.caseId);
        finishSetup(subject);
        int mails = identity.setupMails().size();
        var again = activation.activate(ctx.token, g, profile("Link", "Patient", "act32@local.test", "+254700000032", "PATIENT")); em.flush();
        assertThat(again.account().status()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(again.currentAction()).isNotEqualTo(PatientAction.SET_UP_ACCOUNT);
        assertThat(identity.setupMails()).hasSize(mails);
        assertThat(activation.portalAccess(ctx.token, g).alreadyLinked()).isTrue();
    }

    @Test void theFirstSignInLandsOnTheCurrentCase() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000033", null));
        String g = grant(ctx);
        activation.activate(ctx.token, g, profile("Link", "Patient", "land33@local.test", "+254700000033", "PATIENT")); em.flush();
        String subject = subjectOf(ctx.caseId);
        assertThat(identity.setupMails().get(0).redirectPath()).isEqualTo("/en/portal?case=" + ctx.caseId + "&continue=1");
        identity.completeSetup(subject);
        authenticateWithEmail(subject, "land33@local.test", "PATIENT");
        var session = account.session(); em.flush();
        assertThat(session.currentCaseId()).isEqualTo(ctx.caseId);
        assertThat(session.accountStatus()).isEqualTo("ACTIVE");
        assertThat(session.displayName()).isEqualTo("Link Patient");
        // Idempotent: a second entry is a no-op.
        assertThat(account.session().accountStatus()).isEqualTo("ACTIVE");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='PATIENT_ACCOUNT_ACTIVATED' AND entity_id=?", patientId(ctx.caseId).toString())).isEqualTo(1);
    }

    // ---------- legacy data ----------

    @Test void aLegacyFullNameIsNeverParsedAndMustBeConfirmedByThePatient() throws Exception {
        var ctx = accepted(request("Link", "Patient", "+254700000040", null));
        UUID patientId = patientId(ctx.caseId);
        // Simulate a row migrated from before structured names existed.
        jdbc.update("UPDATE patient_profiles SET given_name=NULL,family_name=NULL,name_source='LEGACY_FULL_NAME',full_name='Maria da Silva Santos' WHERE id=?", patientId);
        String g = grant(ctx);
        var pre = activation.prefill(ctx.token, g);
        assertThat(pre.nameConfirmationRequired()).isTrue();
        assertThat(pre.legacyFullName()).isEqualTo("Maria da Silva Santos");
        assertThat(pre.givenName()).isNull(); assertThat(pre.familyName()).isNull();
        // Display still works from the preserved legacy name until then.
        authenticate("coordinator-subject", "COORDINATOR");
        assertThat(journey.coordinatorQueue()).filteredOn(c -> c.id().equals(ctx.caseId)).extracting(CaseView::patientName).containsExactly("Maria da Silva Santos");
        SecurityContextHolder.clearContext();
        activation.activate(ctx.token, g, profile("Maria", "da Silva Santos", "maria40@local.test", "+254700000040", "PATIENT")); em.flush();
        assertThat(jdbc.queryForObject("SELECT name_source FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("STRUCTURED");
        assertThat(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("Maria");
        assertThat(jdbc.queryForObject("SELECT full_name FROM patient_profiles WHERE id=?", String.class, patientId)).isEqualTo("Maria da Silva Santos");
    }

    // ================= helpers =================
    private record Ctx(UUID caseId, UUID versionId, String token, String caseNumber) {}

    private CreateCaseRequest request(String given, String family, String whatsapp, String email) {
        return new CreateCaseRequest(given, family, "Kenya", whatsapp, "Cardiac reports", "en", true, null, email, "Africa/Nairobi", "cardiology");
    }
    private ProfileActivationRequest profile(String given, String family, String email, String phone, String owner) {
        return new ProfileActivationRequest(given, family, null, null, email, phone, owner, LocalDate.of(1990, 1, 1), "KE", "KE", "en", "MALE",
                List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS", "REPRESENTATIVE_AUTHORIZATION"));
    }
    private UUID seedLinkedPatient(String subject, String given, String family, String email) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_profiles(id,external_subject,full_name,given_name,family_name,name_source,country,whatsapp_number,mobile_owner,email,email_verified_at,preferred_language,account_status,profile_status,profile_completed_at,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
                id, subject, given + " " + family, given, family, "STRUCTURED", "Egypt", "+201000009999", "PATIENT", email, Instant.now(), "en", "ACTIVE", "ACTIVE", Instant.now(), Instant.now(), Instant.now());
        return id;
    }
    private String linkToken(UUID patientId) throws Exception {
        String stored = payload(jdbc.queryForObject("SELECT o.template_data FROM notification_outbox o WHERE o.notification_type='ACCOUNT_LINK' AND o.idempotency_key LIKE ? ORDER BY o.created_at DESC LIMIT 1", String.class, "account-link:" + patientId + ":%"));
        return json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private void finishSetup(String subject) {
        identity.completeSetup(subject);
        String email = identity.findBySubject(subject).map(PatientIdentityPort.IdentityUser::email).orElse(null);
        authenticateWithEmail(subject, email, "PATIENT");
        account.session(); em.flush();
    }
    private String subjectOf(UUID caseId) { return jdbc.queryForObject("SELECT external_subject FROM patient_profiles WHERE id=?", String.class, patientId(caseId)); }
    private String accountStatus(UUID caseId) { return jdbc.queryForObject("SELECT account_status FROM patient_profiles WHERE id=?", String.class, patientId(caseId)); }
    private UUID patientId(UUID caseId) { return jdbc.queryForObject("SELECT patient_id FROM medical_cases WHERE id=?", UUID.class, caseId); }

    private Ctx accepted(CreateCaseRequest request) throws Exception {
        var ctx = releasePreliminary(request);
        journey.requestProposalAccess(ctx.token, "WHATSAPP"); em.flush();
        var g = journey.verifyProposalAccess(ctx.token, proposalCode("WHATSAPP"));
        journey.decideProposalPublic(ctx.token, g.grant(), new PublicProposalDecisionRequest(g.grant(), "ACKNOWLEDGED", null, true));
        em.flush(); SecurityContextHolder.clearContext();
        return new Ctx(ctx.caseId(), ctx.versionId(), onboardingTokenFor(ctx.caseId()), ctx.caseNumber());
    }
    private String grant(Ctx ctx) throws Exception {
        publicCases.requestAccess(ctx.token, "WHATSAPP"); em.flush();
        var g = publicCases.verify(ctx.token, accessCode());
        SecurityContextHolder.clearContext();
        return g.grant();
    }
    private Ctx releasePreliminary(CreateCaseRequest request) throws Exception {
        var created = cases.create(request);
        cases.submit(created.caseId()); em.flush(); em.clear();
        jdbc.update("UPDATE medical_cases SET travel_package_requested=true WHERE id=?", created.caseId());
        authenticate("coordinator-subject", "COORDINATOR");
        journey.claimCoordinatorCase(created.caseId(), "cardiac-pod");
        long v = journey.workspace(created.caseId()).caseSummary().version();
        journey.transition(created.caseId(), new TransitionRequest("READY_FOR_CONSULTANT", "ready", v));
        seedDoctor(); seedStaff();
        var doctorAssignment = journey.assign(created.caseId(), new AssignmentRequest("doctor-subject", "DOCTOR", "PRIMARY", "cardiac-pod", "Clinical review"));
        authenticate("doctor-subject", "DOCTOR");
        journey.acceptDoctorAssignment(created.caseId(), doctorAssignment.id(), new AssignmentDecisionRequest(true, null));
        var review = journey.saveClinicalReview(created.caseId(), new ClinicalReviewRequest("Reviewed", "SUITABLE", null, "Imaging", "Recommended intervention", "Alt", "Risks", "Seq", "7 days", "Follow-up"));
        journey.approveClinicalReview(created.caseId(), review.id());
        jdbc.update("INSERT INTO clinical_review_cost_estimates(id,clinical_review_id,service_description,estimated_cost,currency,sort_order,price_egp,requires_finance_approval) VALUES(?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), review.id(), "Consultant treatment package", new BigDecimal("1000.00"), "EGP", 0, new BigDecimal("1000.00"), true);
        authenticate("coordinator-subject", "COORDINATOR");
        var proposal = journey.createProposal(created.caseId(), new ProposalDraftRequest(review.id(), "en", "Plan", "EGP", "Incl", "Excl", "Deposit", "Refund", "Not consent", Instant.now().plusSeconds(86400), List.of(new ProposalItemRequest("MEDICAL", "Treatment package", BigDecimal.ONE, new BigDecimal("1000.00"), false, 0)), null));
        var operationsAssignment = journey.assign(created.caseId(), new AssignmentRequest("operations-subject", "OPERATIONS", "PRIMARY", "cardiac-pod", "Ops"));
        var financeAssignment = journey.assign(created.caseId(), new AssignmentRequest("finance-subject", "FINANCE", "PRIMARY", "cardiac-pod", "Finance"));
        authenticate("operations-subject", "OPERATIONS"); journey.decideAssignment(created.caseId(), operationsAssignment.id(), new AssignmentDecisionRequest(true, null), com.rehletshifaa.security.ActorRole.OPERATIONS); journey.completeOperations(created.caseId(), proposal.versionId(), "Ops plan");
        authenticate("finance-subject", "FINANCE"); journey.decideAssignment(created.caseId(), financeAssignment.id(), new AssignmentDecisionRequest(true, null), com.rehletshifaa.security.ActorRole.FINANCE); journey.approveFinance(created.caseId(), proposal.versionId());
        authenticate("coordinator-subject", "COORDINATOR"); journey.releaseProposal(created.caseId(), proposal.versionId());
        em.flush();
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, "proposal-ready:" + proposal.versionId()));
        String raw = json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
        SecurityContextHolder.clearContext();
        return new Ctx(created.caseId(), proposal.versionId(), raw, created.caseNumber());
    }
    private String onboardingTokenFor(UUID caseId) throws Exception {
        String key = jdbc.queryForObject("SELECT idempotency_key FROM notification_outbox WHERE notification_type='PROFILE_ACTIVATION' AND idempotency_key IN (SELECT 'onboarding:'||id FROM case_access_links WHERE case_id=? AND purpose='ONBOARDING') ORDER BY created_at DESC LIMIT 1", String.class, caseId);
        String stored = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key=?", String.class, key));
        return json.readValue(stored, new TypeReference<Map<String, String>>() {}).get("token");
    }
    private String accessCode() throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key IN (SELECT 'case-access:'||id FROM case_access_challenges WHERE consumed_at IS NULL AND revoked_at IS NULL) ORDER BY created_at DESC LIMIT 1", String.class));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private String proposalCode(String channel) throws Exception {
        String raw = payload(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE notification_type='PROPOSAL_ACCESS' AND channel=? ORDER BY created_at DESC LIMIT 1", String.class, channel));
        return json.readValue(raw, new TypeReference<Map<String, String>>() {}).get("code");
    }
    private void seedDoctor() { if (count("SELECT count(*) FROM practitioner_profiles WHERE external_subject=?", "doctor-subject") > 0) return; UUID id = UUID.randomUUID(); jdbc.update("INSERT INTO practitioner_profiles(id,external_subject,legal_name,display_name,credentialing_status,practitioner_type,availability_status,care_category,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)", id, "doctor-subject", "Doctor One", "Doctor One", "VERIFIED", "CONSULTANT", "AVAILABLE", "cardiology", Instant.now(), Instant.now()); jdbc.update("INSERT INTO practitioner_credentials(id,practitioner_id,credential_type,status,expires_at,created_at) VALUES(?,?,?,?,?,?)", UUID.randomUUID(), id, "LICENSE", "VERIFIED", Instant.now().plusSeconds(86400), Instant.now()); }
    private void seedStaff() { if (count("SELECT count(*) FROM staff_members WHERE external_subject=?", "operations-subject") > 0) return; jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "operations-subject", "OPERATIONS", crypto.encrypt("Operations One"), Instant.now(), Instant.now()); jdbc.update("INSERT INTO staff_members(id,external_subject,staff_role,display_name_encrypted,created_at,updated_at,version) VALUES(?,?,?,?,?,?,0)", UUID.randomUUID(), "finance-subject", "FINANCE", crypto.encrypt("Finance One"), Instant.now(), Instant.now()); }
    private void authenticate(String subject, String... roles) { authenticateWithEmail(subject, null, roles); }
    private void authenticateWithEmail(String subject, String email, String... roles) {
        var builder = Jwt.withTokenValue("test").header("alg", "none").subject(subject).claim("auth_time", Instant.now().getEpochSecond())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600));
        if (email != null) builder.claim("email", email).claim("email_verified", true);
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(builder.build(),
                Arrays.stream(roles).map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList()));
    }
    private String payload(String stored) { return stored.startsWith("enc:") ? crypto.decrypt(stored.substring(4)) : stored; }
    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
