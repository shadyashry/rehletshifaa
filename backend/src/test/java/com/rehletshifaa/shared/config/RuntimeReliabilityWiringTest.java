package com.rehletshifaa.shared.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthEndpointGroups;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.ServerSocket;
import java.net.Socket;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The exact keys the shipped configuration uses (checked by {@link RuntimeReliabilityConfigurationTest}) are the
 * ones Spring Boot applies: to the shared RestClient builder, the mail sender and the probe groups. Short
 * timeouts here only keep the test fast.
 */
@SpringBootTest(properties = {"spring.task.scheduling.enabled=false",
        "spring.http.client.connect-timeout=1s", "spring.http.client.read-timeout=1s",
        "spring.mail.host=localhost",
        "spring.mail.properties.mail.smtp.connectiontimeout=5000", "spring.mail.properties.mail.smtp.timeout=15000",
        "spring.mail.properties.mail.smtp.writetimeout=15000",
        "management.endpoint.health.probes.enabled=true",
        "management.endpoint.health.group.liveness.include=livenessState",
        "management.endpoint.health.group.readiness.include=readinessState,db"})
@AutoConfigureMockMvc
class RuntimeReliabilityWiringTest {
    @Autowired RestClient.Builder http;
    @Autowired JavaMailSenderImpl mail;
    @Autowired HealthEndpointGroups groups;
    @Autowired MockMvc mvc;

    @Test void theSharedRestClientBuilderGivesUpOnASilentServer() throws Exception {
        try (ServerSocket silent = new ServerSocket(0)) {
            Thread acceptor = new Thread(() -> { try (Socket s = silent.accept()) { Thread.sleep(10_000); } catch (Exception ignored) { } });
            acceptor.setDaemon(true);
            acceptor.start();
            RestClient client = http.baseUrl("http://127.0.0.1:" + silent.getLocalPort()).build();
            assertTimeoutPreemptively(Duration.ofSeconds(8), () ->
                    assertThatThrownBy(() -> client.get().uri("/").retrieve().toBodilessEntity()).isInstanceOf(ResourceAccessException.class));
        }
    }

    @Test void theMailSenderCarriesFiniteSocketTimeouts() {
        assertThat(mail.getJavaMailProperties()).containsEntry("mail.smtp.connectiontimeout", "5000")
                .containsEntry("mail.smtp.timeout", "15000").containsEntry("mail.smtp.writetimeout", "15000");
    }

    @Test void readinessDependsOnTheDatabaseOnlyAndLivenessOnNoDependency() throws Exception {
        var readiness = groups.get("readiness");
        var liveness = groups.get("liveness");
        assertThat(readiness.isMember("db")).isTrue();
        for (String optional : new String[]{"mail", "redis", "diskSpace"}) assertThat(readiness.isMember(optional)).as(optional).isFalse();
        assertThat(liveness.isMember("db")).isFalse();
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }
}
