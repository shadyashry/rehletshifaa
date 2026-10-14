package com.rehletshifaa.shared.crypto;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The key-rotation sweep against real PostgreSQL: {@code information_schema} discovery, keyset batching and the
 * conditional update all run on the production database rather than H2's PostgreSQL mode. Same disposable
 * database and system property as {@code PostgresJpaMappingTest}:
 * {@code mvn -o test -Dtest=PostgresPiiKeyRotationTest -Djpa.postgres.test-url=jdbc:postgresql://127.0.0.1:55439/jpa_mapping_test}.
 */
@EnabledIfSystemProperty(named = "jpa.postgres.test-url", matches = "jdbc:postgresql://127[.]0[.]0[.]1:55439/jpa_mapping_test")
@SpringBootTest(properties = {"spring.task.scheduling.enabled=false", "app.crypto.pii-keys.2=pii-rotation-postgres-key-2"})
class PostgresPiiKeyRotationTest {
    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("jpa.postgres.test-url"));
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
    }

    @Autowired PiiKeyRotationService rotation;
    @Autowired CryptoService crypto;
    @Autowired JdbcTemplate jdbc;

    private final UUID patientId = UUID.randomUUID();
    private final String subject = "rotation-" + patientId;

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM patient_profiles WHERE id=?", patientId);
        jdbc.update("DELETE FROM portal_preferences WHERE subject=?", subject);
    }

    @Test
    void rewritesOldKeyValuesOnPostgresForIdAndSubjectKeyedTables() {
        assertThat(crypto.activeVersion()).isEqualTo(2);
        String legacyName = PiiCipher.encrypt(PiiCipher.aesKey(CryptoService.DEV_KEY), "Plain");
        String legacyDisplay = PiiCipher.encrypt(PiiCipher.aesKey(CryptoService.DEV_KEY), "Coordinator A");
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO patient_profiles(id,given_name,country,preferred_language,created_at,updated_at,version) VALUES(?,?,'AE','en',?,?,0)",
                patientId, legacyName, now, now);
        jdbc.update("INSERT INTO portal_preferences(subject,display_name_encrypted,locale,updated_at) VALUES(?,?,'en',?)",
                subject, legacyDisplay, now);

        PiiKeyRotationService.RotationReport report = rotation.rotateNow();

        String givenName = jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patientId);
        assertThat(givenName).startsWith("v2:");
        assertThat(crypto.decrypt(givenName)).isEqualTo("Plain");
        String display = jdbc.queryForObject("SELECT display_name_encrypted FROM portal_preferences WHERE subject=?", String.class, subject);
        assertThat(display).startsWith("v2:");
        assertThat(crypto.decrypt(display)).isEqualTo("Coordinator A");
        assertThat(report.rowsRewritten()).isGreaterThanOrEqualTo(2);
        assertThat(report.failures()).isZero();
        Map<String, Object> counts = jdbc.queryForMap("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = CURRENT_SCHEMA AND column_name = 'whatsapp_hmac'");
        assertThat(((Number) counts.get("n")).intValue()).isEqualTo(2);
    }
}
