package com.rehletshifaa.clinic.application;

import com.rehletshifaa.casemanagement.domain.CaseStatus;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultantCapabilityRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultantEligibilityRepository;
import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityView;
import com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The one rule for "may this consultant receive this case", used by coordinator assignment, consultant
 * referrals and the virtual clinic's own "assignable" indicator. A consultant is eligible for a care area when:
 * <ul>
 *   <li>the account is an active consultant account (a consultant profile, linked sign-in, not disabled);</li>
 *   <li>credentialing is VERIFIED and at least one verified credential is current (the expiry check);</li>
 *   <li>the consultant is available for new cases;</li>
 *   <li>the care area is their primary care area, or an APPROVED structured {@code CARE_AREA} capability.</li>
 * </ul>
 * Organization membership plays no part. The one provider-side fact consulted is the credential authority:
 * a consultant whose credentials moved to the provider credential workflow is not verified by the direct rule
 * above, so they fail closed here rather than being admitted on a stale direct credential.
 * <p>Care area is only the first filter; the returned capabilities (subspecialty, procedures, age group,
 * languages) are shown so the coordinator makes the final choice. The rule itself is
 * {@link ConsultantEligibilityRepository#ELIGIBLE}.
 */
@Service
public class ConsultantEligibilityService {
    /** Cases that no longer count towards a consultant's workload. */
    private static final Set<CaseStatus> NOT_LIVE = EnumSet.of(CaseStatus.DRAFT, CaseStatus.CLOSED, CaseStatus.CANCELLED,
            CaseStatus.DECLINED, CaseStatus.CLINICALLY_NOT_SUITABLE, CaseStatus.EXPIRED);

    private final ConsultantEligibilityRepository eligibility;
    private final ConsultantCapabilityRepository capabilities;
    private final CaseAssignmentRepository assignments;
    private final Clock clock;

    public ConsultantEligibilityService(ConsultantEligibilityRepository eligibility, ConsultantCapabilityRepository capabilities,
                                        CaseAssignmentRepository assignments, Clock clock) {
        this.eligibility = eligibility; this.capabilities = capabilities; this.assignments = assignments; this.clock = clock;
    }

    /** Eligible consultants for a care area, with the facts a coordinator needs to choose between them. */
    public List<EligibleConsultantView> eligible(String careArea) {
        if (careArea == null || careArea.isBlank()) return List.of();
        return eligibility.findEligible(careArea, micros(clock.instant())).stream()
                .map(p -> new EligibleConsultantView(p.getId(), p.getDisplayName(), p.getSpecialty(), p.getSubspecialty(), careArea,
                        careArea.equals(p.getCareCategory()) ? "PRIMARY_CARE_AREA" : "APPROVED_CAPABILITY", capabilities(p.getId()),
                        p.getLanguages(), p.getAvailabilityStatus(), p.getExpectedReviewHours(),
                        workload(p.getExternalSubject(), "ACTIVE"), workload(p.getExternalSubject(), "PENDING")))
                .toList();
    }

    public boolean isEligible(UUID practitionerId, String careArea) {
        if (practitionerId == null || careArea == null || careArea.isBlank()) return false;
        return eligibility.isEligible(practitionerId, careArea, micros(clock.instant()));
    }

    /** Approved structured capabilities, for display. Only platform governance writes these. */
    public List<CapabilityView> capabilities(UUID practitionerId) {
        return capabilities.findByPractitionerIdAndStatusOrderByCapabilityTypeAscLabelAsc(practitionerId, "APPROVED").stream()
                .map(c -> new CapabilityView(c.getCapabilityType(), c.getCapabilityCode(), c.getLabel())).toList();
    }

    private int workload(String subject, String status) {
        return (int) assignments.countConsultantCases(subject, status, NOT_LIVE);
    }
}
