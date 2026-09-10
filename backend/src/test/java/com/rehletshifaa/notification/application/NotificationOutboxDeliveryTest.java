package com.rehletshifaa.notification.application;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The outbox exists so a business transaction can promise a message without sending one. That promise
 * only holds if delivery happens outside the transaction — deliberately not annotated {@code @Transactional}
 * here, so every store call commits exactly as it does in production.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
class NotificationOutboxDeliveryTest {

    @Autowired NotificationOutboxStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired Clock clock;

    @AfterEach void clear() { jdbc.update("DELETE FROM notification_outbox WHERE idempotency_key LIKE 'outbox-test:%'"); }

    @Test void claimingLeasesTheMessageSoAConcurrentWorkerCannotSendItTwice() {
        UUID id = seed("outbox-test:lease", 0, 5, clock.instant().minusSeconds(1));

        List<NotificationOutboxStore.OutboxMessage> first = store.claim(10);
        assertThat(first).extracting(NotificationOutboxStore.OutboxMessage::id).contains(id);

        // The lease is committed by claim(), not held open until delivery finishes.
        assertThat(status(id)).isEqualTo("PROCESSING");
        assertThat(attempts(id)).isEqualTo(1);
        assertThat(store.claim(10)).extracting(NotificationOutboxStore.OutboxMessage::id).doesNotContain(id);
    }

    @Test void deliveryIsRecordedAndTheMessageBodyIsDropped() {
        UUID id = seed("outbox-test:sent", 0, 5, clock.instant().minusSeconds(1));
        store.claim(10);

        store.recordDelivered(id, "provider-ref-1");

        assertThat(status(id)).isEqualTo("DELIVERED");
        assertThat(jdbc.queryForObject("SELECT provider_reference FROM notification_outbox WHERE id=?", String.class, id)).isEqualTo("provider-ref-1");
        // Rendered template data holds patient-identifying text; it must not outlive delivery.
        assertThat(jdbc.queryForObject("SELECT template_data FROM notification_outbox WHERE id=?", String.class, id)).isEqualTo("{}");
        assertThat(store.claim(10)).extracting(NotificationOutboxStore.OutboxMessage::id).doesNotContain(id);
    }

    @Test void aFailedAttemptIsRescheduledWithBackoffAndStaysRetryable() {
        UUID id = seed("outbox-test:retry", 0, 5, clock.instant().minusSeconds(1));
        var claimed = store.claim(10).stream().filter(m -> m.id().equals(id)).findFirst().orElseThrow();

        store.recordFailure(id, claimed.attempts(), claimed.maxAttempts(), "PROVIDER_FAILURE");

        assertThat(status(id)).isEqualTo("RETRY");
        assertThat(attempts(id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT last_error_code FROM notification_outbox WHERE id=?", String.class, id)).isEqualTo("PROVIDER_FAILURE");
        assertThat(nextAttempt(id)).isAfter(clock.instant()); // not retried in a tight loop
    }

    @Test void aMessageThatHasUsedItsAttemptsIsParkedRatherThanRetriedForever() {
        UUID id = seed("outbox-test:dead", 4, 5, clock.instant().minusSeconds(1));
        var claimed = store.claim(10).stream().filter(m -> m.id().equals(id)).findFirst().orElseThrow();
        assertThat(claimed.attempts()).isEqualTo(5);

        store.recordFailure(id, claimed.attempts(), claimed.maxAttempts(), "PROVIDER_FAILURE");

        assertThat(status(id)).isEqualTo("DEAD_LETTER");
        assertThat(store.claim(10)).extracting(NotificationOutboxStore.OutboxMessage::id).doesNotContain(id);
    }

    @Test void aMessageStrandedByACrashedWorkerIsReclaimedWhenItsLeaseExpires() {
        // A process that died between claim and record leaves the row PROCESSING with a stale lease.
        UUID id = seed("outbox-test:stranded", 1, 5, clock.instant().minusSeconds(1));
        jdbc.update("UPDATE notification_outbox SET status='PROCESSING' WHERE id=?", id);

        assertThat(store.claim(10)).extracting(NotificationOutboxStore.OutboxMessage::id).contains(id);
        assertThat(attempts(id)).isEqualTo(2); // the lost attempt still counts against max_attempts
    }

    private UUID seed(String key, int attempts, int maxAttempts, Instant nextAttemptAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO notification_outbox(id,notification_type,channel,destination,template_key,template_data,status,attempts,max_attempts,next_attempt_at,idempotency_key,created_at) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                id, "TEST", "EMAIL", "someone@local.test", "new-case-received", "{\"lang\":\"en\"}", "PENDING",
                attempts, maxAttempts, java.sql.Timestamp.from(nextAttemptAt), key, java.sql.Timestamp.from(clock.instant()));
        return id;
    }

    private String status(UUID id) { return jdbc.queryForObject("SELECT status FROM notification_outbox WHERE id=?", String.class, id); }
    private int attempts(UUID id) { return jdbc.queryForObject("SELECT attempts FROM notification_outbox WHERE id=?", Integer.class, id); }
    private Instant nextAttempt(UUID id) { return jdbc.queryForObject("SELECT next_attempt_at FROM notification_outbox WHERE id=?", java.sql.Timestamp.class, id).toInstant(); }
}
