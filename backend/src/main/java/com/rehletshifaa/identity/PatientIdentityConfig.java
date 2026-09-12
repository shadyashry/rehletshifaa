package com.rehletshifaa.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Chooses the {@link PatientIdentityPort} implementation.
 *
 * <p>{@code app.identity-admin.mode}: {@code keycloak} (always the real provider), {@code simulator} (always
 * in-memory), or {@code auto} (default: the real provider whenever an admin client secret is configured,
 * the simulator otherwise). Production refuses to start on the simulator (see ProductionSafetyValidator).
 */
@Configuration
public class PatientIdentityConfig {
    private static final Logger log = LoggerFactory.getLogger(PatientIdentityConfig.class);

    @Bean
    public PatientIdentityPort patientIdentityPort(
            @Value("${app.identity-admin.mode:auto}") String mode,
            @Value("${app.identity-admin.base-url:http://localhost:8180}") String baseUrl,
            @Value("${app.identity-admin.realm:rehletshifaa}") String realm,
            @Value("${app.identity-admin.client-id:staff-identity-admin}") String clientId,
            @Value("${app.identity-admin.client-secret:}") String clientSecret,
            @Value("${app.identity-admin.web-client-id:rehletshifaa-web}") String webClientId,
            @Value("${app.web-base-url:http://localhost:3000}") String webBaseUrl,
            @Value("${app.identity-admin.setup-lifespan-seconds:86400}") int setupLifespan) {
        boolean configured = clientSecret != null && !clientSecret.isBlank();
        boolean simulate = "simulator".equalsIgnoreCase(mode) || (!"keycloak".equalsIgnoreCase(mode) && !configured);
        if (simulate) {
            log.info("Patient identity provider: in-memory simulator (mode={}, adminClientConfigured={})", mode, configured);
            return new LocalPatientIdentitySimulator();
        }
        return new KeycloakPatientIdentityService(baseUrl, realm, clientId, clientSecret == null ? "" : clientSecret, webClientId, webBaseUrl, setupLifespan);
    }
}
