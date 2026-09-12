package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.ActivationDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.util.Countries;
import com.rehletshifaa.shared.util.PatientNames;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.regex.Pattern;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * "Complete your profile" — the continuation of Send My Case, never a second registration.
 *
 * <p>The SAME canonical {@code patient_profiles} row that owns the case is loaded, pre-filled and updated in
 * place; no second patient, profile or account is ever created. Authorization comes solely from a verified
 * ONBOARDING grant bound to one case/patient. Normal profile fields (names, country, language, date of birth)
 * may be corrected freely before any legal-identity verification exists; security-sensitive channels (email,
 * personal mobile) are stored here but only become <em>verified</em> through the identity provider / an OTP on
 * that very channel. Case data (care area, clinical concern, documents, proposal) is never edited here.
 *
 * <p>Completing the profile flows straight into ACCOUNT SETUP ({@link PatientAccountService}): Keycloak owns
 * the password; nothing here generates or sends one. Activation is transactional and idempotent.
 */
@Service
public class PatientActivationService {
    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{6,14}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}$");
    private static final Set<String> SEXES = Set.of("MALE", "FEMALE", "OTHER", "UNDISCLOSED");
    private static final Set<String> LANGUAGES = Set.of("en", "ar");
    private static final Set<String> OWNERS = Set.of("PATIENT", "REPRESENTATIVE");
    private static final int MAX_AGE_YEARS = 130;

    private final JdbcClient jdbc;
    private final PublicCaseAccessService access;
    private final PaymentService payment;
    private final CustomerReadinessService readiness;
    private final CaseHandoffService handoff;
    private final AccountActivationService accounts;
    private final PatientAccountService account;
    private final CaseActionService caseActions;
    private final Clock clock;

    public PatientActivationService(JdbcClient jdbc, PublicCaseAccessService access, PaymentService payment,
                                    CustomerReadinessService readiness, CaseHandoffService handoff,
                                    AccountActivationService accounts, PatientAccountService account,
                                    CaseActionService caseActions, Clock clock) {
        this.jdbc = jdbc; this.access = access; this.payment = payment; this.readiness = readiness;
        this.handoff = handoff; this.accounts = accounts; this.account = account; this.caseActions = caseActions; this.clock = clock;
    }

    /**
     * Hand the finished onboarding over to the normal authenticated portal.
     *
     * <p>Same verified onboarding grant, and only once the profile is complete. A patient whose account was
     * provisioned through the identity provider simply signs in ({@code alreadyLinked}); one whose setup is
     * still in their inbox is told so. Only a legacy profile that predates provider-owned provisioning (no
     * account at all) receives the old single-use binding credential.
     */
    @Transactional
    public PortalHandoff portalAccess(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        Profile current = loadProfile(ctx.patientId());
        if (!"ACTIVE".equals(current.status()))
            throw new ApiException(409, "PROFILE_NOT_ACTIVE", "Please complete your profile before opening your portal");
        AccountSetup state = account.state(ctx.patientId());
        if (state.status() == AccountStatus.ACTIVE || current.subject() != null) return new PortalHandoff(null, true, state, ctx.caseId().toString());
        if (state.awaitingEmail()) return new PortalHandoff(null, false, state, ctx.caseId().toString());
        String issued = accounts.issue(ctx.patientId(), ctx.caseId());
        return new PortalHandoff(issued, issued == null, state, ctx.caseId().toString());
    }

    /** Pre-filled onboarding state for a verified grant. Never exposes another patient's data. */
    @Transactional(readOnly = true)
    public OnboardingPrefill prefill(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        return buildPrefill(ctx.caseId(), ctx.patientId());
    }

    /** Authoritative, server-resolved deposit for the grant's case. */
    @Transactional(readOnly = true)
    public DepositSummary deposit(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        return depositSummary(ctx.caseId());
    }

    /** Explicit "send me a new account setup link". Idempotent: never a second account. */
    @Transactional
    public AccountSetup resendAccountSetup(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        Profile current = loadProfile(ctx.patientId());
        if (!"ACTIVE".equals(current.status()))
            throw new ApiException(409, "PROFILE_NOT_ACTIVE", "Please complete your profile first");
        return account.resendSetup(ctx.patientId(), ctx.caseId(), current.language());
    }

    /**
     * Validate, persist, activate the profile and continue into account setup. Idempotent: an already-ACTIVE
     * profile short-circuits the profile write (no duplicate consents, audit rows or handoffs) but still resumes
     * account setup, so a refresh or retry lands the patient in exactly the same place.
     */
    @Transactional
    public ActivationResult activate(String token, String grant, ProfileActivationRequest request) {
        var ctx = access.requireOnboardingGrant(token, grant);
        UUID caseId = ctx.caseId(), patientId = ctx.patientId();

        Profile current = loadProfileForUpdate(patientId);
        Submission sub = submission(caseId);
        if ("ACTIVE".equals(current.status())) {
            // Replay after completion: only the account side may still need resuming (never re-provisioned).
            // A legacy profile (complete, but never given an account) may supply its account email now.
            String email = normalizeEmail(request == null ? null : request.email());
            if (email != null && current.subject() == null && EMAIL.matcher(email).matches() && !email.equals(normalizeEmail(current.email())))
                jdbc.sql("UPDATE patient_profiles SET email=?,email_verified_at=NULL,updated_at=?,version=version+1 WHERE id=? AND external_subject IS NULL")
                        .params(email, timestamp(clock.instant()), patientId).update();
            AccountSetup state = account.ensureAccount(patientId, caseId, email != null && current.subject() == null ? email : current.email(), current.language());
            return result(caseId, patientId, state);
        }

        assertCaseStillActivatable(caseId);
        Clean clean = validate(request, current, sub);

        Instant now = clock.instant();
        boolean emailChanged = !Objects.equals(normalizeEmail(current.email()), clean.email());
        boolean phoneChanged = !Objects.equals(current.phone(), clean.phone());
        // A number that is another active account's VERIFIED personal mobile is never silently re-verified for
        // a different patient: it stays an unverified contact here until resolved through a controlled path.
        boolean phoneClaimedElsewhere = clean.phone() != null && verifiedElsewhere(patientId, clean.phone());
        jdbc.sql("UPDATE patient_profiles SET given_name=?,family_name=?,preferred_name=?,name_source='STRUCTURED',full_name=?,email=?,whatsapp_number=?,mobile_owner=?,country=?,nationality=?,date_of_birth=?,sex=?,preferred_language=?,"
                        + "email_verified_at=CASE WHEN ? THEN NULL ELSE email_verified_at END,"
                        + "phone_verified_at=CASE WHEN ? THEN NULL ELSE phone_verified_at END,"
                        + "profile_status='ACTIVE',profile_completed_at=COALESCE(profile_completed_at,?),activated_at=COALESCE(activated_at,?),updated_at=?,version=version+1 WHERE id=? AND profile_status<>'ACTIVE'")
                .params(clean.givenName(), clean.familyName(), clean.preferredName(), PatientNames.display(clean.givenName(), clean.familyName(), current.fullName()),
                        clean.email(), clean.phone(), clean.phone() == null ? null : "PATIENT", clean.countryName(), clean.nationality(),
                        clean.dateOfBirth(), clean.sex(), clean.language(), emailChanged, phoneChanged || phoneClaimedElsewhere,
                        timestamp(now), timestamp(now), timestamp(now), patientId)
                .update();
        // The intake number belonged to the person who submitted the case: keep it there, never on the patient.
        if ("REPRESENTATIVE".equals(clean.mobileOwner()) && sub != null && "PATIENT".equals(sub.role()))
            jdbc.sql("UPDATE case_submission_contacts SET contact_role='REPRESENTATIVE',contact_name=NULL WHERE case_id=? AND whatsapp_number IS NOT NULL AND whatsapp_number<>COALESCE(?, '')").params(caseId, clean.phone()).update();

        recordConsents(patientId, caseId, clean.consents(), clean.language(), now);
        completeOnboarding(caseId, now);
        audit(caseId, "PATIENT_PROFILE_ACTIVATED", patientId, "Profile completed from secure onboarding link");
        // When no deposit is due (policy amount zero, already paid, or waived) the journey continues now.
        if (payment.depositSatisfied(caseId)) handoff.onDepositSettled(caseId);
        // Otherwise the patient has done their part and the offline deposit is now our team's move.
        else { handoff.onDepositRequired(caseId); caseActions.reconcileWaitingOn(caseId); }

        // Straight into account setup: find or provision the identity account, no password ever generated here.
        AccountSetup state = account.ensureAccount(patientId, caseId, clean.email(), clean.language());
        return result(caseId, patientId, state);
    }

    // ---- validation ----
    private record Clean(String givenName, String familyName, String preferredName, String email, String phone, String mobileOwner,
                         LocalDate dateOfBirth, String nationality, String countryName, String sex, String language, List<String> consents) {}

    private Clean validate(ProfileActivationRequest r, Profile current, Submission sub) {
        var errors = new FieldValidationException.Collector();
        if (r == null) r = new ProfileActivationRequest(null, null, null, null, null, null, null, null, null, null, null, null, null);

        String given = PatientNames.clean(r.givenName());
        if (given.isEmpty()) errors.reject("givenName", "Enter the patient's given name(s).");
        else if (given.length() > 80) errors.reject("givenName", "The given name is too long.");
        else if (!PatientNames.NAME_PART.matcher(given).matches()) errors.reject("givenName", "The given name contains characters that are not allowed.");
        String family = PatientNames.clean(r.familyName());
        if (family.isEmpty()) { if (!Boolean.TRUE.equals(r.singleLegalName())) errors.reject("familyName", "Enter the family name or surname, or confirm the patient has a single legal name."); }
        else if (family.length() > 80) errors.reject("familyName", "The family name is too long.");
        else if (!PatientNames.NAME_PART.matcher(family).matches()) errors.reject("familyName", "The family name contains characters that are not allowed.");
        String preferred = PatientNames.clean(r.preferredName());
        if (!preferred.isEmpty() && !PatientNames.NAME_PART.matcher(preferred).matches()) errors.reject("preferredName", "The preferred name contains characters that are not allowed.");

        LocalDate dob = r.dateOfBirth();
        LocalDate today = LocalDate.now(clock);
        if (dob == null) errors.reject("dateOfBirth", "Enter the patient's date of birth.");
        else if (dob.isAfter(today)) errors.reject("dateOfBirth", "The date of birth cannot be in the future.");
        else if (dob.isBefore(today.minusYears(MAX_AGE_YEARS))) errors.reject("dateOfBirth", "Enter a valid date of birth.");

        String nationality = Countries.toCode(r.nationality()).orElse(null);
        if (trimToNull(r.nationality()) == null) errors.reject("nationality", "Select the patient's nationality.");
        else if (nationality == null) errors.reject("nationality", "Select a nationality from the list.");

        String residence = Countries.toCode(r.countryOfResidence()).orElse(null);
        if (trimToNull(r.countryOfResidence()) == null) errors.reject("countryOfResidence", "Select the country of residence.");
        else if (residence == null) errors.reject("countryOfResidence", "Select a country from the list.");

        // Who owns the mobile decides whether it is stored on the patient at all.
        String owner = trimToNull(r.mobileOwner()) == null ? null : r.mobileOwner().trim().toUpperCase(Locale.ROOT);
        String known = current.phone() != null ? current.phone() : sub == null ? null : sub.whatsapp();
        if (owner == null) owner = current.mobileOwner() != null ? current.mobileOwner() : (sub != null && "REPRESENTATIVE".equals(sub.role())) ? "REPRESENTATIVE" : known == null ? "PATIENT" : null;
        if (owner == null) errors.reject("mobileOwner", "Tell us whether this number is yours or a family member's.");
        else if (!OWNERS.contains(owner)) errors.reject("mobileOwner", "Select a valid option.");
        String phone = normalizePhone(r.phone());
        if (phone != null && !E164.matcher(phone).matches()) errors.reject("phone", "Enter a valid international number, for example +971 50 123 4567.");
        if ("PATIENT".equals(owner) && phone == null) errors.reject("phone", "Enter a WhatsApp number including its country code.");
        // A representative's number is never stored as the patient's own; a personal number is optional then.
        if ("REPRESENTATIVE".equals(owner) && phone != null && known != null && normalizePhone(known).equals(phone)) phone = null;

        String email = normalizeEmail(r.email());
        if (email == null) errors.reject("email", "Enter the email address you will use to sign in.");
        else if (!EMAIL.matcher(email).matches()) errors.reject("email", "Enter a valid email address.");

        String sex = trimToNull(r.sex()) == null ? null : r.sex().trim().toUpperCase(Locale.ROOT);
        if (sex == null) errors.reject("sex", "Select the patient's sex as recorded for medical care.");
        else if (!SEXES.contains(sex)) errors.reject("sex", "Select a valid option.");

        String language = trimToNull(r.preferredLanguage()) == null ? current.language() : r.preferredLanguage().trim();
        if (language == null || !LANGUAGES.contains(language)) errors.reject("preferredLanguage", "Select a supported language.");

        List<String> required = readiness.requiredConsentTypes(subjectType(current.patientId()));
        List<String> given_ = r.consents() == null ? List.<String>of() : r.consents().stream().filter(Objects::nonNull).map(String::trim).toList();
        for (String type : required)
            if (!given_.contains(type) && !consentPresent(current.patientId(), type))
                errors.reject("consents", "Please accept all required agreements to continue.");

        errors.throwIfInvalid();
        return new Clean(given, family.isEmpty() ? null : family, preferred.isEmpty() ? null : preferred, email, phone, owner, dob, nationality,
                Countries.displayName(residence), sex, language, given_.stream().filter(required::contains).distinct().toList());
    }

    /** Is this number the verified personal mobile of a different patient who already has an account? */
    private boolean verifiedElsewhere(UUID patientId, String phone) {
        Integer n = jdbc.sql("SELECT count(*) FROM patient_profiles WHERE id<>? AND whatsapp_number=? AND phone_verified_at IS NOT NULL AND external_subject IS NOT NULL AND mobile_owner='PATIENT'")
                .params(patientId, phone).query(Integer.class).single();
        return n != null && n > 0;
    }

    /** A withdrawn/cancelled case must not be activatable — the journey no longer exists. */
    private void assertCaseStillActivatable(UUID caseId) {
        String status = jdbc.sql("SELECT status FROM medical_cases WHERE id=?").param(caseId).query(String.class)
                .optional().orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (Set.of("CANCELLED", "DECLINED", "CLOSED", "CLINICALLY_NOT_SUITABLE").contains(status))
            throw new ApiException(409, "CASE_NOT_ACTIVATABLE", "This case is no longer active. Your coordinator will contact you.");
    }

    // ---- persistence helpers ----
    private void recordConsents(UUID patientId, UUID caseId, List<String> consents, String language, Instant now) {
        for (String type : consents) {
            // Idempotent: a replay (or a consent already on file) inserts nothing.
            jdbc.sql("INSERT INTO consent_records(id,patient_id,case_id,consent_type,policy_version,language,exact_text,purpose,scope,channel,captured_by,effective_from,created_at) "
                            + "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM consent_records WHERE patient_id=? AND consent_type=? AND revoked_at IS NULL AND (case_id IS NULL OR case_id=?))")
                    .params(UUID.randomUUID(), patientId, caseId, type, "v1", language, consentText(type, language),
                            "Care coordination onboarding", "Care coordination onboarding", "ONBOARDING_LINK", "SECURE_LINK",
                            timestamp(now), timestamp(now), patientId, type, caseId)
                    .update();
        }
    }

    /** Complete the existing onboarding record (creating it only if acceptance predates this layer). */
    private void completeOnboarding(UUID caseId, Instant now) {
        int changed = jdbc.sql("UPDATE patient_onboardings SET state='COMPLETED',submitted_at=COALESCE(submitted_at,?),completed_at=COALESCE(completed_at,?),updated_at=?,version=version+1 "
                        + "WHERE case_id=? AND state NOT IN ('COMPLETED','CANCELLED','LEGACY_EXEMPT')")
                .params(timestamp(now), timestamp(now), timestamp(now), caseId).update();
        if (changed > 0) return;
        Integer any = jdbc.sql("SELECT count(*) FROM patient_onboardings WHERE case_id=?").param(caseId).query(Integer.class).single();
        if (any != null && any > 0) return;
        UUID patientId = jdbc.sql("SELECT patient_id FROM medical_cases WHERE id=?").param(caseId).query(UUID.class).single();
        UUID versionId = jdbc.sql("SELECT pv.id FROM proposal_versions pv JOIN proposals p ON p.id=pv.proposal_id WHERE p.case_id=? AND pv.document_type='PRELIMINARY_ESTIMATE' AND pv.status='ACCEPTED' ORDER BY pv.version_number DESC LIMIT 1")
                .param(caseId).query(UUID.class).optional().orElse(null);
        jdbc.sql("INSERT INTO patient_onboardings(id,patient_id,case_id,proposal_version_id,state,started_at,submitted_at,completed_at,expires_at,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(UUID.randomUUID(), patientId, caseId, versionId, "COMPLETED", timestamp(now), timestamp(now), timestamp(now),
                        timestamp(now.plus(Duration.ofDays(45))), timestamp(now), timestamp(now)).update();
    }

    // ---- views ----
    private ActivationResult result(UUID caseId, UUID patientId, AccountSetup state) {
        Profile p = loadProfile(patientId);
        record C(String number, String status) {}
        C c = jdbc.sql("SELECT case_number,status FROM medical_cases WHERE id=?").param(caseId)
                .query((rs, n) -> new C(rs.getString("case_number"), rs.getString("status"))).single();
        String onboarding = jdbc.sql("SELECT state FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(String.class).optional().orElse(null);
        DepositSummary deposit = depositSummary(caseId);
        boolean active = "ACTIVE".equals(p.status());
        return new ActivationResult(active, accounts.linked(patientId), state, c.number(), c.status(), onboarding, deposit,
                journeyStage(active, state, deposit), currentAction(active, state, deposit), waitingOn(caseId));
    }

    private OnboardingPrefill buildPrefill(UUID caseId, UUID patientId) {
        Profile p = loadProfile(patientId);
        Submission sub = submission(caseId);
        record C(String number, String status) {}
        C c = jdbc.sql("SELECT case_number,status FROM medical_cases WHERE id=?").param(caseId)
                .query((rs, n) -> new C(rs.getString("case_number"), rs.getString("status"))).single();
        String onboarding = jdbc.sql("SELECT state FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(String.class).optional().orElse(null);
        List<String> required = readiness.requiredConsentTypes(subjectType(patientId));
        List<String> completed = jdbc.sql("SELECT DISTINCT consent_type FROM consent_records WHERE patient_id=? AND revoked_at IS NULL AND (case_id IS NULL OR case_id=?)")
                .params(patientId, caseId).query(String.class).list();
        DepositSummary deposit = depositSummary(caseId);
        AccountSetup state = account.state(patientId);
        boolean active = "ACTIVE".equals(p.status());
        boolean submittedBySelf = sub == null || "PATIENT".equals(sub.role());
        // Only the patient's OWN address is a candidate account email. A representative's is never offered.
        String candidateEmail = p.email() != null ? p.email() : null;
        // The number we hold: the patient's when they have one, otherwise the submitter's, with its owner.
        String knownMobile = p.phone() != null ? p.phone() : sub == null ? null : sub.whatsapp();
        String mobileOwner = p.phone() != null ? p.mobileOwner() : (sub != null && "REPRESENTATIVE".equals(sub.role())) ? "REPRESENTATIVE" : null;
        boolean legacyName = "LEGACY_FULL_NAME".equals(p.nameSource()) || p.givenName() == null;
        return new OnboardingPrefill(c.number(), c.status(), onboarding, active, accounts.linked(patientId), state,
                p.givenName(), p.familyName(), p.preferredName(), legacyName ? p.fullName() : null, legacyName,
                candidateEmail, p.emailVerified(), knownMobile, mobileOwner, p.phoneVerified() && p.phone() != null,
                p.dateOfBirth(), p.nationality(), Countries.toCode(p.country()).orElse(null), p.language(), p.sex(),
                submittedBySelf ? "PATIENT" : "REPRESENTATIVE", submittedBySelf ? null : sub.name(), submittedBySelf ? null : sub.relationship(),
                required, completed, deposit, journeyStage(active, state, deposit), currentAction(active, state, deposit), waitingOn(caseId));
    }

    /** Where the case stands. Profile → account setup → deposit → coordination. */
    private JourneyStage journeyStage(boolean profileActive, AccountSetup account, DepositSummary deposit) {
        if (!profileActive) return JourneyStage.PROFILE;
        if (account.status() != AccountStatus.ACTIVE && account.awaitingEmail()) return JourneyStage.ACCOUNT_SETUP;
        return deposit.satisfied() || !deposit.required() ? JourneyStage.CARE_COORDINATION : JourneyStage.DEPOSIT;
    }

    /**
     * What the patient can do right now. The deposit is arranged offline by a coordinator, so on the deposit
     * stage the honest answer is NONE rather than a payment action the platform cannot honour.
     */
    private PatientAction currentAction(boolean profileActive, AccountSetup account, DepositSummary deposit) {
        if (!profileActive) return PatientAction.COMPLETE_PROFILE;
        if (account.status() != AccountStatus.ACTIVE && account.awaitingEmail()) return PatientAction.SET_UP_ACCOUNT;
        if (deposit.satisfied() || !deposit.required()) return PatientAction.CONTINUE_IN_PORTAL;
        return PatientAction.NONE;
    }

    /** Who the case is waiting on, straight from the domain — never recomputed for the patient's benefit. */
    private String waitingOn(UUID caseId) {
        return jdbc.sql("SELECT waiting_on FROM medical_cases WHERE id=?").param(caseId).query(String.class).optional().orElse(null);
    }

    private DepositSummary depositSummary(UUID caseId) {
        var view = payment.depositForCase(caseId);
        boolean satisfied = payment.depositSatisfied(caseId);
        String status = payment.depositStatusFor(caseId);
        if (view == null) {
            BigDecimal anticipated = payment.anticipatedCoordinationDepositEgp(caseId);
            boolean required = anticipated.signum() > 0;
            return new DepositSummary(required, status, "EGP", required ? anticipated : BigDecimal.ZERO, BigDecimal.ZERO,
                    required ? anticipated : BigDecimal.ZERO, satisfied);
        }
        boolean required = !satisfied && view.totalDisplay() != null && view.totalDisplay().signum() > 0;
        return new DepositSummary(required, status, view.currency(), view.totalDisplay(), view.paidDisplay(), view.balanceDisplay(), satisfied);
    }

    // ---- data access ----
    private record Profile(UUID patientId, String status, String subject, String fullName, String givenName, String familyName, String preferredName, String nameSource,
                           String email, String phone, String mobileOwner, String country, String nationality, LocalDate dateOfBirth, String sex, String language,
                           boolean emailVerified, boolean phoneVerified) {}
    private record Submission(String role, String name, String relationship, String email, String whatsapp) {}

    private static final String PROFILE_COLUMNS =
            "id,profile_status,external_subject,full_name,given_name,family_name,preferred_name,name_source,email,whatsapp_number,mobile_owner,country,nationality,date_of_birth,sex,preferred_language,email_verified_at,phone_verified_at";

    private Profile loadProfile(UUID patientId) {
        return jdbc.sql("SELECT " + PROFILE_COLUMNS + " FROM patient_profiles WHERE id=?").param(patientId)
                .query(this::mapProfile).optional().orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }
    private Profile loadProfileForUpdate(UUID patientId) {
        return jdbc.sql("SELECT " + PROFILE_COLUMNS + " FROM patient_profiles WHERE id=? FOR UPDATE").param(patientId)
                .query(this::mapProfile).optional().orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }
    private Profile mapProfile(ResultSet rs, int n) throws SQLException {
        return new Profile(rs.getObject("id", UUID.class), rs.getString("profile_status"), rs.getString("external_subject"), rs.getString("full_name"),
                rs.getString("given_name"), rs.getString("family_name"), rs.getString("preferred_name"), rs.getString("name_source"),
                rs.getString("email"), rs.getString("whatsapp_number"), rs.getString("mobile_owner"), rs.getString("country"), rs.getString("nationality"),
                rs.getObject("date_of_birth", LocalDate.class), rs.getString("sex"), rs.getString("preferred_language"),
                rs.getObject("email_verified_at") != null, rs.getObject("phone_verified_at") != null);
    }
    private Submission submission(UUID caseId) {
        return jdbc.sql("SELECT contact_role,contact_name,relationship_to_patient,email,whatsapp_number FROM case_submission_contacts WHERE case_id=?").param(caseId)
                .query((rs, n) -> new Submission(rs.getString("contact_role"), rs.getString("contact_name"), rs.getString("relationship_to_patient"), rs.getString("email"), rs.getString("whatsapp_number")))
                .optional().orElse(null);
    }
    private String subjectType(UUID patientId) {
        return jdbc.sql("SELECT subject_type FROM patient_onboardings WHERE patient_id=? ORDER BY created_at DESC LIMIT 1")
                .param(patientId).query(String.class).optional().orElse(null);
    }
    private boolean consentPresent(UUID patientId, String type) {
        Integer c = jdbc.sql("SELECT count(*) FROM consent_records WHERE patient_id=? AND consent_type=? AND revoked_at IS NULL")
                .params(patientId, type).query(Integer.class).single();
        return c != null && c > 0;
    }
    private void audit(UUID caseId, String type, UUID entityId, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,case_id,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), type, "SECURE_LINK", "PATIENT", caseId, "PatientProfile", entityId.toString(),
                        "ACTIVATE", "SUCCESS", reason, timestamp(clock.instant())).update();
    }

    // ---- normalization ----
    private static String trimToNull(String v) { return v == null || v.isBlank() ? null : v.trim(); }
    private static String normalizeEmail(String v) { return v == null || v.isBlank() ? null : v.trim().toLowerCase(Locale.ROOT); }
    /** Keep a leading '+', drop separators, and treat a leading 00 as the international prefix. */
    private static String normalizePhone(String v) {
        if (v == null || v.isBlank()) return null;
        String digits = v.replaceAll("[^0-9+]", "");
        if (digits.startsWith("00")) digits = "+" + digits.substring(2);
        if (!digits.startsWith("+")) digits = "+" + digits;
        return digits.length() <= 1 ? null : digits;
    }
    private static String consentText(String type, String language) {
        boolean ar = "ar".equals(language);
        return switch (type) {
            case "PRIVACY_DATA_PROCESSING" -> ar ? "أوافق على معالجة رحلة شفاء لبياناتي الشخصية والصحية لغرض تنسيق رعايتي."
                    : "I consent to RehletShifaa processing my personal and health data to coordinate my care.";
            case "CROSS_BORDER_CARE" -> ar ? "أوافق على نقل بياناتي ومشاركتها عبر الحدود لأغراض تنسيق العلاج."
                    : "I consent to my data being transferred across borders for the purpose of coordinating treatment.";
            case "DEPOSIT_CANCELLATION_TERMS" -> ar ? "أقر بشروط وديعة التنسيق وسياسة الإلغاء والاسترداد."
                    : "I acknowledge the coordination deposit terms and the cancellation and refund policy.";
            case "MEDICAL_INFORMATION_SHARING" -> ar ? "أوافق على مشاركة معلوماتي الطبية مع الاستشاريين ومقدمي الرعاية المعنيين."
                    : "I consent to sharing my medical information with the treating consultants and providers.";
            case "TELECONSULTATION" -> ar ? "أوافق على إجراء الاستشارات عن بُعد عند الاقتضاء."
                    : "I consent to remote consultation where clinically appropriate.";
            case "REPRESENTATIVE_AUTHORIZATION" -> ar ? "أقر بتفويض الممثل للتصرف نيابة عن المريض في تنسيق الرعاية."
                    : "I confirm the representative is authorized to act for the patient in coordinating care.";
            default -> ar ? "موافقة على التسجيل." : "Onboarding consent.";
        };
    }
}
