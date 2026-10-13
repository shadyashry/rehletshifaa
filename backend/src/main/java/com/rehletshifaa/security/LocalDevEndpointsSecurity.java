package com.rehletshifaa.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Local-profile test doubles under {@code /dev/whatsapp} (the inbound WhatsApp simulator, QA W-31) need no sign-in: they
 * stand in for an external sender. This chain exists only under the {@code local} profile with the local WhatsApp
 * channel; the main chain still denies {@code /dev} everywhere else, and the API gateway never forwards {@code /dev}.
 */
@Configuration
@Profile("local")
@ConditionalOnProperty(name = "app.whatsapp.mode", havingValue = "noop", matchIfMissing = true)
public class LocalDevEndpointsSecurity {
    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain localDevEndpoints(HttpSecurity http) throws Exception {
        return http.securityMatcher("/dev/whatsapp/**")
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                .csrf(AbstractHttpConfigurer::disable)
                .build();
    }
}
