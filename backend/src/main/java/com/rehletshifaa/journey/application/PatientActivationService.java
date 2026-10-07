package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.domain.ConsentRecord;
import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.journey.api.ActivationDtos.*;
import com.rehletshifaa.journey.application.PatientActivationQueryService.Profile;
import com.rehletshifaa.journey.application.PatientActivationQueryService.Submission;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.api.FieldValidationException;
import com.rehletshifaa.shared.audit.AuditTrail;
import com.rehletshifaa.shared.util.Countries;
import com.rehletshifaa.shared.util.PatientNames;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;
import java.util.regex.Pattern;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

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
    private final PatientOnboardingRepository onboardings;
    private final ConsentRecordRepository consentRecords;
    private final CaseSubmissionContactRepository contacts;
    private final PatientProfileRepository patients;
    private final AuditTrail auditTrail;
    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{6,14}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}$");
    private static final Set<String> SEXES = Set.of("MALE", "FEMALE", "OTHER", "UNDISCLOSED");
    private static final Set<String> LANGUAGES = Set.of("en", "ar");
    private static final Set<String> OWNERS = Set.of("PATIENT", "REPRESENTATIVE");
    private static final int MAX_AGE_YEARS = 130;

    private final MedicalCaseRepository cases;
    private final PatientActivationQueryService views;
    private final PublicCaseAccessService access;
    private final DepositQueryService deposits;
    private final CustomerReadinessService readiness;
    private final CaseHandoffService handoff;
    private final PatientAccountService account;
    private final CaseActionService caseActions;
    private final Clock clock;

    public PatientActivationService(PatientActivationQueryService views, PublicCaseAccessService access, DepositQueryService deposits,
                                    CustomerReadinessService readiness, CaseHandoffService handoff,
                                    PatientAccountService account,
                                    CaseActionService caseActions, Clock clock, AuditTrail auditTrail, PatientProfileRepository patients, CaseSubmissionContactRepository contacts, ConsentRecordRepository consentRecords, PatientOnboardingRepository onboardings, MedicalCaseRepository cases) { this.onboardings = onboardings; this.consentRecords = consentRecords; this.contacts = contacts; this.patients = patients; this.auditTrail = auditTrail;
        this.cases = cases; this.views = views; this.access = access; this.deposits = deposits; this.readiness = readiness;
        this.handoff = handoff; this.account = account; this.caseActions = caseActions; this.clock = clock;
    }

    /**
     * Hand the finished onboarding over to the normal authenticated portal.
     *
     * <p>Same verified onboarding grant, and only once the profile is complete. A patient whose account was
     * provisioned through the identity provider simply signs in ({@code alreadyLinked}); one whose setup is
     * still in their inbox is told so. Missing setup must be resumed through the identity provider.
     */
    @Transactional
    public PortalHandoff portalAccess(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        Profile current = views.profile(ctx.patientId());
        if (!"ACTIVE".equals(current.status()))
            throw new ApiException(409, "PROFILE_NOT_ACTIVE", "Please complete your profile before opening your portal");
        AccountSetup state = account.state(ctx.patientId());
        if (state.status() == AccountStatus.ACTIVE || current.subject() != null) return new PortalHandoff(true, state, ctx.caseId().toString());
        if (state.awaitingEmail()) return new PortalHandoff(false, state, ctx.caseId().toString());
        throw new ApiException(409, "ACCOUNT_SETUP_NOT_STARTED", "Resume profile submission to start your identity-provider account setup");
    }

    /** Pre-filled onboarding state for a verified grant. Never exposes another patient's data. */
    @Transactional(readOnly = true)
    public OnboardingPrefill prefill(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        return views.prefill(ctx.caseId(), ctx.patientId(), account.state(ctx.patientId()));
    }

    /** Authoritative, server-resolved deposit for the grant's case. */
    @Transactional(readOnly = true)
    public DepositSummary deposit(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        return views.depositSummary(ctx.caseId());
    }

    /** Explicit "send me a new account setup link". Idempotent: never a second account. */
    @Transactional
    public AccountSetup resendAccountSetup(String token, String grant) {
        var ctx = access.requireOnboardingGrant(token, grant);
        Profile current = views.profile(ctx.patientId());
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

        PatientProfile profile = patients.lockById(patientId)
                .orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
        Profile current = views.profile(patientId);
        OnboardingState onboarding = requireCurrentOnboarding(caseId);
        Submission sub = views.submission(caseId);
        if ("ACTIVE".equals(current.status())) {
            // Replay after completion: only the account side may still need resuming (never re-provisioned).
            AccountSetup state = account.ensureAccount(patientId, caseId, current.email(), current.language());
            return views.result(caseId, patientId, state);
        }

        assertCaseStillActivatable(caseId);
        Clean clean = validate(request, current, sub);

        Instant now = clock.instant();
        boolean emailChanged = !Objects.equals(normalizeEmail(current.email()), clean.email());
        boolean phoneChanged = !Objects.equals(current.phone(), clean.phone());
        // A number that is another active account's VERIFIED personal mobile is never silently re-verified for
        // a different patient: it stays an unverified contact here until resolved through a controlled path.
        boolean phoneClaimedElsewhere = clean.phone() != null && patients.isVerifiedMobileOfAnotherAccount(patientId, clean.phone());
        if (profile.complete(new PatientProfile.Completion(clean.givenName(), clean.familyName(), clean.preferredName(), clean.email(), clean.phone(),
                        clean.countryName(), clean.nationality(), clean.dateOfBirth(), clean.sex(), clean.language()),
                emailChanged, phoneChanged || phoneClaimedElsewhere, now))
            patients.saveAndFlush(profile);
        // The intake number belonged to the person who submitted the case: keep it there, never on the patient.
        if ("REPRESENTATIVE".equals(clean.mobileOwner()) && "PATIENT".equals(sub.role()))
            contacts.markOtherNumberAsRepresentative(caseId, clean.phone());

        recordConsents(patientId, caseId, clean.consents(), clean.language(), now);
        completeOnboarding(onboarding, now);
        audit(caseId, "PATIENT_PROFILE_ACTIVATED", patientId, "Profile completed from secure onboarding link");
        // When no deposit is due (policy amount zero, already paid, or waived) the journey continues now.
        if (deposits.standing(caseId).satisfied()) handoff.onDepositSettled(caseId);
        // Otherwise the patient has done their part and the offline deposit is now our team's move.
        else { handoff.onDepositRequired(caseId); caseActions.reconcileWaitingOn(caseId); }

        // Straight into account setup: find or provision the identity account, no password ever generated here.
        AccountSetup state = account.ensureAccount(patientId, caseId, clean.email(), clean.language());
        return views.result(caseId, patientId, state);
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
        String known = current.phone() != null ? current.phone() : sub.whatsapp();
        // A number on the patient is always their own; otherwise a representative submitter's number is theirs.
        if (owner == null) owner = current.phone() != null ? "PATIENT" : "REPRESENTATIVE".equals(sub.role()) ? "REPRESENTATIVE" : known == null ? "PATIENT" : null;
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

        List<String> required = readiness.requiredConsentTypes(views.subjectType(current.patientId()));
        List<String> given_ = r.consents() == null ? List.<String>of() : r.consents().stream().filter(Objects::nonNull).map(String::trim).toList();
        Set<String> onFile = null;
        for (String type : required)
            if (!given_.contains(type)) {
                // Read once, and only when the request leaves a required consent out.
                if (onFile == null) onFile = Set.copyOf(consentRecords.findLiveTypesOf(current.patientId()));
                if (!onFile.contains(type)) errors.reject("consents", "Please accept all required agreements to continue.");
            }

        errors.throwIfInvalid();
        return new Clean(given, family.isEmpty() ? null : family, preferred.isEmpty() ? null : preferred, email, phone, owner, dob, nationality,
                Countries.displayName(residence), sex, language, given_.stream().filter(required::contains).distinct().toList());
    }

    /** A withdrawn/cancelled case must not be activatable — the journey no longer exists. */
    private void assertCaseStillActivatable(UUID caseId) {
        String status = cases.findStageAndVersion(caseId).map(c -> c.getStatus().name())
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        if (Set.of("CANCELLED", "DECLINED", "CLOSED", "CLINICALLY_NOT_SUITABLE").contains(status))
            throw new ApiException(409, "CASE_NOT_ACTIVATABLE", "This case is no longer active. Your coordinator will contact you.");
    }

    // ---- persistence helpers ----
    private void recordConsents(UUID patientId, UUID caseId, List<String> consents, String language, Instant now) {
        for (String type : consents) {
            // Idempotent: a replay (or a consent already on file) inserts nothing.
            if (!consentRecords.isGiven(patientId, type, caseId)) consentRecords.saveAndFlush(new ConsentRecord(UUID.randomUUID(), patientId, caseId, new ConsentRecord.Terms(type, consentPolicyVersion(type), language, consentText(type, language), "Care coordination onboarding", "Care coordination onboarding"), "ONBOARDING_LINK", "SECURE_LINK", now));
        }
    }

    private record OnboardingState(UUID id, String state) {}

    /** The case's current (newest) onboarding, row-locked and read as it is now. */
    private OnboardingState requireCurrentOnboarding(UUID caseId) {
        OnboardingState onboarding = onboardings.findNewestOf(caseId, Limit.of(1)).stream().findFirst()
                .flatMap(o -> onboardings.lockById(o.getId())).map(o -> new OnboardingState(o.getId(), o.getState()))
                .orElseThrow(() -> new ApiException(409, "ONBOARDING_NOT_STARTED", "Ask your coordinator to start onboarding from your acknowledged estimate"));
        if (!Set.of("IN_PROGRESS", "IDENTITY_REVIEW", "COMPLETED").contains(onboarding.state()))
            throw new ApiException(409, "ONBOARDING_NOT_ACTIVE", "Your onboarding is no longer active. Contact your coordinator to resume it");
        return onboarding;
    }

    /** Complete only the current onboarding created by estimate acknowledgement. */
    private void completeOnboarding(OnboardingState onboarding, Instant now) {
        if ("COMPLETED".equals(onboarding.state())) return;
        onboardings.completeOnActivation(onboarding.id(), micros(now));
    }

    // ---- data access ----
    private void audit(UUID caseId, String type, UUID entityId, String reason) {
        auditTrail.event(type).actor("SECURE_LINK", "PATIENT").caseId(caseId).entity("PatientProfile", entityId).action("ACTIVATE").reason(reason).record();
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
    /** Deposit-terms consent names the terms version the patient was shown; the other consents stay on v1. */
    static String consentPolicyVersion(String type) {
        return "DEPOSIT_CANCELLATION_TERMS".equals(type) ? PaymentService.DEPOSIT_TERMS_VERSION : "v1";
    }
    private static String consentText(String type, String language) {
        boolean ar = "ar".equals(language);
        return switch (type) {
            case "PRIVACY_DATA_PROCESSING" -> ar ? "أوافق على معالجة رحلة شفاء لبياناتي الشخصية والصحية لغرض تنسيق رعايتي."
                    : "I consent to RehletShifaa processing my personal and health data to coordinate my care.";
            case "CROSS_BORDER_CARE" -> ar ? "أوافق على نقل بياناتي ومشاركتها عبر الحدود لأغراض تنسيق العلاج."
                    : "I consent to my data being transferred across borders for the purpose of coordinating treatment.";
            // The exact checkbox wording the activation page shows beside the displayed deposit terms. The Arabic
            // label is unchanged pending the native Arabic review; the terms themselves are shown in English.
            case "DEPOSIT_CANCELLATION_TERMS" -> ar ? "قرأت وأقبل شروط وديعة التنسيق والإلغاء والاسترداد."
                    : "I have read the coordination deposit, refund and cancellation terms shown above and accept them.";
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
