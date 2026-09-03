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
 * Verifies V6 migrates representative legacy case statuses to their canonical equivalents and then
 * tightens the constraint — i.e. existing production/development rows are preserved, not dropped.
 */
class LegacyStatusMigrationTest {

    private DataSource dataSource(String name) {
        return new DriverManagerDataSource("jdbc:h2:mem:" + name + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH", "sa", "");
    }

    private void insertLegacyCase(JdbcTemplate jdbc, String number, String status) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("INSERT INTO medical_cases(id,case_number,full_name,country,whatsapp_number,preferred_language,status,consent_timestamp,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?,?,?,?,0)",
            UUID.randomUUID(), number, "Legacy Patient", "Kenya", "+254700000099", "en", status, now, now, now);
    }

    @Test void migratesLegacyStatusesAndTightensConstraint() {
        DataSource ds = dataSource("legacymig" + System.nanoTime());
        JdbcTemplate jdbc = new JdbcTemplate(ds);

        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("5").load().migrate();
        insertLegacyCase(jdbc, "RS-2020-000001", "NEW");
        insertLegacyCase(jdbc, "RS-2020-000002", "COORDINATOR_REVIEW");
        insertLegacyCase(jdbc, "RS-2020-000003", "RECOMMENDATION_READY");
        insertLegacyCase(jdbc, "RS-2020-000004", "TREATMENT_COORDINATION");
        insertLegacyCase(jdbc, "RS-2020-000005", "PROPOSAL_READY");
        insertLegacyCase(jdbc, "RS-2020-000006", "CLAIM_PENDING");

        Flyway.configure().dataSource(ds).locations("classpath:db/migration").load().migrate();

        assertThat(status(jdbc, "RS-2020-000001")).isEqualTo("RECEIVED");
        assertThat(status(jdbc, "RS-2020-000002")).isEqualTo("INTAKE_REVIEW");
        assertThat(status(jdbc, "RS-2020-000003")).isEqualTo("CLINICAL_RECOMMENDATION_READY");
        assertThat(status(jdbc, "RS-2020-000004")).isEqualTo("TRAVEL_COORDINATION");
        assertThat(status(jdbc, "RS-2020-000005")).isEqualTo("PATIENT_DECISION");
        assertThat(status(jdbc, "RS-2020-000006")).isEqualTo("RECEIVED");
        // No case retains a legacy value.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM medical_cases WHERE status IN ('NEW','COORDINATOR_REVIEW','RECOMMENDATION_READY','TREATMENT_COORDINATION','PROPOSAL_READY','CLAIM_PENDING')", Integer.class)).isZero();
        // The tightened constraint now rejects a legacy value.
        assertThatThrownBy(() -> insertLegacyCase(jdbc, "RS-2020-000007", "NEW")).hasMessageContaining("ck_case_status");
    }

    private String status(JdbcTemplate jdbc, String number) {
        return jdbc.queryForObject("SELECT status FROM medical_cases WHERE case_number=?", String.class, number);
    }
}
