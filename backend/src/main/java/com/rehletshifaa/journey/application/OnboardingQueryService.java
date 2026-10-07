package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.ConsentRecordRepository;
import com.rehletshifaa.casemanagement.infrastructure.MedicalCaseRepository;
import com.rehletshifaa.journey.api.JourneyDtos.OnboardingView;
import com.rehletshifaa.journey.api.JourneyDtos.PatientProfileSummary;
import com.rehletshifaa.journey.infrastructure.PatientOnboardingRepository;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * The read behind {@link OnboardingService}: a case's current onboarding as the patient (and staff) see it. The
 * onboarding row, then the case with its patient in one row, the patient's latest identity check and the onboarding
 * consents covering the case; readiness comes from {@link CustomerReadinessService}. Authorization stays with the caller.
 */
@Service
public class OnboardingQueryService {
    private final PatientOnboardingRepository onboardings;
    private final MedicalCaseRepository cases;
    private final ConsentRecordRepository consents;
    private final CustomerReadinessService readiness;
    private final IdentityVerificationQueryService identities;

    public OnboardingQueryService(PatientOnboardingRepository onboardings, MedicalCaseRepository cases, ConsentRecordRepository consents,
                                  CustomerReadinessService readiness, IdentityVerificationQueryService identities) {
        this.onboardings = onboardings; this.cases = cases; this.consents = consents; this.readiness = readiness; this.identities = identities;
    }

    /** The case's current (newest) onboarding, or {@code ONBOARDING_NOT_FOUND}. */
    @Transactional(readOnly = true)
    public PatientOnboardingRepository.Row current(UUID caseId) {
        return onboardings.findNewestRowsOf(caseId, Limit.of(1)).stream().findFirst()
                .orElseThrow(() -> new ApiException(404, "ONBOARDING_NOT_FOUND", "There is no onboarding to resume for this case yet"));
    }

    @Transactional(readOnly = true)
    public OnboardingView view(UUID caseId) {
        var ob = current(caseId);
        var header = cases.findOnboardingHeader(caseId).orElseThrow(() -> new IllegalStateException("Onboarding case " + caseId + " not found"));
        var profile = new PatientProfileSummary(header.getFullName(), header.getCountry(), header.getWhatsappNumber(), header.getEmail(),
                header.getPhoneVerifiedAt() != null, header.getEmailVerifiedAt() != null);
        var r = readiness.compute(caseId);
        var iv = identities.latestForPatient(header.getPatientId());
        List<String> required = readiness.requiredConsentTypes(ob.getSubjectType());
        List<String> completed = consents.findLiveTypesCovering(header.getPatientId(), caseId).stream()
                .filter(OnboardingService.ONBOARDING_CONSENTS::contains).toList();
        return new OnboardingView(ob.getId(), caseId, header.getCaseNumber(), ob.getState(), ob.getSubjectType(), ob.getStartedAt(),
                ob.getContactVerifiedAt(), ob.getIdentityVerifiedAt(), ob.getSubmittedAt(), ob.getCompletedAt(), ob.getExpiresAt(),
                ob.getVersion(), profile, r, iv, completed, required);
    }
}
