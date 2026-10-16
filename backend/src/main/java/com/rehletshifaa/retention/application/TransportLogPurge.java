package com.rehletshifaa.retention.application;

import com.rehletshifaa.notification.infrastructure.WhatsAppDeliveryEventRepository;
import com.rehletshifaa.notification.infrastructure.WhatsAppInboundMessageRepository;
import com.rehletshifaa.retention.domain.RecordClass;
import com.rehletshifaa.retention.domain.RetentionPolicy;
import com.rehletshifaa.retention.domain.RetentionPurge;
import com.rehletshifaa.retention.infrastructure.RetentionPurgeRepository;
import com.rehletshifaa.shared.audit.AuditTrail;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * P1-7 (TRANSPORT_LOG): the WhatsApp inbound queue keeps the sender's digits in plaintext (the reply address while the message is
 * processed); once processed, the row is a transport copy of what the case or conversation now holds. Processed rows and delivery
 * receipts older than the policy's days go in one statement each; rows still in flight never do. One log row and one audit row per
 * batch that removed anything.
 */
@Component
public class TransportLogPurge {
    private final WhatsAppInboundMessageRepository inbound;
    private final WhatsAppDeliveryEventRepository receipts;
    private final RetentionPurgeRepository purges;
    private final AuditTrail auditTrail;
    private final Clock clock;

    public TransportLogPurge(WhatsAppInboundMessageRepository inbound, WhatsAppDeliveryEventRepository receipts, RetentionPurgeRepository purges,
                             AuditTrail auditTrail, Clock clock) {
        this.inbound = inbound; this.receipts = receipts; this.purges = purges; this.auditTrail = auditTrail; this.clock = clock;
    }

    @Transactional
    public Optional<RetentionPurge> purge(RetentionPolicy policy) {
        if (policy.getRecordClass() != RecordClass.TRANSPORT_LOG || !policy.purgeable()) throw new IllegalStateException("Transport purge is not allowed now");
        Instant now = clock.instant();
        Instant cutoff = now.minus(Duration.ofDays(policy.getRetentionDays()));
        int rows = inbound.deleteProcessedBefore(cutoff) + receipts.deleteReceivedBefore(cutoff);
        if (rows == 0) return Optional.empty();
        RetentionPurge row = purges.save(new RetentionPurge(RecordClass.TRANSPORT_LOG, RetentionPurge.SubjectType.TRANSPORT_BATCH, null,
                RetentionPurge.Cause.SCHEDULE, policy.getRetentionDays(), rows, 0, 0, "SYSTEM", null, now));
        auditTrail.event("RECORD_PURGED").actor("SYSTEM", "RETENTION").entity("RetentionPurge", row.getId()).action("PURGE")
                .reason(RecordClass.TRANSPORT_LOG.name() + " rows=" + rows).at(now).record();
        return Optional.of(row);
    }
}
