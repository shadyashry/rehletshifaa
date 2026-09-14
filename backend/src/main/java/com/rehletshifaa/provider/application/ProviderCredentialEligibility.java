package com.rehletshifaa.provider.application;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** Narrow compatibility boundary used by legacy journey credential readers and writers. */
@Service
public class ProviderCredentialEligibility {
    private final JdbcClient jdbc;
    private final Clock clock;

    public ProviderCredentialEligibility(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void requireLegacyWriteAllowed(UUID practitionerId) {
        if (adopted(practitionerId))
            throw new ApiException(409, "PROVIDER_CREDENTIAL_POLICY_ADOPTED",
                    "This clinician uses provider credentialing; use the provider credential workflow");
    }

    public boolean eligible(UUID practitionerId) {
        if (!adopted(practitionerId)) {
            return jdbc.sql("SELECT COUNT(*) FROM practitioner_profiles p WHERE p.id=? AND p.credentialing_status='VERIFIED' AND EXISTS(SELECT 1 FROM practitioner_credentials c WHERE c.practitioner_id=p.id AND c.status='VERIFIED' AND (c.expires_at IS NULL OR c.expires_at>?))")
                    .params(practitionerId, timestamp(clock.instant())).query(Long.class).single() > 0;
        }
        var enrollments = jdbc.sql("SELECT organization_id FROM clinician_onboardings WHERE practitioner_id=?")
                .param(practitionerId).query(UUID.class).list();
        if (enrollments.size() != 1) return false;
        UUID organization = enrollments.getFirst();
        if (jdbc.sql("SELECT COUNT(*) FROM clinician_onboardings WHERE organization_id=? AND practitioner_id=? AND credential_policy_cutover_at IS NOT NULL")
                .params(organization,practitionerId).query(Long.class).single() != 1) return false;
        long requirements = jdbc.sql("SELECT COUNT(*) FROM credential_policy_requirements req JOIN credential_policy_versions policy ON policy.id=req.policy_version_id JOIN clinician_onboardings onboarding ON onboarding.clinician_type=policy.clinician_type AND onboarding.jurisdiction=policy.jurisdiction WHERE onboarding.organization_id=? AND onboarding.practitioner_id=? AND req.mandatory=TRUE AND policy.status='PUBLISHED' AND policy.effective_from<=? AND (policy.retired_at IS NULL OR policy.retired_at>?)")
                .params(organization,practitionerId,timestamp(clock.instant()),timestamp(clock.instant())).query(Long.class).single();
        long missing = jdbc.sql("SELECT COUNT(*) FROM credential_policy_requirements req JOIN credential_policy_versions policy ON policy.id=req.policy_version_id JOIN clinician_onboardings onboarding ON onboarding.clinician_type=policy.clinician_type AND onboarding.jurisdiction=policy.jurisdiction WHERE onboarding.organization_id=? AND onboarding.practitioner_id=? AND req.mandatory=TRUE AND policy.status='PUBLISHED' AND policy.effective_from<=? AND (policy.retired_at IS NULL OR policy.retired_at>?) AND NOT EXISTS(SELECT 1 FROM provider_credential_dossiers d JOIN provider_credential_revisions r ON r.dossier_id=d.id WHERE d.organization_id=onboarding.organization_id AND d.practitioner_id=onboarding.practitioner_id AND d.credential_type=req.credential_type AND d.status='VERIFIED' AND r.status='VERIFIED' AND (r.expires_at IS NULL OR r.expires_at>?))")
                .params(organization, practitionerId, timestamp(clock.instant()), timestamp(clock.instant()), timestamp(clock.instant())).query(Long.class).single();
        long valid = jdbc.sql("SELECT COUNT(*) FROM clinician_onboardings o JOIN provider_organizations p ON p.id=o.organization_id JOIN provider_membership_details d ON d.organization_id=o.organization_id AND d.practitioner_id=o.practitioner_id JOIN access_memberships m ON m.organization_id=d.organization_id AND m.subject=d.subject WHERE o.organization_id=? AND o.practitioner_id=? AND o.status='ACTIVE' AND p.status='ACTIVE' AND (p.legacy_mapping_status IS NULL OR p.legacy_mapping_status='REVIEWED') AND m.status='ACTIVE' AND m.effective_from<=? AND (m.effective_to IS NULL OR m.effective_to>?)")
                .params(organization, practitionerId, timestamp(clock.instant()), timestamp(clock.instant())).query(Long.class).single();
        return requirements > 0 && missing == 0 && valid == 1;
    }

    public boolean adopted(UUID practitionerId) {
        return jdbc.sql("SELECT COUNT(*) FROM clinician_onboardings WHERE practitioner_id=? AND credential_policy_cutover_at IS NOT NULL")
                .param(practitionerId).query(Long.class).single() > 0;
    }
}
