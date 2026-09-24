package com.rehletshifaa.access.application;

import java.util.Optional;
import java.util.UUID;

/** Trusted provider facts used by central Access Governance without importing the provider module. */
public interface ProviderOrganizationAuthorityPort {
    boolean verifiedOrganization(UUID organizationId);
    boolean trustedSubject(String subject);
    /** Display name of a provider organization, for access explanations only. */
    Optional<String> organizationName(UUID organizationId);
    /** A clinician enrolled in the organization, resolved server-side (owner subject + display name), or empty. */
    Optional<Clinician> clinician(UUID organizationId, UUID practitionerId);
    record Clinician(UUID practitionerId, String subject, String displayName) {}
}
