package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.domain.AgeBand;
import com.rehletshifaa.casemanagement.domain.MedicalCase;
import com.rehletshifaa.directory.domain.PatientRepresentative;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.domain.PatientProfile;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.directory.infrastructure.PatientRepresentativeRepository;
import com.rehletshifaa.journey.api.JourneyDtos.*;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;

import org.springframework.stereotype.Service;

import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The single, backend-computed source of customer readiness. The frontend renders {@link CustomerReadiness}
 * verbatim and must never infer readiness from unrelated case/proposal statuses. Contact verification (OTP
 * possession) is deliberately kept separate from legal identity verification, account activation and deposit
 * satisfaction — each is its own gate here. No internal cost, margin, provider or finance detail is exposed.
 */
@Service
public class CustomerReadinessService {
    private final PatientRepresentativeRepository representatives;
    private final ConsentRecordRepository consents;
    private final PatientIdentityVerificationRepository verifications;
    private final PatientOnboardingRepository onboardings;
    private final PatientProfileRepository patients;
    private final MedicalCaseRepository cases;
    private final Clock clock; private final DepositQueryService deposits;
    // Onboarding-stage consents that live in the existing consent_records table (never a new table).
    static final List<String> BASE_CONSENTS = List.of("PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS");
    static final String REP_CONSENT = "REPRESENTATIVE_AUTHORIZATION";
    /** P1-13 (A-05): a guardian gives their own consent text; it replaces the representative authorisation for a GUARDIAN subject. */
    static final String GUARDIAN_CONSENT = "GUARDIAN_AUTHORIZATION";
    // Gates that legitimately remain open when the patient submits onboarding: activation IS the submission,
    // and the deposit plus any operational identity step deliberately come after the profile is active.
    // A coordinator verifies a guardian's evidence after the guardian provides it, so that wait never holds up the submission.
    private static final Set<String> SUBMIT_DEFERRED = Set.of("ONBOARDING_INCOMPLETE", "DEPOSIT_UNPAID", "ACCOUNT_NOT_ACTIVATED", "IDENTITY_NOT_VERIFIED", "GUARDIAN_EVIDENCE_UNVERIFIED");

    public CustomerReadinessService(Clock clock, DepositQueryService deposits, MedicalCaseRepository cases, PatientProfileRepository patients, PatientOnboardingRepository onboardings, PatientIdentityVerificationRepository verifications, ConsentRecordRepository consents, PatientRepresentativeRepository representatives) { this.representatives = representatives; this.consents = consents; this.verifications = verifications; this.onboardings = onboardings; this.patients = patients; this.cases = cases; this.clock = clock; this.deposits = deposits; }

    public List<String> requiredConsentTypes(String subjectType) {
        List<String> required = new ArrayList<>(BASE_CONSENTS);
        if ("GUARDIAN".equals(subjectType)) required.add(GUARDIAN_CONSENT);
        else if (subjectType != null && !"PATIENT".equals(subjectType)) required.add(REP_CONSENT);
        return required;
    }

