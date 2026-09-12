package com.rehletshifaa.identity;

import java.util.List;
import java.util.Optional;

/**
 * The identity provider as the patient journey needs it — nothing more.
 *
 * <p>Keycloak owns credentials: this port can look an account up, create one <em>without</em> a password,
 * ask Keycloak to email the account owner a time-limited "create your password" action, and keep the
 * given/family name in step with the canonical patient. No password, temporary or otherwise, ever passes
 * through this application. The patient domain stays authoritative for demographic data; the provider is
 * authoritative for authentication only.
 */
public interface PatientIdentityPort {

    /** A provider account, reduced to what identity resolution needs. */
    record IdentityUser(String subject, String email, boolean emailVerified, boolean enabled, List<String> requiredActions) {
        /** An account whose owner still has a setup action (password, email verification) outstanding. */
        public boolean setupPending() { return requiredActions != null && !requiredActions.isEmpty(); }
    }

    /** Exact, case-insensitive lookup. Used only server-side — the result is never surfaced publicly. */
    Optional<IdentityUser> findByEmail(String email);

    Optional<IdentityUser> findBySubject(String subject);

    /**
     * Create a patient account with the PATIENT realm role, no credential, and the required actions
     * that make the owner create a password (and verify the address if it is not already proven).
     *
     * @return the new provider subject (Keycloak user id)
     */
    String provisionPatient(String email, String givenName, String familyName, String locale, boolean emailVerified);

    /**
     * Ask the provider to email the account owner a time-limited link that performs the outstanding
     * setup actions and then returns the browser to {@code redirectPath} on the web app.
     */
    void sendAccountSetup(String subject, String locale, String redirectPath);

    /** Sync the canonical structured name onto the provider profile (never the other way round). */
    void syncProfile(String subject, String givenName, String familyName, String locale);

    /** True when this deployment can actually reach an identity provider. */
    boolean available();
}
