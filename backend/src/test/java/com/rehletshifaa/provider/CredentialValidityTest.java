package com.rehletshifaa.provider;

import com.rehletshifaa.provider.application.CredentialValidity;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class CredentialValidityTest {
    private static final Instant NOW = Instant.parse("2026-09-24T09:30:00Z");

    @Test void noExpiryNeverExpires() {
        assertThat(CredentialValidity.expired(null, NOW)).isFalse();
        assertThat(CredentialValidity.effectiveVerified("VERIFIED", "VERIFIED", null, NOW)).isTrue();
    }

    @Test void futureExpiryIsValid() {
        assertThat(CredentialValidity.expired(NOW.plus(Duration.ofDays(21)), NOW)).isFalse();
        assertThat(CredentialValidity.verifiedButExpired("VERIFIED", NOW.plus(Duration.ofDays(21)), NOW)).isFalse();
    }

    /** "Today": the stored value is an instant (the UI stores noon UTC of the chosen date); expiry applies from that instant. */
    @Test void expiryTodayCountsFromTheExpiryInstant() {
        Instant noonToday = Instant.parse("2026-09-24T12:00:00Z");
        assertThat(CredentialValidity.expired(noonToday, NOW)).as("earlier the same day").isFalse();
        assertThat(CredentialValidity.expired(noonToday, noonToday)).as("at the expiry instant").isTrue();
        assertThat(CredentialValidity.expired(noonToday, noonToday.plusSeconds(1))).as("later the same day").isTrue();
    }

    @Test void pastExpiryIsExpiredAndAVerifiedRevisionNoLongerCounts() {
        Instant past = NOW.minus(Duration.ofDays(10));
        assertThat(CredentialValidity.expired(past, NOW)).isTrue();
        assertThat(CredentialValidity.effectiveVerified("VERIFIED", "VERIFIED", past, NOW)).isFalse();
        assertThat(CredentialValidity.verifiedButExpired("VERIFIED", past, NOW)).isTrue();
        assertThat(CredentialValidity.verifiedButExpired("UNDER_REVIEW", past, NOW)).as("only a verified revision is 'verified but expired'").isFalse();
    }

    @Test void aSuspendedLineageIsNeverEffective() {
        assertThat(CredentialValidity.effectiveVerified("VERIFIED", "SUSPENDED", null, NOW)).isFalse();
        assertThat(CredentialValidity.effectiveVerified("UNDER_REVIEW", "VERIFIED", null, NOW)).isFalse();
    }
}
