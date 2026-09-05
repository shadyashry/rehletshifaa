package com.rehletshifaa.journey.application;

/**
 * Provider abstraction for legal identity proofing. This boundary lets an authorized external
 * identity-verification provider be adapted later without leaking a specific vendor into the core.
 * We deliberately ship NO fake production provider: the only local implementation is a
 * profile-restricted simulator that routes to authorized manual review. Biometric images and complete
 * identity documents are never passed through or stored here — only minimum-necessary fields.
 */
public interface IdentityVerificationPort {
    record Submission(String subjectType, String method, String nationality, String documentType, String issuingCountry) {}
    /** status is one of PENDING, MANUAL_REVIEW, VERIFIED, REJECTED. */
    record Outcome(String status, String provider, String providerReference, String assuranceLevel) {}

    Outcome submit(Submission submission);
    String providerName();
}
