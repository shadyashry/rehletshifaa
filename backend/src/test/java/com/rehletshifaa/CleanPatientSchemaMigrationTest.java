package com.rehletshifaa;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * V73 refuses pre-production rows that would need interpretation (a case without a canonical patient or submission
 * contact, a patient number whose owner was never clarified) instead of mutating them, and on clean data leaves the
 * final schema: no plaintext name/number copies on the case row, no mobile-owner column, no claim challenges.
 */
class CleanPatientSchemaMigrationTest {
    private final OffsetDateTime now = OffsetDateTime.now();

    private DataSource dataSource() {
        return new DriverManagerDataSource("jdbc:h2:mem:cl4mig" + System.nanoTime()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH", "sa", "");
    }

    private Flyway flyway(DataSource ds, String target) {
        var config = Flyway.configure().dataSource(ds).locations("classpath:db/migration");
        return (target == null ? config : config.target(target)).load();
    }

    private UUID patient(JdbcTemplate jdbc, String whatsapp, String mobileOwner) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO patient_profiles(id,given_name,country,whatsapp_number,mobile_owner,preferred_language,created_at,updated_at,version) "
                + "VALUES(?,'Patient','Kenya',?,?,'en',?,?,0)", id, whatsapp, mobileOwner, now, now);
        return id;
    }

    private UUID medicalCase(JdbcTemplate jdbc, UUID patient, boolean withContact) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO medical_cases(id,case_number,full_name,country,whatsapp_number,preferred_language,status,consent_timestamp,created_at,updated_at,version,patient_id) "
                + "VALUES(?,?,'Patient','Kenya','+254700000001','en','RECEIVED',?,?,?,0,?)", id, "RS-" + id.toString().substring(0, 8), now, now, now, patient);
        if (withContact)
            jdbc.update("INSERT INTO case_submission_contacts(id,case_id,patient_id,contact_role,whatsapp_number,created_at) VALUES(?,?,?,'PATIENT','+254700000001',?)",
                    UUID.randomUUID(), id, patient, now);
        return id;
    }

    @Test void refusesACaseWithoutACanonicalPatient() {
        DataSource ds = dataSource(); JdbcTemplate jdbc = new JdbcTemplate(ds);
        flyway(ds, "72").migrate();
        medicalCase(jdbc, null, false);
        assertThatThrownBy(() -> flyway(ds, null).migrate()).hasStackTraceContaining("Cases without a canonical patient exist");
    }

    @Test void refusesACaseWithoutASubmissionContact() {
        DataSource ds = dataSource(); JdbcTemplate jdbc = new JdbcTemplate(ds);
        flyway(ds, "72").migrate();
        medicalCase(jdbc, patient(jdbc, "+254700000001", "PATIENT"), false);
        assertThatThrownBy(() -> flyway(ds, null).migrate()).hasStackTraceContaining("Cases without a submission contact exist");
    }

    @Test void refusesAPatientNumberWhoseOwnerWasNeverClarified() {
        DataSource ds = dataSource(); JdbcTemplate jdbc = new JdbcTemplate(ds);
        flyway(ds, "72").migrate();
        patient(jdbc, "+254700000002", null);
        assertThatThrownBy(() -> flyway(ds, null).migrate()).hasStackTraceContaining("unclarified or representative owner");
    }

    @Test void cleanDataReachesTheFinalSchema() {
        DataSource ds = dataSource(); JdbcTemplate jdbc = new JdbcTemplate(ds);
        flyway(ds, "72").migrate();
        UUID caseId = medicalCase(jdbc, patient(jdbc, "+254700000001", "PATIENT"), true);
        patient(jdbc, null, null);
        flyway(ds, null).migrate();

        assertThat(columns(jdbc, "medical_cases")).doesNotContain("full_name", "whatsapp_number");
        assertThat(columns(jdbc, "patient_profiles")).doesNotContain("mobile_owner");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name)='case_claim_challenges'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM medical_cases WHERE id=?", Integer.class, caseId)).isOne();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO medical_cases(id,case_number,country,preferred_language,status,consent_timestamp,created_at,updated_at,version) "
                + "VALUES(?,'RS-NOPATIENT','Kenya','en','DRAFT',?,?,?,0)", UUID.randomUUID(), now, now, now)).hasMessageContaining("patient_id");
    }

    private java.util.List<String> columns(JdbcTemplate jdbc, String table) {
        return jdbc.queryForList("SELECT LOWER(column_name) FROM information_schema.columns WHERE LOWER(table_name)=?", String.class, table);
    }
}
