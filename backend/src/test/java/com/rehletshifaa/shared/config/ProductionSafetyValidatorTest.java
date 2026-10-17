package com.rehletshifaa.shared.config;

import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** P0-1 (review finding E-08): production refuses to start on development encryption keys or placeholder bank details. */
class ProductionSafetyValidatorTest {
    private static MockEnvironment complete() {
        MockEnvironment env = new MockEnvironment();
        for (String key : new String[]{"DB_URL", "DB_USERNAME", "DB_PASSWORD", "S3_BUCKET", "TURNSTILE_SECRET", "COORDINATOR_EMAIL", "MAIL_FROM",
                "CLAIM_TOKEN_PEPPER", "WHATSAPP_META_PHONE_NUMBER_ID", "WHATSAPP_META_ACCESS_TOKEN", "WHATSAPP_META_VERIFY_TOKEN",
                "WHATSAPP_META_APP_SECRET", "REDIS_PASSWORD", "IDENTITY_ADMIN_CLIENT_SECRET"}) env.setProperty(key, "value-" + key);
        env.setProperty("FRONTEND_ALLOWED_ORIGINS", "https://rehletshifaa.com");
        env.setProperty("APP_PUBLIC_BASE_URL", "https://api.rehletshifaa.com");
        env.setProperty("WEB_REVALIDATE_URL", "http://frontend:3000/api/revalidate/consultants");
        env.setProperty("REVALIDATE_SECRET", "production-revalidation-secret-longer-than-32-characters");
        env.setProperty("APP_WEB_BASE_URL", "https://rehletshifaa.com");
        env.setProperty("OIDC_ISSUER_URI", "https://auth.rehletshifaa.com/realms/rs");
        env.setProperty("OIDC_JWK_SET_URI", "https://auth.rehletshifaa.com/realms/rs/certs");
        env.setProperty("REDIS_HOST", "redis.internal");
        env.setProperty("PII_ENCRYPTION_KEY", "a-production-grade-random-secret-of-32-chars-or-more");
        env.setProperty("PII_INDEX_KEY", "another-production-grade-random-secret-32-chars-plus");
        env.setProperty("PAYMENT_BANK_ACCOUNT_NAME", "RehletShifaa LLC");
        env.setProperty("PAYMENT_BANK_NAME", "National Bank of Egypt");
        env.setProperty("PAYMENT_BANK_ACCOUNT_NUMBER", "1234567890123");
        env.setProperty("PAYMENT_BANK_IBAN", "EG380019000500000000263180002");
        env.setProperty("PAYMENT_BANK_SWIFT", "NBEGEGCX");
        env.setProperty("app.whatsapp.mode", "meta");
        env.setProperty("app.storage.mode", "s3");
        env.setProperty("app.mail.mode", "smtp");
        env.setProperty("app.identity-admin.mode", "keycloak");
        env.setProperty("app.notifications.mode", "live");
        env.setProperty("app.security.enabled", "true");
        env.setProperty("app.turnstile.enabled", "true");
        return env;
    }

    @Test
    void aCompleteProductionConfigurationPasses() {
        assertThatCode(() -> new ProductionSafetyValidator(complete()).run(null)).doesNotThrowAnyException();
    }

    @Test
    void developmentEncryptionKeysAreRefused() {
        MockEnvironment env = complete();
        env.setProperty("PII_ENCRYPTION_KEY", CryptoService.DEV_KEY);
        env.setProperty("PII_INDEX_KEY", "short");
        assertThatThrownBy(() -> new ProductionSafetyValidator(env).run(null))
                .hasMessageContaining("PII_ENCRYPTION_KEY is the development default")
                .hasMessageContaining("PII_INDEX_KEY must be at least 32 characters");
    }

    @Test
    void placeholderBankDetailsAreRefused() {
        MockEnvironment env = complete();
        env.setProperty("PAYMENT_BANK_NAME", "Test Bank (dummy details)");
        env.setProperty("PAYMENT_BANK_IBAN", "EG000000000000000000000000000");
        env.setProperty("PAYMENT_BANK_SWIFT", "TESTEGCXXXX");
        env.setProperty("PAYMENT_BANK_ACCOUNT_NUMBER", "");
        assertThatThrownBy(() -> new ProductionSafetyValidator(env).run(null))
                .hasMessageContaining("PAYMENT_BANK_NAME contains a placeholder value")
                .hasMessageContaining("PAYMENT_BANK_IBAN contains a placeholder value")
                .hasMessageContaining("PAYMENT_BANK_SWIFT contains a placeholder value")
                .hasMessageContaining("PAYMENT_BANK_ACCOUNT_NUMBER is required");
    }

    @Test
    void missingOrDevelopmentRevalidationConfigurationIsRefused() {
        MockEnvironment env = complete();
        env.setProperty("WEB_REVALIDATE_URL", "");
        env.setProperty("REVALIDATE_SECRET", "local-only-revalidate-secret-change-in-production");
        assertThatThrownBy(() -> new ProductionSafetyValidator(env).run(null))
                .hasMessageContaining("WEB_REVALIDATE_URL is required")
                .hasMessageContaining("REVALIDATE_SECRET is the development default");
    }
}
