package com.rehletshifaa.journey.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * Consultant credential lifecycle in time: a verified credential expires at its expiry instant, a Consultant with no
 * valid verified credential left is no longer verified (and is unavailable), and renewal reminders go out ahead of expiry.
 */
@Service
public class CredentialExpiryService {
    private final JdbcClient jdbc;
    private final Clock clock;
    private final com.rehletshifaa.shared.crypto.CryptoService crypto;
    private final List<Integer> reminderDays;

    public CredentialExpiryService(JdbcClient jdbc, Clock clock, com.rehletshifaa.shared.crypto.CryptoService crypto,
            @Value("${app.credentials.reminder-days:30,7,1}") List<Integer> reminderDays) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.crypto = crypto;
        this.reminderDays = reminderDays.stream().filter(days->days>0).distinct().sorted(java.util.Comparator.reverseOrder()).toList();
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
        for (int days : reminderDays) enqueueReminders(now, days);
    }

    private void enqueueReminders(Instant now, int days) {
        Instant boundary = now.plus(Duration.ofDays(days));
        var due = jdbc.sql("SELECT c.id,c.expires_at,p.email_encrypted FROM practitioner_credentials c JOIN practitioner_profiles p ON p.id=c.practitioner_id WHERE c.status='VERIFIED' AND c.expires_at>? AND c.expires_at<=? AND p.email_encrypted IS NOT NULL")
                .params(timestamp(now), timestamp(boundary)).query((r, n) -> new Reminder(r.getObject(1, UUID.class), r.getTimestamp(2).toInstant(), r.getString(3))).list();
        for (var value : due) {
            String key = "credential-expiry-reminder:" + value.credentialId() + ":" + value.expiresAt() + ":" + days;
            jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) SELECT ?,'CONSULTANT_CREDENTIAL','EMAIL',?,'consultant-credential-expiry',?,'PENDING',0,5,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
                    .params(UUID.randomUUID(), crypto.decrypt(value.encryptedEmail()), "enc:" + crypto.encrypt("{\"days\":\"" + days + "\"}"), timestamp(now), key, timestamp(now), key).update();
        }
    }

    private record Reminder(UUID credentialId, Instant expiresAt, String encryptedEmail) {}
}
