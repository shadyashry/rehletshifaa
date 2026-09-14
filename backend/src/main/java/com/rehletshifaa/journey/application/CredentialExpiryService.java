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
        jdbc.sql("UPDATE practitioner_credentials SET status='EXPIRED' WHERE status='VERIFIED' AND expires_at IS NOT NULL AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM clinician_onboardings o WHERE o.practitioner_id=practitioner_credentials.practitioner_id AND o.credential_policy_cutover_at IS NOT NULL)")
            .param(timestamp(now)).update();

        List<UUID> profiles = jdbc.sql("SELECT p.id FROM practitioner_profiles p WHERE p.credentialing_status='VERIFIED' AND NOT EXISTS(SELECT 1 FROM clinician_onboardings o WHERE o.practitioner_id=p.id AND o.credential_policy_cutover_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM practitioner_credentials pc WHERE pc.practitioner_id=p.id AND pc.status='VERIFIED' AND (pc.expires_at IS NULL OR pc.expires_at>?))")
            .param(timestamp(now)).query(UUID.class).list();
        for (UUID practitionerId : profiles) {
            int changed = jdbc.sql("UPDATE practitioner_profiles SET credentialing_status='EXPIRED',availability_status='UNAVAILABLE',updated_at=?,version=version+1 WHERE id=? AND credentialing_status='VERIFIED'")
                .params(timestamp(now), practitionerId).update();
            if (changed == 1) {
                jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)")
                    .params(UUID.randomUUID(),"PRACTITIONER_CREDENTIALS_EXPIRED","SYSTEM","SYSTEM","Practitioner",practitionerId.toString(),"EXPIRE","SUCCESS",timestamp(now)).update();
            }
        }
        reconcileProviderCredentials(now);
    }

    private void reconcileProviderCredentials(Instant now) {
        var expired = jdbc.sql("SELECT r.id,d.organization_id,d.practitioner_id,r.expires_at FROM provider_credential_revisions r JOIN provider_credential_dossiers d ON d.id=r.dossier_id WHERE r.status='VERIFIED' AND r.expires_at IS NOT NULL AND r.expires_at<=?")
                .param(timestamp(now)).query((r,n)->new ProviderExpiry(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getObject(3,UUID.class),r.getTimestamp(4).toInstant())).list();
        for(var value:expired) {
            String key="credential-expired:"+value.revisionId()+":"+value.expiresAt();
            int inserted=jdbc.sql("INSERT INTO provider_domain_events(id,organization_id,aggregate_type,aggregate_id,event_type,event_key,actor_subject,occurred_at) SELECT ?,?,'CREDENTIAL_REVISION',?,'CREDENTIAL_EXPIRED',?,'SYSTEM',? WHERE NOT EXISTS(SELECT 1 FROM provider_domain_events WHERE event_key=?)")
                    .params(UUID.randomUUID(),value.organizationId(),value.revisionId().toString(),key,timestamp(now),key).update();
            if(inserted==1) jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,'PROVIDER_CREDENTIAL_EXPIRED','SYSTEM','SYSTEM','CredentialRevision',?,'EXPIRE','SUCCESS',?,?)")
                    .params(UUID.randomUUID(),value.revisionId().toString(),"organization="+value.organizationId()+"; practitioner="+value.practitionerId(),timestamp(now)).update();
        }
        for(int days:reminderDays) enqueueReminders(now,days);
    }

    private void enqueueReminders(Instant now,int days) {
        Instant boundary=now.plus(Duration.ofDays(days));
        var due=jdbc.sql("SELECT r.id,r.expires_at,p.email_encrypted FROM provider_credential_revisions r JOIN provider_credential_dossiers d ON d.id=r.dossier_id JOIN practitioner_profiles p ON p.id=d.practitioner_id WHERE r.status='VERIFIED' AND d.status='VERIFIED' AND r.expires_at>? AND r.expires_at<=? AND p.email_encrypted IS NOT NULL")
                .params(timestamp(now),timestamp(boundary)).query((r,n)->new Reminder(r.getObject(1,UUID.class),r.getTimestamp(2).toInstant(),r.getString(3))).list();
        for(var value:due) {
            String key="credential-expiry-reminder:"+value.revisionId()+":"+value.expiresAt()+":"+days;
            jdbc.sql("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) SELECT ?,'PROVIDER_CREDENTIAL','EMAIL',?,'provider-credential-expiry',?,'PENDING',0,5,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notification_outbox WHERE idempotency_key=?)")
                    .params(UUID.randomUUID(),crypto.decrypt(value.encryptedEmail()),"enc:"+crypto.encrypt("{\"days\":\""+days+"\"}"),timestamp(now),key,timestamp(now),key).update();
        }
    }

    private record ProviderExpiry(UUID revisionId,UUID organizationId,UUID practitionerId,Instant expiresAt){}
    private record Reminder(UUID revisionId,Instant expiresAt,String encryptedEmail){}
}
