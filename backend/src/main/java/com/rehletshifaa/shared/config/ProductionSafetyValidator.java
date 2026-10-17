package com.rehletshifaa.shared.config;

import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@Profile("prod")
public class ProductionSafetyValidator implements ApplicationRunner {
    private final Environment environment;

    public ProductionSafetyValidator(Environment environment) { this.environment = environment; }

    @Override public void run(ApplicationArguments args) {
        List<String> failures = new ArrayList<>();
        require(failures, "DB_URL", false);
        require(failures, "DB_USERNAME", false);
        require(failures, "DB_PASSWORD", false);
        require(failures, "S3_BUCKET", false);
        require(failures, "FRONTEND_ALLOWED_ORIGINS", true);
        require(failures, "APP_PUBLIC_BASE_URL", true);
        require(failures, "APP_WEB_BASE_URL", true);
        require(failures, "TURNSTILE_SECRET", false);
        require(failures, "WEB_REVALIDATE_URL", false);
        requireSecret(failures, "REVALIDATE_SECRET", "local-only-revalidate-secret-change-in-production");
        String revalidateUrl = environment.getProperty("WEB_REVALIDATE_URL", "");
        try {
            java.net.URI uri = java.net.URI.create(revalidateUrl);
            if (uri.getScheme() == null || !java.util.Set.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null)
                failures.add("app.web.revalidate-url must be an absolute HTTP(S) URL without credentials");
        } catch (IllegalArgumentException e) { failures.add("app.web.revalidate-url must be an absolute HTTP(S) URL without credentials"); }

        require(failures, "COORDINATOR_EMAIL", false);
        require(failures, "MAIL_FROM", false);
        require(failures, "OIDC_ISSUER_URI", true);
        require(failures, "OIDC_JWK_SET_URI", true);
        require(failures, "CLAIM_TOKEN_PEPPER", false);
        requireSecret(failures, "PII_ENCRYPTION_KEY", CryptoService.DEV_KEY, "local-only-pii-key-change-in-production");
        requireSecret(failures, "PII_INDEX_KEY", CryptoService.DEV_INDEX_KEY);
        // DEP-3: the account patients are told to pay into. The development placeholders must never reach a patient.
        requireNotPlaceholder(failures, "PAYMENT_BANK_ACCOUNT_NAME", "test account");
        requireNotPlaceholder(failures, "PAYMENT_BANK_NAME", "test bank", "dummy");
        requireNotPlaceholder(failures, "PAYMENT_BANK_ACCOUNT_NUMBER", "0000000");
        requireNotPlaceholder(failures, "PAYMENT_BANK_IBAN", "eg0000000");
        requireNotPlaceholder(failures, "PAYMENT_BANK_SWIFT", "testeg");
        String whatsappMode=environment.getProperty("app.whatsapp.mode", "");
        if ("webhook".equals(whatsappMode)) {
            require(failures, "WHATSAPP_WEBHOOK_URL", true);
            require(failures, "WHATSAPP_TOKEN", false);
        } else if ("meta".equals(whatsappMode)) {
            require(failures, "WHATSAPP_META_PHONE_NUMBER_ID", false);
            require(failures, "WHATSAPP_META_ACCESS_TOKEN", false);
            require(failures, "WHATSAPP_META_VERIFY_TOKEN", false);
            require(failures, "WHATSAPP_META_APP_SECRET", false);
        } else failures.add("WHATSAPP_MODE must resolve to webhook or meta");
        // Redis is shared state across instances; a production deployment must not silently point at
        // the localhost dev default, and the rate-limit and cache keys must not be readable by anyone
        // who can reach the port.
        if (environment.getProperty("app.cache.enabled", Boolean.class, true)) {
            require(failures, "REDIS_HOST", true);
            require(failures, "REDIS_PASSWORD", false);
        }
        if (!"s3".equals(environment.getProperty("app.storage.mode"))) failures.add("STORAGE_MODE must resolve to s3");
        if (!"smtp".equals(environment.getProperty("app.mail.mode"))) failures.add("MAIL_MODE must resolve to smtp");
        // Patient account setup is delegated to the identity provider; production must never run on the in-memory simulator.
        if ("simulator".equalsIgnoreCase(environment.getProperty("app.identity-admin.mode", "auto"))) failures.add("IDENTITY_ADMIN_MODE must not be simulator");
        require(failures, "IDENTITY_ADMIN_CLIENT_SECRET", false);
        if (!"live".equals(environment.getProperty("app.notifications.mode"))) failures.add("NOTIFICATIONS_MODE must resolve to live");
        if (!environment.getProperty("app.security.enabled", Boolean.class, false)) failures.add("APP_SECURITY_ENABLED must resolve to true");
        if (!environment.getProperty("app.turnstile.enabled", Boolean.class, false)) failures.add("TURNSTILE_ENABLED must resolve to true");
        if (!failures.isEmpty()) throw new IllegalStateException("Unsafe production configuration: " + String.join("; ", failures));
    }

    /** A secret that must be set, long enough to matter, and none of the development defaults. */
    private void requireSecret(List<String> failures, String key, String... developmentDefaults) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank() || "change-me".equalsIgnoreCase(value)) { failures.add(key + " is required"); return; }
        if (value.length() < 32) failures.add(key + " must be at least 32 characters");
        for (String dev : developmentDefaults) if (dev.equals(value)) failures.add(key + " is the development default");
    }

    /** A value that must be set and must not be one of the development placeholders (matched case-insensitively). */
    private void requireNotPlaceholder(List<String> failures, String key, String... placeholders) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank()) { failures.add(key + " is required"); return; }
        String lowered = value.toLowerCase();
        for (String placeholder : placeholders) if (lowered.contains(placeholder)) failures.add(key + " contains a placeholder value");
    }

    private void require(List<String> failures, String key, boolean publicUrl) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank() || "change-me".equalsIgnoreCase(value)) { failures.add(key + " is required"); return; }
        String lowered = value.toLowerCase();
        if (lowered.contains("example.com") || lowered.contains("local.test") || (publicUrl && (lowered.contains("localhost") || lowered.contains("127.0.0.1")))) failures.add(key + " contains a non-production value");
    }
}