    /** Compute readiness for the case's patient. Throws 404 if the case/patient is unknown. */
    public CustomerReadiness compute(UUID caseId) {
        record P(UUID patientId, String subject, Instant phone, Instant email, String profileStatus, String accountStatus, boolean travelPackage) {}
        MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        PatientProfile patient = Optional.ofNullable(medicalCase.getPatientId()).flatMap(patients::findById)
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
        P p = new P(patient.getId(), patient.getExternalSubject(), patient.getPhoneVerifiedAt(), patient.getEmailVerifiedAt(), patient.getProfileStatus(),
                patient.getAccountStatus(), medicalCase.isTravelPackageRequested());
        record OB(String state, String subjectType) {}
        OB ob = onboardings.findFirstByCaseIdOrderByCreatedAtDesc(caseId).map(o -> new OB(o.getState(), o.getSubjectType())).orElse(null);
        String subjectType = ob == null ? null : ob.subjectType();

        boolean accountActivated = "ACTIVE".equals(p.profileStatus()) && "ACTIVE".equals(p.accountStatus()) && p.subject() != null;
        boolean whats = p.phone() != null, mail = p.email() != null;
        boolean contactVerified = whats || mail;
        String verifiedChannel = whats && mail ? "BOTH" : whats ? "WHATSAPP" : mail ? "EMAIL" : null;

        // Legal identity is NOT a gate for profile activation or the coordination deposit. It becomes
        // required only when an operational step needs it (visa / travel package / hospital registration).
        boolean identityRequired = p.travelPackage();
        boolean identityVerified = identityVerified(p.patientId());

        List<String> required = requiredConsentTypes(subjectType);
        boolean consentsDone = required.stream().allMatch(t -> consentPresent(p.patientId(), caseId, t));
        boolean guardianSubject = "GUARDIAN".equals(subjectType);
        GuardianState guardian = guardianSubject ? guardianState(p.patientId()) : null;
        boolean repValid = guardianSubject ? guardian == GuardianState.VERIFIED : repAuthValid(p.patientId(), subjectType);
        boolean minorWithoutGuardian = AgeBand.isMinor(medicalCase.getAgeBand()) && !guardianSubject;

        DepositQueryService.Standing deposit = deposits.standing(caseId);
        boolean depositWaived = deposit.waived();
        boolean depositSatisfied = deposit.satisfied();
        boolean depositRequired = deposit.anticipatedEgp().signum() > 0 && !depositWaived;
        String depositStatus = deposit.status();

        boolean onboardingCompleted = ob != null && "COMPLETED".equals(ob.state());

        List<BlockingItem> blocking = new ArrayList<>();
        if (!accountActivated) blocking.add(new BlockingItem("ACCOUNT_NOT_ACTIVATED", "Activate your profile", "فعّل ملفك"));
        if (!contactVerified) blocking.add(new BlockingItem("CONTACT_NOT_VERIFIED", "Verify a contact channel", "تأكيد وسيلة تواصل"));
        if (identityRequired && !identityVerified) blocking.add(new BlockingItem("IDENTITY_NOT_VERIFIED", "Complete identity verification", "أكمل التحقق من الهوية"));
        if (minorWithoutGuardian) blocking.add(new BlockingItem("MINOR_REQUIRES_GUARDIAN", "A parent or legal guardian must act for this patient", "يجب أن يتصرف أحد الوالدين أو الوصي القانوني نيابة عن المريض"));
        else if (guardianSubject && !repValid) blocking.add(switch (guardian) {
            case NONE -> new BlockingItem("GUARDIAN_AUTH_MISSING", "Guardian details required", "مطلوب إدخال بيانات الوصي");
            case EVIDENCE_MISSING -> new BlockingItem("GUARDIAN_EVIDENCE_MISSING", "Guardian evidence required", "مطلوب مستند يثبت صفة الوصي");
            default -> new BlockingItem("GUARDIAN_EVIDENCE_UNVERIFIED", "Guardian evidence is being checked", "جارٍ التحقق من مستند الوصي");
        });
        else if (!repValid) blocking.add(new BlockingItem("REPRESENTATIVE_AUTH_MISSING", "Representative authorization required", "مطلوب تفويض ممثّل ساري"));
        if (!consentsDone) blocking.add(new BlockingItem("CONSENTS_INCOMPLETE", "Complete required consents", "أكمل الموافقات المطلوبة"));
        if (depositRequired && !depositSatisfied) blocking.add(new BlockingItem("DEPOSIT_UNPAID", "Pay or waive the coordination deposit", "سداد وديعة التنسيق أو إعفاؤها"));
        if (ob == null) blocking.add(new BlockingItem("ONBOARDING_NOT_STARTED", "Ask your coordinator to start onboarding from your acknowledged estimate", "اطلب من المنسق بدء التسجيل من التقدير الذي وافقت عليه"));
        else if (!onboardingCompleted) blocking.add(new BlockingItem("ONBOARDING_INCOMPLETE", "Review and submit your onboarding", "راجِع وأرسل بيانات التسجيل"));
        boolean ready = blocking.isEmpty();

        return new CustomerReadiness(accountActivated, contactVerified, verifiedChannel, identityRequired, identityVerified,
                onboardingCompleted, consentsDone, repValid, depositRequired, depositStatus, depositSatisfied, blocking, ready, clock.instant());
    }

    /** True when every gate that must precede profile activation is satisfied (deposit/identity come later). */
    public boolean readyToSubmit(UUID caseId) {
        return compute(caseId).blockingItems().stream().allMatch(b -> SUBMIT_DEFERRED.contains(b.code()));
    }

    /**
     * Server-side enforcement before any chargeable / non-cancellable commitment. Every case requires
     * current onboarding and readiness evidence. Returns patient-safe blocking reasons.
     */
    public void assertReadyForCommitment(UUID caseId) {
        CustomerReadiness r = compute(caseId);
        if (!r.readyForCoordination()) {
            String reasons = r.blockingItems().stream().map(BlockingItem::labelEn).collect(Collectors.joining("; "));
            throw new ApiException(409, "COORDINATION_NOT_READY", "The customer is not ready for chargeable coordination — outstanding steps: " + reasons);
        }
    }

    private boolean identityVerified(UUID patientId) {
        return verifications.hasCurrentVerified(patientId, micros(clock.instant()));
    }
    private boolean consentPresent(UUID patientId, UUID caseId, String type) {
        return consents.isGiven(patientId, type, caseId);
    }
    /** How far a guardian's authority has come: no delegation, one without evidence, evidence not yet verified, verified. */
    enum GuardianState { NONE, EVIDENCE_MISSING, EVIDENCE_UNVERIFIED, VERIFIED }

    private GuardianState guardianState(UUID patientId) {
        var guardians = representatives.findActiveGuardians(patientId, micros(clock.instant()));
        if (guardians.stream().anyMatch(PatientRepresentative::evidenceVerified)) return GuardianState.VERIFIED;
        if (guardians.stream().anyMatch(g -> g.getEvidenceDocumentId() != null)) return GuardianState.EVIDENCE_UNVERIFIED;
        return guardians.isEmpty() ? GuardianState.NONE : GuardianState.EVIDENCE_MISSING;
    }

    private boolean repAuthValid(UUID patientId, String subjectType) {
        // The patient acting for themselves, or a payer (who never receives clinical access), needs no
        // delegation. A guardian/representative needs an active, non-expired authorization row.
        if (subjectType == null || "PATIENT".equals(subjectType) || "PAYER".equals(subjectType)) return true;
        return representatives.hasActiveFor(patientId, micros(clock.instant()));
    }
}
