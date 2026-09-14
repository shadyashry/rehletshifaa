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
    default java.util.Optional<IdentityAccount> recover(String operationMarker){return java.util.Optional.empty();}
    void resend(String subject, String locale);
    void setEnabled(String subject, boolean enabled);
    String status(String subject, String storedStatus);

    record IdentityAccount(String subject, String email, String status, Instant invitedAt) {}
}
