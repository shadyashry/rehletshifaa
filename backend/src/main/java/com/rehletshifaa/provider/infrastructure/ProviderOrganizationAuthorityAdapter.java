package com.rehletshifaa.provider.infrastructure;

import com.rehletshifaa.access.application.ProviderOrganizationAuthorityPort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class ProviderOrganizationAuthorityAdapter implements ProviderOrganizationAuthorityPort {
    private final JdbcClient jdbc;
    public ProviderOrganizationAuthorityAdapter(JdbcClient jdbc){this.jdbc=jdbc;}
    @Override public boolean verifiedOrganization(UUID organizationId){return jdbc.sql("SELECT COUNT(*) FROM provider_organizations WHERE id=? AND status<>'OFFBOARDED'").param(organizationId).query(Long.class).single()>0;}
    @Override public boolean trustedSubject(String subject){return jdbc.sql("SELECT COUNT(*) FROM access_subjects WHERE subject=? AND active=TRUE").param(subject).query(Long.class).single()>0;}
}
