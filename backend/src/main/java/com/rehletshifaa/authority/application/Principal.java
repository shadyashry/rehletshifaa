package com.rehletshifaa.authority.application;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;

/**
 * The authenticated subject of the request. The identity provider proves who it is and how recently and strongly
 * it authenticated — nothing else; business roles never come from the token.
 */
public record Principal(String subject, Instant authenticatedAt, String acr) {

    public static Principal current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken || auth.getName() == null)
            throw new ApiException(401, "AUTHENTICATION_REQUIRED", "Sign in to continue");
        if (auth instanceof JwtAuthenticationToken jwt) {
            Instant at = jwt.getToken().getClaimAsInstant("auth_time");
            java.util.List<String> amr = jwt.getToken().getClaimAsStringList("amr");
            return new Principal(auth.getName(), at, amr != null ? assurance(amr) : jwt.getToken().getClaimAsString("acr"));
        }
        return new Principal(auth.getName(), null, null);
    }

    /** Identity evidence only: the provider's email for the account and whether it verified it. */
    public static java.util.Optional<AccountEmail> accountEmail() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwt)) return java.util.Optional.empty();
        String email = jwt.getToken().getClaimAsString("email");
        if (email == null || email.isBlank()) return java.util.Optional.empty();
        return java.util.Optional.of(new AccountEmail(email.trim().toLowerCase(java.util.Locale.ROOT), Boolean.TRUE.equals(jwt.getToken().getClaimAsBoolean("email_verified"))));
    }

    public record AccountEmail(String email, boolean verified) {}

    /**
     * A2b: how the person signed in, from the provider's {@code amr} (RFC 8176) — "3" a passkey (phishing-resistant),
     * "2" another second factor (authenticator app, recovery code), "1" a password only. Keycloak issues {@code amr} for
     * every browser sign-in; the plain {@code acr} is read only when a token carries no {@code amr} at all, and without
     * step-up levels Keycloak never sets it above 1 — so it can never vouch for a second factor that did not happen.
     */
    static String assurance(java.util.List<String> amr) {
        if (amr.contains("hwk") || amr.contains("swk")) return "3";
        if (amr.contains("otp") || amr.contains("mfa")) return "2";
        return "1";
    }

    public boolean authenticatedWithin(java.time.Duration window, Instant now) {
        return authenticatedAt != null && !authenticatedAt.isBefore(now.minus(window)) && !authenticatedAt.isAfter(now.plusSeconds(60));
    }
}
