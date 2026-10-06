package com.rehletshifaa.journey.application;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

import com.rehletshifaa.directory.infrastructure.PractitionerCredentialRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.notification.application.NotificationOutbox;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;


/**
 * Consultant credential lifecycle in time: a verified credential expires at its expiry instant, a Consultant with no
 * valid verified credential left is no longer verified (and is unavailable), and renewal reminders go out ahead of expiry.
 */
@Service
public class CredentialExpiryService {
    private final PractitionerCredentialRepository credentials;
    private final PractitionerProfileRepository practitioners;
    private final NotificationOutbox notificationOutbox;
    private final AuditTrail auditTrail;
    private final Clock clock;
    private final com.rehletshifaa.shared.crypto.CryptoService crypto;
    private final List<Integer> reminderDays;

    public CredentialExpiryService(Clock clock, com.rehletshifaa.shared.crypto.CryptoService crypto,
            @Value("${app.credentials.reminder-days:30,7,1}") List<Integer> reminderDays, AuditTrail auditTrail, NotificationOutbox notificationOutbox, PractitionerProfileRepository practitioners, PractitionerCredentialRepository credentials) { this.credentials = credentials; this.practitioners = practitioners; this.notificationOutbox = notificationOutbox; this.auditTrail = auditTrail;
        this.clock = clock;
        this.crypto = crypto;
        this.reminderDays = reminderDays.stream().filter(days->days>0).distinct().sorted(java.util.Comparator.reverseOrder()).toList();
    }

    @Scheduled(fixedDelayString = "${app.credentials.expiry-scan-ms:3600000}")
    @Transactional
    public void expireCredentials() {
        Instant now = clock.instant();
        credentials.expireLapsed(micros(now));

        List<UUID> profiles = practitioners.findVerifiedWithoutCurrentCredential(micros(now));
        for (UUID practitionerId : profiles) {
            int changed = practitioners.expireCredentialing(practitionerId, micros(now));
            if (changed == 1) {
                auditTrail.event("PRACTITIONER_CREDENTIALS_EXPIRED").actor("SYSTEM", "SYSTEM").entity("Practitioner", practitionerId).action("EXPIRE").at(now).record();
            }
        }
        for (int days : reminderDays) enqueueReminders(now, days);
    }

    private void enqueueReminders(Instant now, int days) {
        Instant boundary = now.plus(Duration.ofDays(days));
        var due = credentials.findExpiringWithEmail(micros(now), micros(boundary)).stream()
                .map(c -> new Reminder(c.getCredentialId(), c.getExpiresAt(), c.getEmailEncrypted())).toList();
        for (var value : due) {
            String key = "credential-expiry-reminder:" + value.credentialId() + ":" + value.expiresAt() + ":" + days;
            notificationOutbox.enqueueOnce("CONSULTANT_CREDENTIAL", "EMAIL", crypto.decrypt(value.encryptedEmail()), "consultant-credential-expiry", "enc:" + crypto.encrypt("{\"days\":\"" + days + "\"}"), key, now);
        }
    }

    private record Reminder(UUID credentialId, Instant expiresAt, String encryptedEmail) {}
}
