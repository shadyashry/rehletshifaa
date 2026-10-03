package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.authority.application.AuthenticationStrength;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
public class GovernanceAuthentication {
    private final Clock clock;
    private final AuthenticationStrength authenticationStrength;

    public GovernanceAuthentication(Clock clock, AuthenticationStrength authenticationStrength) {
        this.clock = clock;
        this.authenticationStrength = authenticationStrength;
    }

    public Principal requireRecentPhishingResistant() {
        Principal identity = Principal.current();
        if (!identity.authenticatedWithin(Duration.ofMinutes(10), clock.instant()))
            throw new ApiException(401, "REAUTHENTICATION_REQUIRED", "Sign in again before completing this governance action");
        if (!authenticationStrength.recentPhishingResistant(identity, Duration.ofMinutes(10), clock.instant())) phishingRequired();
        return identity;
    }

    private static void phishingRequired() {
        throw new ApiException(401, "PHISHING_RESISTANT_AUTHENTICATION_REQUIRED",
                "Authenticate with a WebAuthn/passkey flow before completing this governance action");
    }
}
