package com.rehletshifaa.security;

import com.rehletshifaa.authority.TestPrincipals;
import com.rehletshifaa.authority.domain.Role;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
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
 * P1-8 (E-05): the operational meters and the Prometheus scrape are served on the internal metrics port only. The main port
 * serves health and never the meters, not even to a System Administrator with a passkey; the metrics port serves the meters
 * without a token and nothing else; no other actuator internals are exposed on either port.
 */
@SpringBootTest(properties = {"spring.task.scheduling.enabled=false", "app.management.metrics-port=" + MetricsPortTest.METRICS})
@AutoConfigureMockMvc
@AutoConfigureObservability(tracing = false) // Boot's test slice switches metric exporters off; this test proves the Prometheus one
@Transactional
class MetricsPortTest {
    static final int MAIN = 8080, METRICS = 18090;

    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired CryptoService crypto;

    @Test void theMainPortServesHealthButNeverTheMeters() throws Exception {
        assertThat(status(MAIN, "/actuator/health", null)).isEqualTo(200);
        assertThat(status(MAIN, "/actuator/metrics", null)).isIn(401, 403);
        assertThat(status(MAIN, "/actuator/metrics/work.open.total", null)).isIn(401, 403);
        assertThat(status(MAIN, "/actuator/prometheus", null)).isIn(401, 403);
        String admin = "metrics-admin-" + UUID.randomUUID();
        TestPrincipals.grant(jdbc, crypto, admin, Role.SYSTEM_ADMINISTRATOR);
        assertThat(status(MAIN, "/actuator/metrics", passkey(admin))).isEqualTo(403);
        assertThat(status(MAIN, "/actuator/metrics/work.open.total", passkey(admin))).isEqualTo(403);
        assertThat(status(MAIN, "/actuator/prometheus", passkey(admin))).isEqualTo(403);
    }

    /** P1-8 session 2: Prometheus scrapes backend:8090 without a token; the business meters and the job health are in it. */
    @Test void theMetricsPortServesThePrometheusScrape() throws Exception {
        var scrape = mvc.perform(get("/actuator/prometheus").with(request -> { request.setLocalPort(METRICS); request.setServerPort(METRICS); return request; }))
                .andReturn().getResponse();
        assertThat(scrape.getStatus()).isEqualTo(200);
        String body = scrape.getContentAsString();
        // Prometheus names: a gauge loses ".total" and gains its unit (work.open.high -> work_open_high_items); see alerts.yml.
        assertThat(body).contains("\nwork_open ", "\nnotification_outbox_dead_letters ", "conversation_reply_timer_breach_total{",
                "scheduler_job_last_success_seconds{task=\"ConsultantOfferExpiryService.expireOffers\"}",
                "scheduler_job_cadence_seconds{task=\"ConsultantOfferExpiryService.expireOffers\"} 60.0",
                "scheduler_job_failures_total{task=\"ConsultantOfferExpiryService.expireOffers\"}");
        assertThat(status(METRICS, "/actuator/prometheus/anything", null)).isEqualTo(404);
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
            for (String path : List.of("/actuator/env", "/actuator/beans", "/actuator/loggers", "/actuator/heapdump", "/actuator/threaddump"))
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
