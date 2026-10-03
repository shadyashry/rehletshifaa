package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.application.PlatformOwnerRecoveryService;
import com.rehletshifaa.shared.api.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.util.UUID;

/** Opt-in, deployment-only operator boundary for unavailable-owner recovery. */
@Configuration
@ConditionalOnProperty(name = "app.owner-recovery.command.enabled", havingValue = "true")
public class PlatformOwnerRecoveryCommandConfiguration {
    private static final Logger log = LoggerFactory.getLogger(PlatformOwnerRecoveryCommandConfiguration.class);

    @Bean
    ApplicationRunner platformOwnerRecoveryCommand(PlatformOwnerRecoveryService service, Environment environment) {
        return new ApplicationRunner() {
            @Override public void run(ApplicationArguments arguments) {
                String action = required(environment, "app.owner-recovery.command.action").toLowerCase();
                String operator = required(environment, "app.owner-recovery.command.operator");
                if ("complete-due".equals(action)) {
                    log.info("Owner recovery completion result: {}", service.completeDue(operator));
                    return;
                }
                UUID id = UUID.fromString(required(environment, "app.owner-recovery.command.id"));
                if ("status".equals(action)) {
                    log.info("Owner recovery status: {}", service.status(id));
                    return;
                }
                long revision = Long.parseLong(required(environment, "app.owner-recovery.command.revision"));
                if ("verify".equals(action)) {
                    log.info("Owner recovery verification result: {}", service.operatorVerify(id, revision, operator,
                            required(environment, "app.owner-recovery.command.reason"),
                            required(environment, "app.owner-recovery.command.evidence-reference"),
                            environment.getProperty("app.owner-recovery.command.waive-cooling-off", Boolean.class, false)));
                    return;
                }
                if ("complete".equals(action)) {
                    log.info("Owner recovery completion result: {}", service.complete(id, revision, operator));
                    return;
                }
                throw new ApiException(400, "INVALID_OWNER_RECOVERY_COMMAND", "Use verify, status, complete, or complete-due");
            }
        };
    }

    private static String required(Environment environment, String key) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank())
            throw new ApiException(400, "OWNER_RECOVERY_COMMAND_INCOMPLETE", "Missing deployment property " + key);
        return value.trim();
    }
}
