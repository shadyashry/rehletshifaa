package com.rehletshifaa.shared.config;

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
        require(failures, "TURNSTILE_SECRET", false);
        require(failures, "COORDINATOR_EMAIL", false);
        require(failures, "MAIL_FROM", false);
        require(failures, "OIDC_ISSUER_URI", true);
        require(failures, "OIDC_JWK_SET_URI", true);
        require(failures, "CLAIM_TOKEN_PEPPER", false);
        require(failures, "WHATSAPP_WEBHOOK_URL", true);
        require(failures, "WHATSAPP_TOKEN", false);
        if (!"s3".equals(environment.getProperty("app.storage.mode"))) failures.add("STORAGE_MODE must resolve to s3");
        if (!"smtp".equals(environment.getProperty("app.mail.mode"))) failures.add("MAIL_MODE must resolve to smtp");
        if (!"live".equals(environment.getProperty("app.notifications.mode"))) failures.add("NOTIFICATIONS_MODE must resolve to live");
        if (!"webhook".equals(environment.getProperty("app.whatsapp.mode"))) failures.add("WHATSAPP_MODE must resolve to webhook");
        if (!environment.getProperty("app.security.enabled", Boolean.class, false)) failures.add("APP_SECURITY_ENABLED must resolve to true");
        if (!environment.getProperty("app.turnstile.enabled", Boolean.class, false)) failures.add("TURNSTILE_ENABLED must resolve to true");
        if (!failures.isEmpty()) throw new IllegalStateException("Unsafe production configuration: " + String.join("; ", failures));
    }

    private void require(List<String> failures, String key, boolean publicUrl) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank() || "change-me".equalsIgnoreCase(value)) { failures.add(key + " is required"); return; }
        String lowered = value.toLowerCase();
        if (lowered.contains("example.com") || lowered.contains("local.test") || (publicUrl && (lowered.contains("localhost") || lowered.contains("127.0.0.1")))) failures.add(key + " contains a non-production value");
    }
}
