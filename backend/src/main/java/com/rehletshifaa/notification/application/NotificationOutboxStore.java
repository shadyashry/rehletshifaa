package com.rehletshifaa.notification.application;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

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
    /** How long a claimed message stays invisible. A process that dies mid-send releases it by expiry. */
    private static final long LEASE_SECONDS = 300;
    private static final long MAX_BACKOFF_SECONDS = 3600;

    private final JdbcClient jdbc;
    private final Clock clock;

    public NotificationOutboxStore(JdbcClient jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }

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
        List<OutboxMessage> due = jdbc.sql("SELECT id,channel,destination,template_key,template_data,attempts,max_attempts,idempotency_key "
                        + "FROM notification_outbox WHERE status IN ('PENDING','RETRY','PROCESSING') AND next_attempt_at<=? "
                        + "ORDER BY created_at LIMIT " + batchSize + " FOR UPDATE SKIP LOCKED")
                .param(timestamp(now)).query(this::map).list();
        for (OutboxMessage message : due)
            jdbc.sql("UPDATE notification_outbox SET status='PROCESSING',attempts=attempts+1,next_attempt_at=? WHERE id=?")
                    .params(timestamp(now.plusSeconds(LEASE_SECONDS)), message.id()).update();
        return due;
    }

    /** Delivered: the template data is dropped with the record, since it holds patient-identifying text. */
    @Transactional
    public void recordDelivered(UUID id, String providerReference) {
        jdbc.sql("UPDATE notification_outbox SET status='DELIVERED',provider_reference=?,delivered_at=?,last_error_code=NULL,template_data='{}' WHERE id=?")
                .params(providerReference, timestamp(clock.instant()), id).update();
    }

    /** Not delivered: schedule the next attempt, or park the message once it has used up its attempts. */
    @Transactional
    public void recordFailure(UUID id, int attempts, int maxAttempts, String errorCode) {
        String status = attempts >= maxAttempts ? "DEAD_LETTER" : "RETRY";
        long delay = Math.min(MAX_BACKOFF_SECONDS, 30L * (1L << Math.min(attempts, 6)));
        jdbc.sql("UPDATE notification_outbox SET status=?,next_attempt_at=?,last_error_code=? WHERE id=?")
                .params(status, timestamp(clock.instant().plusSeconds(delay)), errorCode, id).update();
    }

    private OutboxMessage map(ResultSet rs, int rowNumber) throws SQLException {
        return new OutboxMessage(rs.getObject("id", UUID.class), rs.getString("channel"), rs.getString("destination"),
                rs.getString("template_key"), rs.getString("template_data"), rs.getInt("attempts") + 1,
                rs.getInt("max_attempts"), rs.getString("idempotency_key"));
    }

    /** A claimed message. {@code attempts} is the count including the attempt being made now. */
    public record OutboxMessage(UUID id, String channel, String destination, String templateKey, String templateData,
                                int attempts, int maxAttempts, String idempotencyKey) {}
}
