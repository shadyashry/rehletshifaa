package com.rehletshifaa.facility;

import com.rehletshifaa.facility.application.FacilityAccreditationExpiryService;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The facility accreditation expiry job: lapsed records expire, the derived state follows, reminders go out once. */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class FacilityAccreditationExpiryServiceTest {
    @Autowired FacilityAccreditationExpiryService expiry;
    @Autowired JdbcTemplate jdbc;
    @Autowired CryptoService crypto;

    @Test void lapsedAccreditationExpiresAndFacilityBecomesExpired() {
        UUID facilityId = facility("ops@lapsed.test");
        UUID accreditationId = accreditation(facilityId, today().minusDays(1));
        expiry.expireAccreditations();
        assertThat(jdbc.queryForObject("SELECT status FROM facility_accreditations WHERE id=?", String.class, accreditationId)).isEqualTo("EXPIRED");
        assertThat(accreditationStatus(facilityId)).isEqualTo("EXPIRED");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='FACILITY_ACCREDITATION_LAPSED' AND entity_type='Facility' AND entity_id=?", facilityId.toString())).isEqualTo(1);
    }

    @Test void facilityWithAnotherCurrentAccreditationStaysCurrent() {
        UUID facilityId = facility("ops@mixed.test");
        UUID lapsed = accreditation(facilityId, today().minusDays(1));
        accreditation(facilityId, today().plusDays(200));
        expiry.expireAccreditations();
        assertThat(jdbc.queryForObject("SELECT status FROM facility_accreditations WHERE id=?", String.class, lapsed)).isEqualTo("EXPIRED");
        assertThat(accreditationStatus(facilityId)).isEqualTo("CURRENT");
        assertThat(count("SELECT count(*) FROM audit_events WHERE event_type='FACILITY_ACCREDITATION_LAPSED' AND entity_id=?", facilityId.toString())).isZero();
    }

    @Test void remindersGoOutOncePerWindowToTheFacilityContact() {
        UUID facilityId = facility("ops@reminder.test");
        UUID accreditationId = accreditation(facilityId, today().plusDays(20));
        expiry.expireAccreditations();
        expiry.expireAccreditations();
        String like = "facility-accreditation-reminder:" + accreditationId + ":%";
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE template_key='facility-accreditation-expiry' AND idempotency_key LIKE ?", like)).isEqualTo(2);
        List<String> keys = jdbc.queryForList("SELECT idempotency_key FROM notification_outbox WHERE idempotency_key LIKE ? ORDER BY idempotency_key", String.class, like);
        assertThat(keys).allMatch(key -> key.endsWith(":60") || key.endsWith(":30")).noneMatch(key -> key.endsWith(":7"));
        assertThat(jdbc.queryForList("SELECT destination FROM notification_outbox WHERE idempotency_key LIKE ?", String.class, like)).containsOnly("ops@reminder.test");
        String stored = jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE idempotency_key LIKE ? AND idempotency_key LIKE '%:30'", String.class, like);
        assertThat(stored).startsWith("enc:");
        assertThat(crypto.decrypt(stored.substring(4))).contains("\"days\":\"30\"").contains("\"body\":\"JCI\"");
    }

    @Test void facilityWithoutContactEmailGetsNoReminder() {
        UUID facilityId = facility(null);
        UUID accreditationId = accreditation(facilityId, today().plusDays(20));
        expiry.expireAccreditations();
        assertThat(count("SELECT count(*) FROM notification_outbox WHERE idempotency_key LIKE ?", "facility-accreditation-reminder:" + accreditationId + ":%")).isZero();
    }

    private static LocalDate today() { return LocalDate.now(ZoneOffset.UTC); }

    private UUID facility(String contactEmail) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO facilities(id,name,city,kind,status,accreditation_status,contact_email,settlement_terms,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                id, "Facility " + id, "Cairo", "HOSPITAL", "ACTIVE", "CURRENT", contactEmail, "NET_30", "ops-subject", now, "ops-subject", now);
        return id;
    }

    private UUID accreditation(UUID facilityId, LocalDate expiresOn) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO facility_accreditations(id,facility_id,body,expires_on,status,recorded_by,created_at) VALUES(?,?,?,?,?,?,?)",
                id, facilityId, "JCI", expiresOn, "CURRENT", "ops-subject", Instant.now());
        return id;
    }

    private String accreditationStatus(UUID facilityId) {
        return jdbc.queryForObject("SELECT accreditation_status FROM facilities WHERE id=?", String.class, facilityId);
    }

    private int count(String sql, Object... args) { Integer n = jdbc.queryForObject(sql, Integer.class, args); return n == null ? 0 : n; }
}
