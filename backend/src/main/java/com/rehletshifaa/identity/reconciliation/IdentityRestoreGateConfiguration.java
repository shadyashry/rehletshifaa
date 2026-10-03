package com.rehletshifaa.identity.reconciliation;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class IdentityRestoreGateConfiguration {
    @Bean
    ApplicationRunner activateIdentityRestoreGate(IdentityRestoreGateStore gate, Clock clock,
            @Value("${app.identity-reconciliation.restore-id:}") String restoreId) {
        return args -> {
            if (!restoreId.isBlank()) gate.activate(restoreId, clock.instant());
        };
    }
}
