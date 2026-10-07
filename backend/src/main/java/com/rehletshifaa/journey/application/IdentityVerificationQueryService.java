package com.rehletshifaa.journey.application;

import com.rehletshifaa.journey.api.JourneyDtos.IdentityVerificationView;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository;
import com.rehletshifaa.journey.infrastructure.PatientIdentityVerificationRepository.Row;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * The reads behind {@link IdentityVerificationService}: one check, the patient's latest, and the reviewer queue. One
 * query each; the encrypted legal name, date of birth and provider reference are never selected. Authorization stays
 * with the caller.
 */
@Service
public class IdentityVerificationQueryService {
    private final PatientIdentityVerificationRepository verifications;

    public IdentityVerificationQueryService(PatientIdentityVerificationRepository verifications) { this.verifications = verifications; }

    @Transactional(readOnly = true)
    public IdentityVerificationView view(UUID id) { return verifications.findRow(id).map(this::toView).orElseThrow(); }

    /** The patient's latest check, or null. */
    @Transactional(readOnly = true)
    public IdentityVerificationView latestForPatient(UUID patientId) {
        return verifications.findNewestRowsOf(patientId, Limit.of(1)).stream().findFirst().map(this::toView).orElse(null);
    }

    /** Checks awaiting a reviewer, oldest request first. */
    @Transactional(readOnly = true)
    public List<IdentityVerificationView> awaitingReview() { return verifications.findAwaitingReviewRows().stream().map(this::toView).toList(); }

    private IdentityVerificationView toView(Row r) {
        return new IdentityVerificationView(r.getId(), r.getSubjectType(), r.getStatus(), r.getAssuranceLevel(), r.getMethod(), r.getProvider(),
                r.getNationality(), r.getDocumentType(), r.getIssuingCountry(), r.getDocumentReferenceMasked(),
                r.getRequestedAt(), r.getVerifiedAt(), r.getExpiresAt(), r.getRejectionReason(), r.getVersion());
    }
}
