package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.ActivationDtos.*;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.util.Countries;
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
 * Profile activation for an existing patient continuing straight from proposal acceptance.
 *
 * <p>The same canonical {@code patient_profiles} row that owns the case is updated in place — no second
 * patient, profile or account is ever created. Authorization comes solely from a verified ONBOARDING grant
 * bound to one case/patient, so a token can only ever reach its own case. Activation is transactional and
 * idempotent: replaying it returns the current state instead of duplicating consents or audit events.
 * Legal-identity/passport evidence is deliberately NOT required here.
 */
@Service
public class PatientActivationService {
    /** Letters (any script incl. Arabic), marks, spaces and the punctuation real names use. */
    private static final Pattern NAME = Pattern.compile("^[\\p{L}\\p{M}][\\p{L}\\p{M} .'\\-]*$", Pattern.UNICODE_CASE);
    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{6,14}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}$");
    private static final Set<String> SEXES = Set.of("MALE", "FEMALE", "OTHER", "UNDISCLOSED");
    private static final Set<String> LANGUAGES = Set.of("en", "ar");
    private static final int MAX_AGE_YEARS = 130;

    private final JdbcClient jdbc;
    private final PublicCaseAccessService access;
    private final PaymentService payment;
    private final CustomerReadinessService readiness;
    private final CaseHandoffService handoff;
    private final AccountActivationService accounts;
    private final Clock clock;

    public PatientActivationService(JdbcClient jdbc, PublicCaseAccessService access, PaymentService payment,
                                    CustomerReadinessService readiness, CaseHandoffService handoff,
                                    AccountActivationService accounts, Clock clock) {
        this.jdbc = jdbc; this.access = access; this.payment = payment; this.readiness = readiness;
        this.handoff = handoff; this.accounts = accounts; this.clock = clock;
    }

    /**
     * Hand the finished onboarding over to the normal authenticated portal.
     *
     * <p>Same verified onboarding grant, and only once the profile is ACTIVE — so a case-scoped link can
     * never be traded for an account binding before the patient has actually completed onboarding. The
     * returned credential is single-use and binds this one patient; Keycloak still authenticates the person,
     * and only after that binding does the portal show every case authorized for the canonical patient.
     */
    @Transactional
    public PortalHandoff portalAccess(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        Profile current = loadProfile(ctx.patientId());
        if (!"ACTIVE".equals(current.status()))
            throw new ApiException(409, "PROFILE_NOT_ACTIVE", "Please complete your profile before opening your portal");
        String issued = accounts.issue(ctx.patientId(), ctx.caseId());
        return new PortalHandoff(issued, issued == null);
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

    /**
     * Validate, persist and activate. Idempotent: an already-ACTIVE profile short-circuits to the current
     * state so a double submit, refresh or retry cannot duplicate consents, audit rows or notifications.
     */
    @Transactional
    public ActivationResult activate(String token, String grant, ProfileActivationRequest request) {
        var ctx = access.requireOnboardingGrant(token, grant);
        UUID caseId = ctx.caseId(), patientId = ctx.patientId();

        Profile current = loadProfileForUpdate(patientId);
        if ("ACTIVE".equals(current.status())) return result(caseId, patientId); // already activated — no side effects

        assertCaseStillActivatable(caseId);
        Clean clean = validate(request, current);

        Instant now = clock.instant();
        // Correcting a contact voids only that channel's prior possession proof.
        boolean emailChanged = !Objects.equals(normalizeEmail(current.email()), clean.email());
        boolean phoneChanged = !Objects.equals(current.phone(), clean.phone());
        jdbc.sql("UPDATE patient_profiles SET full_name=?,email=?,whatsapp_number=?,country=?,nationality=?,date_of_birth=?,sex=?,preferred_language=?,"
                        + "email_verified_at=CASE WHEN ? THEN NULL ELSE email_verified_at END,"
                        + "phone_verified_at=CASE WHEN ? THEN NULL ELSE phone_verified_at END,"
                        + "profile_status='ACTIVE',activated_at=COALESCE(activated_at,?),updated_at=?,version=version+1 WHERE id=? AND profile_status<>'ACTIVE'")
                .params(clean.fullName(), clean.email(), clean.phone(), clean.countryName(), clean.nationality(),
                        clean.dateOfBirth(), clean.sex(), clean.language(), emailChanged, phoneChanged,
                        timestamp(now), timestamp(now), patientId)
                .update();

        recordConsents(patientId, caseId, clean.consents(), clean.language(), now);
        completeOnboarding(caseId, now);
        audit(caseId, "PATIENT_PROFILE_ACTIVATED", patientId, "Profile activated from secure onboarding link");
        // When no deposit is due (policy amount zero, already paid, or waived) the journey continues now.
        if (payment.depositSatisfied(caseId)) handoff.onDepositSettled(caseId);
        return result(caseId, patientId);
    }

    // ---- validation ----
    private record Clean(String fullName, String email, String phone, LocalDate dateOfBirth, String nationality,
                         String countryName, String sex, String language, List<String> consents) {}

    private Clean validate(ProfileActivationRequest r, Profile current) {
        var errors = new FieldValidationException.Collector();

        String fullName = trimToNull(r.fullName());
        if (fullName == null) errors.reject("fullName", "Enter the patient's full name as it appears on official documents.");
        else if (fullName.length() < 2 || fullName.length() > 120) errors.reject("fullName", "The full name must be between 2 and 120 characters.");
        else if (!NAME.matcher(fullName).matches()) errors.reject("fullName", "The full name contains characters that are not allowed.");

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

        String phone = normalizePhone(r.phone());
        if (phone == null) errors.reject("phone", "Enter a WhatsApp number including its country code.");
        else if (!E164.matcher(phone).matches()) errors.reject("phone", "Enter a valid international number, for example +971 50 123 4567.");

        String email = normalizeEmail(r.email());
        if (email != null && !EMAIL.matcher(email).matches()) errors.reject("email", "Enter a valid email address.");

        String sex = trimToNull(r.sex()) == null ? null : r.sex().trim().toUpperCase(Locale.ROOT);
        if (sex == null) errors.reject("sex", "Select the patient's sex as recorded for medical care.");
        else if (!SEXES.contains(sex)) errors.reject("sex", "Select a valid option.");

        String language = trimToNull(r.preferredLanguage()) == null ? current.language() : r.preferredLanguage().trim();
        if (language == null || !LANGUAGES.contains(language)) errors.reject("preferredLanguage", "Select a supported language.");

        List<String> required = readiness.requiredConsentTypes(subjectType(current.patientId()));
        List<String> given = r.consents() == null ? List.<String>of()
                : r.consents().stream().filter(Objects::nonNull).map(String::trim).toList();
        for (String type : required)
            if (!given.contains(type) && !consentPresent(current.patientId(), type))
                errors.reject("consents", "Please accept all required agreements to continue.");

        errors.throwIfInvalid();
        return new Clean(fullName, email, phone, dob, nationality, Countries.displayName(residence), sex, language,
                given.stream().filter(required::contains).distinct().toList());
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
    private ActivationResult result(UUID caseId, UUID patientId) {
        Profile p = loadProfile(patientId);
        record C(String number, String status) {}
        C c = jdbc.sql("SELECT case_number,status FROM medical_cases WHERE id=?").param(caseId)
                .query((rs, n) -> new C(rs.getString("case_number"), rs.getString("status"))).single();
        String state = jdbc.sql("SELECT state FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(String.class).optional().orElse(null);
        return new ActivationResult("ACTIVE".equals(p.status()), accounts.linked(patientId), c.number(), c.status(),
                state, depositSummary(caseId));
    }

    private OnboardingPrefill buildPrefill(UUID caseId, UUID patientId) {
        Profile p = loadProfile(patientId);
        record C(String number, String status) {}
        C c = jdbc.sql("SELECT case_number,status FROM medical_cases WHERE id=?").param(caseId)
                .query((rs, n) -> new C(rs.getString("case_number"), rs.getString("status"))).single();
        String state = jdbc.sql("SELECT state FROM patient_onboardings WHERE case_id=? ORDER BY created_at DESC LIMIT 1").param(caseId).query(String.class).optional().orElse(null);
        List<String> required = readiness.requiredConsentTypes(subjectType(patientId));
        List<String> completed = jdbc.sql("SELECT DISTINCT consent_type FROM consent_records WHERE patient_id=? AND revoked_at IS NULL AND (case_id IS NULL OR case_id=?)")
                .params(patientId, caseId).query(String.class).list();
        return new OnboardingPrefill(c.number(), c.status(), state, "ACTIVE".equals(p.status()), accounts.linked(patientId),
                p.fullName(), p.email(), p.phone(), p.dateOfBirth(), p.nationality(),
                Countries.toCode(p.country()).orElse(null), p.language(), p.sex(),
                p.emailVerified(), p.phoneVerified(), required, completed, depositSummary(caseId));
    }

    /** Server-resolved deposit; the client never supplies or influences the amount or currency. */
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
    private record Profile(UUID patientId, String status, String fullName, String email, String phone, String country,
                           String nationality, LocalDate dateOfBirth, String sex, String language,
                           boolean emailVerified, boolean phoneVerified) {}

    private static final String PROFILE_COLUMNS =
            "id,profile_status,full_name,email,whatsapp_number,country,nationality,date_of_birth,sex,preferred_language,email_verified_at,phone_verified_at";

    private Profile loadProfile(UUID patientId) {
        return jdbc.sql("SELECT " + PROFILE_COLUMNS + " FROM patient_profiles WHERE id=?").param(patientId)
                .query(this::mapProfile).optional().orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }
    private Profile loadProfileForUpdate(UUID patientId) {
        return jdbc.sql("SELECT " + PROFILE_COLUMNS + " FROM patient_profiles WHERE id=? FOR UPDATE").param(patientId)
                .query(this::mapProfile).optional().orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }
    private Profile mapProfile(ResultSet rs, int n) throws SQLException {
        return new Profile(rs.getObject("id", UUID.class), rs.getString("profile_status"), rs.getString("full_name"),
                rs.getString("email"), rs.getString("whatsapp_number"), rs.getString("country"), rs.getString("nationality"),
                rs.getObject("date_of_birth", LocalDate.class), rs.getString("sex"), rs.getString("preferred_language"),
                rs.getObject("email_verified_at") != null, rs.getObject("phone_verified_at") != null);
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
