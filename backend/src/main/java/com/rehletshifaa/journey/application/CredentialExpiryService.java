package com.rehletshifaa.journey.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class CredentialExpiryService {
    private final JdbcClient jdbc;
    private final Clock clock;

    public CredentialExpiryService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.credentials.expiry-scan-ms:3600000}")
    @Transactional
    public void expireCredentials() {
        Instant now = clock.instant();
        jdbc.sql("UPDATE practitioner_credentials SET status='EXPIRED' WHERE status='VERIFIED' AND expires_at IS NOT NULL AND expires_at<=?")
            .param(timestamp(now)).update();

        List<UUID> profiles = jdbc.sql("SELECT p.id FROM practitioner_profiles p WHERE p.credentialing_status='VERIFIED' AND NOT EXISTS (SELECT 1 FROM practitioner_credentials pc WHERE pc.practitioner_id=p.id AND pc.status='VERIFIED' AND (pc.expires_at IS NULL OR pc.expires_at>?))")
            .param(timestamp(now)).query(UUID.class).list();
        for (UUID practitionerId : profiles) {
            int changed = jdbc.sql("UPDATE practitioner_profiles SET credentialing_status='EXPIRED',availability_status='UNAVAILABLE',updated_at=?,version=version+1 WHERE id=? AND credentialing_status='VERIFIED'")
                .params(timestamp(now), practitionerId).update();
            if (changed == 1) {
                jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(),"PRACTITIONER_CREDENTIALS_EXPIRED","SYSTEM","SYSTEM","Practitioner",practitionerId.toString(),"EXPIRE","SUCCESS",timestamp(now)).update();
            }
        }
    }
}
