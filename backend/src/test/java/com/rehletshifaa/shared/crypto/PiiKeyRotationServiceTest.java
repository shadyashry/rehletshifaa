package com.rehletshifaa.shared.crypto;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Key rotation rewrites values on an older key version onto the active one. Runs on its own in-memory database
 * with a second key configured, so the committed rewrites never reach the database other test contexts share.
 */
@SpringBootTest(properties = {
        "spring.task.scheduling.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:pii-rotation;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH",
        "app.crypto.pii-keys.2=pii-rotation-test-key-2"})
class PiiKeyRotationServiceTest {
    @Autowired PiiKeyRotationService rotation;
    @Autowired CryptoService crypto;
    @Autowired JdbcTemplate jdbc;

    private final UUID patientId = UUID.randomUUID();

    @AfterEach
    void cleanUp() { jdbc.update("DELETE FROM patient_profiles WHERE id=?", patientId); }

    @Test
    void rewritesOldKeyValuesOntoTheActiveVersionAndKeepsTheEnvelope() {
        assertThat(crypto.activeVersion()).isEqualTo(2);
        String legacy = PiiCipher.encrypt(PiiCipher.aesKey(CryptoService.DEV_KEY), "Plain");
        String enveloped = "enc:" + PiiCipher.encrypt(PiiCipher.aesKey(CryptoService.DEV_KEY), "Wrapped");
        String current = crypto.encrypt("Current");
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO patient_profiles(id,given_name,family_name,preferred_name,country,preferred_language,created_at,updated_at,version) "
                + "VALUES(?,?,?,?,'AE','en',?,?,0)", patientId, legacy, enveloped, current, now, now);

        PiiKeyRotationService.RotationReport report = rotation.rotateNow();

        Map<String, Object> row = jdbc.queryForMap("SELECT given_name, family_name, preferred_name FROM patient_profiles WHERE id=?", patientId);
        String givenName = (String) row.get("given_name");
        assertThat(givenName).startsWith("v" + crypto.activeVersion() + ":");
        assertThat(crypto.decrypt(givenName)).isEqualTo("Plain");
        String familyName = (String) row.get("family_name");
        assertThat(familyName).startsWith("enc:v" + crypto.activeVersion() + ":");
        assertThat(crypto.decrypt(familyName.substring("enc:".length()))).isEqualTo("Wrapped");
        assertThat(row.get("preferred_name")).isEqualTo(current);
        assertThat(report.rowsRewritten()).isGreaterThanOrEqualTo(2);
        assertThat(report.rowsAlreadyCurrent()).isGreaterThanOrEqualTo(1);
        assertThat(report.tablesScanned()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void undecryptableValuesAreCountedAndLeftAlone() {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO patient_profiles(id,given_name,country,preferred_language,created_at,updated_at,version) "
                + "VALUES(?,?,'AE','en',?,?,0)", patientId, "not-a-ciphertext", now, now);

        PiiKeyRotationService.RotationReport report = rotation.rotateNow();

        assertThat(report.failures()).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT given_name FROM patient_profiles WHERE id=?", String.class, patientId))
                .isEqualTo("not-a-ciphertext");
    }

    @Test
    void discoveryMatchesSuffixAndExplicitColumnsCaseInsensitivelyAndSkipsTablesWithoutId() {
        PiiKeyRotationService.Discovery discovery = PiiKeyRotationService.discover(Map.of(
                "PATIENT_PROFILES", List.of("ID", "GIVEN_NAME", "COUNTRY", "WHATSAPP_NUMBER"),
                "staff_invitations", List.of("id", "email_encrypted", "email_hmac"),
                "workforce_people", List.of("subject", "display_name_encrypted"),
                "audit_blob", List.of("payload_encrypted"),
                "case_submission_contacts", List.of("id", "case_id"),
                "plain", List.of("id", "name")));

        assertThat(discovery.targets()).containsOnlyKeys("patient_profiles", "staff_invitations", "workforce_people");
        assertThat(discovery.keyColumns()).containsEntry("patient_profiles", "id").containsEntry("workforce_people", "subject");
        assertThat(discovery.targets().get("patient_profiles")).containsExactly("given_name", "whatsapp_number");
        assertThat(discovery.targets().get("staff_invitations")).containsExactly("email_encrypted");
        assertThat(discovery.withoutId()).containsExactly("audit_blob");
    }
}
