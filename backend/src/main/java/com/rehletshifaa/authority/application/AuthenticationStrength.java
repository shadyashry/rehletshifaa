package com.rehletshifaa.authority.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Interprets identity-provider authentication evidence; business authority still comes only from the database. */
@Component
public class AuthenticationStrength {
    private final Set<String> mfaAcrValues;
    private final Set<String> phishingResistantAcrValues;

    public AuthenticationStrength(
            @Value("${app.security.mfa-acr-values:2,3}") String mfaAcrValues,
            @Value("${app.security.phishing-resistant-acr-values:3}") String phishingResistantAcrValues) {
        this.mfaAcrValues = values(mfaAcrValues);
        this.phishingResistantAcrValues = values(phishingResistantAcrValues);
    }

    public boolean recentMfa(Principal principal, Duration window, Instant now) {
        return principal.authenticatedWithin(window, now) && mfaAcrValues.contains(normalize(principal.acr()));
    }

    public boolean mfa(Principal principal) { return mfaAcrValues.contains(normalize(principal.acr())); }

    public boolean recentPhishingResistant(Principal principal, Duration window, Instant now) {
        return principal.authenticatedWithin(window, now) && phishingResistant(principal);
    }

    public boolean phishingResistant(Principal principal) {
        return phishingResistantAcrValues.contains(normalize(principal.acr()));
    }

    private static Set<String> values(String configured) {
        return Arrays.stream(configured.split(","))
                .map(AuthenticationStrength::normalize)
                .filter(value -> !value.isBlank())
                .collect(Collectors.toUnmodifiableSet());
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
