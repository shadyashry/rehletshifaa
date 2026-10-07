package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseSubmissionContactRepository;
import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.directory.infrastructure.PatientProfileRepository;
import com.rehletshifaa.journey.api.ActivationDtos.*;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.util.Countries;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The reads behind {@link PatientActivationService}: the onboarding pre-fill, the activation result and the deposit
 * summary the patient sees. A view reads each fact once — the profile, the submitter, the case (number, stage and
 * waiting-on in one row), the current onboarding, the consents on file and the deposit. Authorization (the verified
 * onboarding grant) stays with the caller.
 */
@Service
public class PatientActivationQueryService {
    private final PatientProfileRepository patients;
    private final CaseSubmissionContactRepository contacts;
    private final MedicalCaseRepository cases;
    private final PatientOnboardingRepository onboardings;
    private final ConsentRecordRepository consents;
    private final CustomerReadinessService readiness;
    private final DepositQueryService deposits;

    public PatientActivationQueryService(PatientProfileRepository patients, CaseSubmissionContactRepository contacts, MedicalCaseRepository cases,
                                         PatientOnboardingRepository onboardings, ConsentRecordRepository consents,
                                         CustomerReadinessService readiness, DepositQueryService deposits) {
        this.patients = patients; this.contacts = contacts; this.cases = cases; this.onboardings = onboardings; this.consents = consents;
        this.readiness = readiness; this.deposits = deposits;
    }

    record Profile(UUID patientId, String status, String subject, String givenName, String familyName, String preferredName,
                   String email, String phone, String country, String nationality, LocalDate dateOfBirth, String sex, String language,
                   boolean emailVerified, boolean phoneVerified) {}
    record Submission(String role, String name, String relationship, String email, String whatsapp) {}

    /** The patient's profile as stored now; 404 when it does not exist. */
    Profile profile(UUID patientId) {
        return patients.findOnboardingProfile(patientId)
                .map(p -> new Profile(p.getId(), p.getStatus(), p.getSubject(), p.getGivenName(), p.getFamilyName(), p.getPreferredName(),
                        p.getEmail(), p.getPhone(), p.getCountry(), p.getNationality(), p.getDateOfBirth(), p.getSex(), p.getLanguage(),
                        p.getEmailVerifiedAt() != null, p.getPhoneVerifiedAt() != null))
                .orElseThrow(() -> new ApiException(404, "PATIENT_NOT_FOUND", "Patient profile was not found"));
    }

    /** Who submitted the case; every submitted case has one. */
    Submission submission(UUID caseId) {
        return contacts.findSubmitter(caseId)
                .map(s -> new Submission(s.getRole(), s.getName(), s.getRelationship(), s.getEmail(), s.getWhatsapp()))
                .orElseThrow(() -> new IllegalStateException("Case " + caseId + " has no submission contact"));
    }

    /** Who the patient's newest onboarding is for (PATIENT, REPRESENTATIVE…); null before one is chosen or exists. */
    String subjectType(UUID patientId) {
        List<String> newest = onboardings.findNewestSubjectTypesOf(patientId, Limit.of(1));
        return newest.isEmpty() ? null : newest.get(0);
    }

