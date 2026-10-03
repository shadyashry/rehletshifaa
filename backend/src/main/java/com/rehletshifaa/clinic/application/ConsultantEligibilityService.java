package com.rehletshifaa.clinic.application;

import com.rehletshifaa.clinic.api.ClinicDtos.CapabilityView;
import com.rehletshifaa.clinic.api.ClinicDtos.EligibleConsultantView;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

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
 * languages) are shown so the coordinator makes the final choice.
 */
@Service
public class ConsultantEligibilityService {
    private static final String TERMINAL = "'DRAFT','CLOSED','CANCELLED','DECLINED','CLINICALLY_NOT_SUITABLE','EXPIRED'";
    private static final String ELIGIBLE_WHERE =
            "p.practitioner_type='CONSULTANT' AND p.credentialing_status='VERIFIED' AND p.availability_status='AVAILABLE' "
            + "AND p.external_subject IS NOT NULL AND p.account_status<>'DISABLED' AND p.disabled_at IS NULL "
            + "AND (p.care_category=:area OR EXISTS(SELECT 1 FROM consultant_capabilities k WHERE k.practitioner_id=p.id "
            + "AND k.capability_type='CARE_AREA' AND k.capability_code=:area AND k.status='APPROVED')) "
            + "AND EXISTS(SELECT 1 FROM practitioner_credentials c WHERE c.practitioner_id=p.id AND c.status='VERIFIED' "
            + "AND (c.expires_at IS NULL OR c.expires_at>:now))";

    private final JdbcClient jdbc;
    private final Clock clock;

    public ConsultantEligibilityService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc; this.clock = clock;
    }

    /** Eligible consultants for a care area, with the facts a coordinator needs to choose between them. */
    public List<EligibleConsultantView> eligible(String careArea) {
        if (careArea == null || careArea.isBlank()) return List.of();
        return jdbc.sql("SELECT p.id,p.external_subject,p.display_name,p.specialty,p.subspecialty,p.care_category,p.languages,"
                        + "p.availability_status,p.expected_review_hours FROM practitioner_profiles p WHERE " + ELIGIBLE_WHERE
                        + " ORDER BY p.display_name")
                .param("area", careArea).param("now", timestamp(clock.instant()))
                .query((rs, n) -> new Row(rs.getObject("id", UUID.class), rs.getString("external_subject"), rs.getString("display_name"),
                        rs.getString("specialty"), rs.getString("subspecialty"), rs.getString("care_category"), rs.getString("languages"),
                        rs.getString("availability_status"), (Integer) rs.getObject("expected_review_hours")))
                .list().stream()
                .map(row -> new EligibleConsultantView(row.id(), row.name(), row.specialty(), row.subspecialty(), careArea,
                        careArea.equals(row.primaryArea()) ? "PRIMARY_CARE_AREA" : "APPROVED_CAPABILITY", capabilities(row.id()),
                        row.languages(), row.availability(), row.reviewHours(), workload(row.subject(), "ACTIVE"), workload(row.subject(), "PENDING")))
                .toList();
    }

    public boolean isEligible(UUID practitionerId, String careArea) {
        if (practitionerId == null || careArea == null || careArea.isBlank()) return false;
        long matches = jdbc.sql("SELECT COUNT(*) FROM practitioner_profiles p WHERE p.id=:id AND " + ELIGIBLE_WHERE)
                .param("id", practitionerId).param("area", careArea).param("now", timestamp(clock.instant()))
                .query(Long.class).single();
        return matches > 0;
    }

    /** Approved structured capabilities, for display. Only platform governance writes these. */
    public List<CapabilityView> capabilities(UUID practitionerId) {
        return jdbc.sql("SELECT capability_type,capability_code,label FROM consultant_capabilities WHERE practitioner_id=? AND status='APPROVED' ORDER BY capability_type,label")
                .param(practitionerId)
                .query((rs, n) -> new CapabilityView(rs.getString("capability_type"), rs.getString("capability_code"), rs.getString("label")))
                .list();
    }

    private int workload(String subject, String status) {
        Long n = jdbc.sql("SELECT COUNT(DISTINCT a.case_id) FROM case_assignments a JOIN medical_cases c ON c.id=a.case_id "
                        + "WHERE a.assignee_subject=? AND a.assignee_role='DOCTOR' AND a.status=? AND c.status NOT IN (" + TERMINAL + ")")
                .params(subject, status).query(Long.class).single();
        return n == null ? 0 : n.intValue();
    }

    private record Row(UUID id, String subject, String name, String specialty, String subspecialty, String primaryArea,
                       String languages, String availability, Integer reviewHours) {}
}
