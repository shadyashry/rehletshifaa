package com.rehletshifaa.identity;

import java.time.Instant;

/**
 * Backend identity lifecycle only. Calling business services authorize the operation and
 * persist the returned stable subject; organization membership and business grants stay in
 * RehletShifaa. No business role or organization is sent to the identity provider.
 */
public interface IdentityProvisioningPort {
    IdentityAccount invite(String name, String email, String locale);
    default IdentityAccount inviteTracked(String name,String email,String locale,String operationMarker){return invite(name,email,locale);}
    default IdentityAccount inviteTracked(String name,String email,String locale,String operationMarker,String compatibilityRole){return inviteTracked(name,email,locale,operationMarker);}
    default java.util.Optional<IdentityAccount> recover(String operationMarker){return java.util.Optional.empty();}
    /** Exact identity-provider email resolution. Ambiguous or unverified matches fail closed in the business flow. */
    default EmailResolution resolveVerifiedEmail(String email) { return EmailResolution.none(); }
    void setCompatibilityRole(String subject, String role);
    void resend(String subject, String locale);
    void setEnabled(String subject, boolean enabled);
    void logout(String subject);
    String status(String subject, String storedStatus);
    default IdentityState identityState(String subject) { return IdentityState.unavailable(); }
    /** SUP-02: the standard self-service password reset email. */
    default void sendPasswordReset(String subject, String locale) { throw new UnsupportedOperationException("Password reset is not supported"); }
    /** SUP-03: removes the second factors so the person must enrol again; callers end sessions separately. */
    default void resetMfa(String subject) { throw new UnsupportedOperationException("MFA reset is not supported"); }

    record IdentityAccount(String subject, String email, String status, Instant invitedAt) {}
    record IdentityState(boolean available, boolean exists, boolean enabled, boolean mfaEnrolled,
                         boolean phishingResistantMfaEnrolled) {
        public static IdentityState unavailable() { return new IdentityState(false, false, false, false, false); }
    }
    record EmailResolution(Status status, String subject, String email) {
        public enum Status { NONE, UNIQUE_VERIFIED, REVIEW_REQUIRED }
        public static EmailResolution none() { return new EmailResolution(Status.NONE, null, null); }
        public static EmailResolution unique(String subject, String email) { return new EmailResolution(Status.UNIQUE_VERIFIED, subject, email); }
        public static EmailResolution reviewRequired() { return new EmailResolution(Status.REVIEW_REQUIRED, null, null); }
    }
}
