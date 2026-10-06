package com.rehletshifaa.notification.application;

import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.rehletshifaa.notification.domain.QueuedNotification;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Persistence for the notification outbox, deliberately separate from the dispatcher.
 *
 * <p>The split exists for correctness, not tidiness: sending happens over the network, and a message
 * that has left the building must never be un-sent by a database rollback. Claiming, recording success
 * and recording failure are therefore three short transactions with the provider call in between —
 * which is only possible if the dispatcher calls them through the proxy on a different bean.
 */
@Service
public class NotificationOutboxStore {
    private static final Logger log = LoggerFactory.getLogger(NotificationOutboxStore.class);
    /** How long a claimed message stays invisible. A process that dies mid-send releases it by expiry. */
    static final long LEASE_SECONDS = 300;
    private static final long MAX_BACKOFF_SECONDS = 3600;

    private final QueuedNotificationRepository messages;
    private final Clock clock;
    private final MeterRegistry metrics;

    public NotificationOutboxStore(QueuedNotificationRepository messages, Clock clock, MeterRegistry metrics) { this.messages = messages; this.clock = clock; this.metrics = metrics; }

    /**
     * Take ownership of the next due messages and lease them so no other instance picks them up.
     *
     * <p>{@code attempts} is incremented here rather than on failure, so an attempt that crashes after
     * the provider call still counts against {@code max_attempts} and cannot be retried forever.
     * Expired {@code PROCESSING} rows are re-claimable, which is what makes a crash recoverable.
     */
    @Transactional
    public List<OutboxMessage> claim(int batchSize) {
        Instant now = clock.instant();
        // A worker can die after its final provider attempt but before recording the outcome. Once that
        // lease expires there is no safe retry budget left, so park it instead of reclaiming it forever.
        int stranded = messages.parkStranded(micros(now));
        if (stranded > 0) {
            metrics.counter("notification.delivery", "channel", "ANY", "outcome", "dead_letter_unknown_outcome").increment(stranded);
            log.warn("Notification outbox parked {} message(s) whose final attempt ended with an unknown outcome", stranded);
        }
        List<OutboxMessage> due = messages.lockDue(micros(now), Limit.of(batchSize)).stream().map(NotificationOutboxStore::message).toList();
        Instant leaseExpiresAt = now.plusSeconds(LEASE_SECONDS);
        for (OutboxMessage message : due) messages.lease(message.id(), micros(leaseExpiresAt));
        return due.stream().map(m -> m.leasedUntil(leaseExpiresAt)).toList();
    }

    /**
     * Hand back a claimed message that was never offered to a provider (lease nearly spent, or the process is
     * shutting down): it is due again immediately and the attempt it never made is not charged.
     */
    @Transactional
    public boolean release(UUID id, int attempt) {
        return messages.release(id, attempt, micros(clock.instant())) == 1;
    }

    /** Delivered: the template data is dropped with the record, since it holds patient-identifying text. */
    @Transactional
    public boolean recordDelivered(UUID id, int attempt, String providerReference) {
        return messages.delivered(id, attempt, providerReference, micros(clock.instant())) == 1;
    }

    /** Not delivered: schedule the next attempt, or park the message once it has used up its attempts. */
    @Transactional
    public boolean recordFailure(UUID id, int attempts, int maxAttempts, String errorCode) {
        String status = attempts >= maxAttempts ? "DEAD_LETTER" : "RETRY";
        long delay = Math.min(MAX_BACKOFF_SECONDS, 30L * (1L << Math.min(attempts, 6)));
        return messages.failed(id, attempts, status, micros(clock.instant().plusSeconds(delay)), errorCode) == 1;
    }

    /** {@code attempts} of a claimed message includes the attempt about to be made. */
    private static OutboxMessage message(QueuedNotification m) {
        return new OutboxMessage(m.getId(), m.getChannel(), m.getDestination(), m.getTemplateKey(), m.getTemplateData(),
                m.getAttempts() + 1, m.getMaxAttempts(), m.getIdempotencyKey(), null);
    }

    /**
     * A claimed message. {@code attempts} is the count including the attempt being made now. After
     * {@code leaseExpiresAt} another worker may reclaim it, so no provider call may start that late.
     */
    public record OutboxMessage(UUID id, String channel, String destination, String templateKey, String templateData,
                                int attempts, int maxAttempts, String idempotencyKey, Instant leaseExpiresAt) {
        OutboxMessage leasedUntil(Instant expiry) {
            return new OutboxMessage(id, channel, destination, templateKey, templateData, attempts, maxAttempts, idempotencyKey, expiry);
        }
    }
}
