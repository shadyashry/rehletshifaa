package com.rehletshifaa.clinic;

import com.rehletshifaa.clinic.application.ConsultantAffiliationService;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** Test data for the clinic module. */
public final class ClinicTestData {
    private ClinicTestData() {}

    /**
     * P1-19 (D-H): a current affiliation declaration (no facility lines) for every consultant who has none, so fixtures that insert
     * consultants directly stay eligible. Tests of the declaration itself file it through {@link ConsultantAffiliationService}.
     */
    public static void declareAll(JdbcTemplate jdbc) {
        Instant now = Instant.now();
        for (UUID id : jdbc.queryForList("""
                SELECT p.id FROM practitioner_profiles p WHERE p.practitioner_type = 'CONSULTANT' AND NOT EXISTS (SELECT 1 FROM affiliation_declarations d
                WHERE d.practitioner_id = p.id AND d.superseded_at IS NULL AND d.valid_until > ?)""", UUID.class, Timestamp.from(now)))
            declare(jdbc, id);
    }

    /** One current declaration for the practitioner, filed a minute ago, valid for a year. */
    public static UUID declare(JdbcTemplate jdbc, UUID practitionerId) {
        UUID id = UUID.randomUUID();
        Instant at = Instant.now().minusSeconds(60);
        jdbc.update("""
                INSERT INTO affiliation_declarations(id,practitioner_id,declared_by,declared_at,valid_until,attestation_version,review_status,version)
                VALUES(?,?,?,?,?,?,'PENDING',0)""", id, practitionerId, "fixture", Timestamp.from(at), Timestamp.from(at.plus(365, ChronoUnit.DAYS)),
                ConsultantAffiliationService.ATTESTATION_VERSION);
        return id;
    }
}
