package com.rehletshifaa.security;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * P1-8 (E-05): the operational meters are served on the internal metrics port only. The main port serves health and never
 * the meters, not even to a System Administrator with a passkey; the metrics port serves the meters without a token and
 * nothing else; no other actuator internals are exposed on either port.
 */
@SpringBootTest(properties = {"spring.task.scheduling.enabled=false", "app.management.metrics-port=" + MetricsPortTest.METRICS})
@AutoConfigureMockMvc
@Transactional
class MetricsPortTest {
    static final int MAIN = 8080, METRICS = 18090;

    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto;

    @Test void theMainPortServesHealthButNeverTheMeters() throws Exception {
        assertThat(status(MAIN, "/actuator/health", null)).isEqualTo(200);
        assertThat(status(MAIN, "/actuator/metrics", null)).isIn(401, 403);
        assertThat(status(MAIN, "/actuator/metrics/work.open.total", null)).isIn(401, 403);
        String admin = "metrics-admin-" + UUID.randomUUID();
        TestPrincipals.grant(jdbc, crypto, admin, Role.SYSTEM_ADMINISTRATOR);
        assertThat(status(MAIN, "/actuator/metrics", passkey(admin))).isEqualTo(403);
        assertThat(status(MAIN, "/actuator/metrics/work.open.total", passkey(admin))).isEqualTo(403);
    }

    @Test void theMetricsPortServesTheMetersWithoutATokenAndNothingElse() throws Exception {
        assertThat(status(METRICS, "/actuator/metrics", null)).isEqualTo(200);
        assertThat(status(METRICS, "/actuator/metrics/work.open.total", null)).isEqualTo(200);
        assertThat(status(METRICS, "/actuator/metrics/notification.outbox.dead.letters.total", null)).isEqualTo(200);
        for (String path : List.of("/api/v1/me", "/api/v1/public/care-categories", "/actuator/health", "/v3/api-docs"))
            assertThat(status(METRICS, path, null)).as(path).isEqualTo(404);
    }

    @Test void noOtherActuatorEndpointIsExposedOnEitherPort() throws Exception {
        for (int port : List.of(MAIN, METRICS))
            for (String path : List.of("/actuator/env", "/actuator/beans", "/actuator/prometheus", "/actuator/loggers", "/actuator/heapdump"))
                assertThat(status(port, path, null)).as(port + " " + path).isNotEqualTo(200);
    }

    private static RequestPostProcessor passkey(String subject) {
        return jwt().jwt(j -> j.subject(subject).claim("amr", List.of("pwd", "hwk")).claim("auth_time", Instant.now()));
    }

    private int status(int port, String path, RequestPostProcessor session) throws Exception {
        var call = get(path).with(request -> { request.setLocalPort(port); request.setServerPort(port); return request; });
        if (session != null) call.with(session);
        return mvc.perform(call).andReturn().getResponse().getStatus();
    }
}
