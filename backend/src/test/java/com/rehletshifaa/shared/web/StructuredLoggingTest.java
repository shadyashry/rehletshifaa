package com.rehletshifaa.shared.web;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.slf4j.event.KeyValuePair;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.logging.logback.StructuredLogEncoder;
import org.springframework.core.env.Environment;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The log contract Elasticsearch/Kibana searches depend on, checked against the production
 * {@code application.yml}: every event is one ECS JSON object on one line, carries the service, the
 * request's correlation id under {@code http.request.id}, a stable {@code event.code} when one is given,
 * and keeps a multi-line stack trace inside {@code error.stack_trace} instead of breaking the line.
 */
class StructuredLoggingTest {

    @Test
    void anErrorIsOneSearchableEcsLine() throws Exception {
        StandardEnvironment environment = new StandardEnvironment();
        // The production configuration, not the test one (which shadows it on the classpath).
        new YamlPropertySourceLoader().load("application", new FileSystemResource("src/main/resources/application.yml"))
                .forEach(environment.getPropertySources()::addLast);
        LoggerContext context = new LoggerContext();
        context.putObject(Environment.class.getName(), environment);
        StructuredLogEncoder encoder = new StructuredLogEncoder();
        encoder.setContext(context);
        encoder.setFormat(environment.getProperty("logging.structured.format.console"));
        encoder.start();

        LoggingEvent event = new LoggingEvent(getClass().getName(), context.getLogger("com.rehletshifaa.journey.application.Example"),
                Level.ERROR, "Failure with \"quotes\" and a\nnewline", new IllegalStateException("boom"), null);
        event.setMDCPropertyMap(Map.of(CorrelationIdFilter.MDC_KEY, "req-ecs-123"));
        event.addKeyValuePair(new KeyValuePair("event.code", "INTERNAL_ERROR"));
        String encoded = new String(encoder.encode(event), StandardCharsets.UTF_8);

        assertThat(encoded.strip()).as("one line per event").doesNotContain("\n");
        JsonNode line = new ObjectMapper().readTree(encoded);
        assertThat(line.path("log").path("level").asText()).isEqualTo("ERROR");
        assertThat(line.path("log").path("logger").asText()).isEqualTo("com.rehletshifaa.journey.application.Example");
        assertThat(line.path("service").path("name").asText()).isEqualTo("rehletshifaa-backend");
        assertThat(line.path("service").path("environment").asText()).isEqualTo("local");
        assertThat(line.path("http").path("request").path("id").asText()).isEqualTo("req-ecs-123");
        assertThat(line.path("event").path("code").asText()).isEqualTo("INTERNAL_ERROR");
        assertThat(line.path("message").asText()).isEqualTo("Failure with \"quotes\" and a\nnewline");
        assertThat(line.path("error").path("type").asText()).isEqualTo(IllegalStateException.class.getName());
        assertThat(line.path("error").path("stack_trace").asText()).contains("StructuredLoggingTest");
        assertThat(line.has("@timestamp")).isTrue();
    }
}
