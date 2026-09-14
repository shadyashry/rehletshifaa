package com.rehletshifaa.access.application;

import java.util.UUID;

/** Trusted provider facts used by central Access Governance without importing the provider module. */
public interface ProviderOrganizationAuthorityPort {
    boolean verifiedOrganization(UUID organizationId);
    boolean trustedSubject(String subject);
}
