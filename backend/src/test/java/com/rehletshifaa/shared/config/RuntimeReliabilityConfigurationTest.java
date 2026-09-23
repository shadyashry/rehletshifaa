package com.rehletshifaa.shared.config;

import com.rehletshifaa.notification.application.NotificationOutboxProcessor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.core.io.FileSystemResource;

import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validates the shipped {@code src/main/resources/application.yml} (tests run against their own
 * {@code application.yml}, which shadows it on the classpath). {@link RuntimeReliabilityWiringTest} proves Spring
 * Boot actually applies these keys; this proves the values that ship are finite and mutually consistent.
 */
class RuntimeReliabilityConfigurationTest {
    static final Properties MAIN = load("src/main/resources/application.yml");

    static Properties load(String path) {
        var yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new FileSystemResource(path));
        return yaml.getObject();
    }
    /** The value a deployment gets when it sets no environment override: the placeholder default. */
    static String shipped(String key) {
        String raw = MAIN.getProperty(key);
        assertThat(raw).as(key).isNotNull();
        Matcher m = Pattern.compile("^\\$\\{[A-Z0-9_]+:(.*)}$").matcher(raw);
        return m.matches() ? m.group(1) : raw;
    }
    static Duration duration(String key) { return DurationStyle.detectAndParse(shipped(key)); }
    static Duration millis(String key) { return Duration.ofMillis(Long.parseLong(shipped(key))); }

    @Test void everyRemoteDependencyHasAFiniteTimeout() {
        assertThat(duration("spring.http.client.connect-timeout")).isPositive().isLessThanOrEqualTo(Duration.ofSeconds(10));
        assertThat(duration("spring.http.client.read-timeout")).isPositive().isLessThanOrEqualTo(Duration.ofSeconds(30));
        for (String key : List.of("connectiontimeout", "timeout", "writetimeout"))
            assertThat(millis("spring.mail.properties.mail.smtp." + key)).isPositive().isLessThanOrEqualTo(Duration.ofSeconds(30));
        assertThat(duration("spring.data.redis.timeout")).isPositive();
        assertThat(duration("spring.data.redis.connect-timeout")).isPositive();
        assertThat(millis("app.storage.clamav.timeout-milliseconds")).isPositive();
    }

    @Test void noOutboxSendCanOutliveTheLeaseMarginItStartedWithin() {
        Duration slowestSmtp = millis("spring.mail.properties.mail.smtp.connectiontimeout")
                .plus(millis("spring.mail.properties.mail.smtp.writetimeout")).plus(millis("spring.mail.properties.mail.smtp.timeout"));
        Duration slowestHttp = duration("spring.http.client.connect-timeout").plus(duration("spring.http.client.read-timeout"));
        assertThat(NotificationOutboxProcessor.SEND_MARGIN).isGreaterThan(slowestSmtp).isGreaterThan(slowestHttp);
    }

    @Test void readinessTracksOnlyTheCriticalDatabaseAndLivenessOnlyTheProcess() {
        assertThat(shipped("management.endpoint.health.probes.enabled")).isEqualTo("true");
        assertThat(List.of(shipped("management.endpoint.health.group.readiness.include").split(","))).containsExactly("readinessState", "db");
        assertThat(List.of(shipped("management.endpoint.health.group.liveness.include").split(","))).containsExactly("livenessState");
    }

    @Test void shutdownIsGracefulBoundedAndFitsInsideEveryContainerStopGrace() {
        assertThat(shipped("server.shutdown")).isEqualTo("graceful");
        assertThat(shipped("spring.task.scheduling.shutdown.await-termination")).isEqualTo("true");
        Duration bound = duration("spring.lifecycle.timeout-per-shutdown-phase").plus(duration("spring.task.scheduling.shutdown.await-termination-period"));
        assertThat(bound).isPositive();
        Properties local = load("../docker-compose.yml");
        Properties oracle = load("../deploy/oracle/docker-compose.yml");
        assertThat(DurationStyle.detectAndParse(local.getProperty("services.backend.stop_grace_period"))).isGreaterThan(bound);
        assertThat(DurationStyle.detectAndParse(oracle.getProperty("services.backend.stop_grace_period"))).isGreaterThan(bound);
    }
}