    /** Pre-filled onboarding state. Only the patient's own data and their case's. */
    @Transactional(readOnly = true)
    public OnboardingPrefill prefill(UUID caseId, UUID patientId, AccountSetup account) {
        Profile p = profile(patientId);
        Submission sub = submission(caseId);
        MedicalCaseRepository.OnboardingFacts c = cases.findOnboardingFacts(caseId).orElseThrow();
        String onboarding = currentOnboardingState(caseId);
        List<String> required = readiness.requiredConsentTypes(subjectType(patientId));
        List<String> completed = consents.findLiveTypesCovering(patientId, caseId);
        DepositSummary deposit = depositSummary(caseId);
        boolean active = "ACTIVE".equals(p.status());
        boolean submittedBySelf = "PATIENT".equals(sub.role());
        // Only the patient's OWN address is a candidate account email. A representative's is never offered.
        String candidateEmail = p.email() != null ? p.email() : null;
        // The number we hold: the patient's when they have one, otherwise the submitter's, with its owner.
        String knownMobile = p.phone() != null ? p.phone() : sub.whatsapp();
        String mobileOwner = p.phone() != null ? "PATIENT" : "REPRESENTATIVE".equals(sub.role()) ? "REPRESENTATIVE" : null;
        return new OnboardingPrefill(c.getCaseNumber(), c.getStatus().name(), onboarding, active, p.subject() != null, account,
                p.givenName(), p.familyName(), p.preferredName(),
                candidateEmail, p.emailVerified(), knownMobile, mobileOwner, p.phoneVerified() && p.phone() != null,
                p.dateOfBirth(), p.nationality(), Countries.toCode(p.country()).orElse(null), p.language(), p.sex(),
                submittedBySelf ? "PATIENT" : "REPRESENTATIVE", submittedBySelf ? null : sub.name(), submittedBySelf ? null : sub.relationship(),
                required, completed, deposit, journeyStage(active, account, deposit), currentAction(active, account, deposit), c.getWaitingOn());
    }

    /** Where the patient stands after a profile submission (or its replay). */
    @Transactional(readOnly = true)
    public ActivationResult result(UUID caseId, UUID patientId, AccountSetup account) {
        Profile p = profile(patientId);
        MedicalCaseRepository.OnboardingFacts c = cases.findOnboardingFacts(caseId).orElseThrow();
        String onboarding = currentOnboardingState(caseId);
        DepositSummary deposit = depositSummary(caseId);
        boolean active = "ACTIVE".equals(p.status());
        return new ActivationResult(active, p.subject() != null, account, c.getCaseNumber(), c.getStatus().name(), onboarding, deposit,
                journeyStage(active, account, deposit), currentAction(active, account, deposit), c.getWaitingOn());
    }

    /** Authoritative, server-resolved deposit for the case. */
    @Transactional(readOnly = true)
    public DepositSummary depositSummary(UUID caseId) {
        var view = deposits.depositForCase(caseId);
        DepositQueryService.Standing standing = deposits.standing(caseId);
        boolean satisfied = standing.satisfied();
        String status = standing.status();
        if (view == null) {
            BigDecimal anticipated = standing.anticipatedEgp();
            boolean required = anticipated.signum() > 0;
            return new DepositSummary(required, status, "EGP", required ? anticipated : BigDecimal.ZERO, BigDecimal.ZERO,
                    required ? anticipated : BigDecimal.ZERO, satisfied);
        }
        boolean required = !satisfied && view.totalDisplay() != null && view.totalDisplay().signum() > 0;
        return new DepositSummary(required, status, view.currency(), view.totalDisplay(), view.paidDisplay(), view.balanceDisplay(), satisfied);
    }

    private String currentOnboardingState(UUID caseId) {
        return onboardings.findNewestOf(caseId, Limit.of(1)).stream().findFirst().map(PatientOnboardingRepository.Current::getState).orElse(null);
    }

    /** Where the case stands. Profile → account setup → deposit → coordination. */
    private static JourneyStage journeyStage(boolean profileActive, AccountSetup account, DepositSummary deposit) {
        if (!profileActive) return JourneyStage.PROFILE;
        if (account.status() != AccountStatus.ACTIVE && account.awaitingEmail()) return JourneyStage.ACCOUNT_SETUP;
        return deposit.satisfied() || !deposit.required() ? JourneyStage.CARE_COORDINATION : JourneyStage.DEPOSIT;
    }

    /**
     * What the patient can do right now. The deposit is arranged offline by a coordinator, so on the deposit
     * stage the honest answer is NONE rather than a payment action the platform cannot honour.
     */
    private static PatientAction currentAction(boolean profileActive, AccountSetup account, DepositSummary deposit) {
        if (!profileActive) return PatientAction.COMPLETE_PROFILE;
        if (account.status() != AccountStatus.ACTIVE && account.awaitingEmail()) return PatientAction.SET_UP_ACCOUNT;
        if (deposit.satisfied() || !deposit.required()) return PatientAction.CONTINUE_IN_PORTAL;
        return PatientAction.NONE;
    }
}
