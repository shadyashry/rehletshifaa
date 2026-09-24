package com.rehletshifaa.provider.infrastructure;

import com.rehletshifaa.access.application.ProviderOrganizationAuthorityPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
public class ProviderOrganizationAuthorityAdapter implements ProviderOrganizationAuthorityPort {
    private final JdbcClient jdbc;
    public ProviderOrganizationAuthorityAdapter(JdbcClient jdbc){this.jdbc=jdbc;}
    @Override public boolean verifiedOrganization(UUID organizationId){return jdbc.sql("SELECT COUNT(*) FROM provider_organizations WHERE id=? AND status<>'OFFBOARDED'").param(organizationId).query(Long.class).single()>0;}
    @Override public boolean trustedSubject(String subject){return jdbc.sql("SELECT COUNT(*) FROM access_subjects WHERE subject=? AND active=TRUE").param(subject).query(Long.class).single()>0;}
    @Override public Optional<String> organizationName(UUID organizationId){return jdbc.sql("SELECT display_name FROM provider_organizations WHERE id=?").param(organizationId).query(String.class).optional();}
    /** The same resolution the clinician endpoints use: an enrollment that is not offboarded, in an organization that is not offboarded. */
    @Override public Optional<Clinician> clinician(UUID organizationId,UUID practitionerId){
        return jdbc.sql("SELECT p.id,p.external_subject,p.display_name FROM clinician_onboardings o JOIN practitioner_profiles p ON p.id=o.practitioner_id JOIN provider_organizations po ON po.id=o.organization_id AND po.status<>'OFFBOARDED' WHERE o.organization_id=? AND o.practitioner_id=? AND o.status<>'OFFBOARDED'")
                .params(organizationId,practitionerId).query((r,n)->new Clinician(r.getObject(1,UUID.class),r.getString(2),r.getString(3))).optional();
    }
}
