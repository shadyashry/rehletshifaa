package com.rehletshifaa.provider.application;

import java.time.Instant;

/**
 * The one rule for a provider credential's validity in time. A credential with an expiry is expired from its expiry
 * instant onwards ({@code expires_at <= now}); a credential without one never expires. An independently verified
 * revision counts for readiness only while its dossier is VERIFIED (not suspended) and it has not expired — the stored
 * status is never changed at expiry, so every reader derives it here. The SQL readers
 * ({@link ProviderCredentialEligibility}, {@code CredentialExpiryService}) apply the same comparison.
 */
public final class CredentialValidity {
    private CredentialValidity() {}

    public static boolean expired(Instant expiresAt, Instant now) {
        return expiresAt != null && !expiresAt.isAfter(now);
    }

    /** Verified by an independent reviewer, lineage not suspended, and not expired at {@code now}. */
    public static boolean effectiveVerified(String status, String dossierStatus, Instant expiresAt, Instant now) {
        return "VERIFIED".equals(status) && "VERIFIED".equals(dossierStatus) && !expired(expiresAt, now);
    }

    /** Was independently verified, but the expiry has passed: never presented as currently valid. */
    public static boolean verifiedButExpired(String status, Instant expiresAt, Instant now) {
        return "VERIFIED".equals(status) && expired(expiresAt, now);
    }
}
