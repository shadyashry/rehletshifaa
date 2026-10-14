package com.rehletshifaa.notification.application;

import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P1-8 (E-05): the outbox gauges per channel count dead letters, retries and waiting messages, and follow the outbox no
 * faster than their 60-second snapshot.
 */
@SpringBootTest(properties = "spring.task.scheduling.enabled=false")
@Transactional
class NotificationMetricsTest {
    static final String CHANNEL = "METRICS_PROBE";

    static final class SettableClock extends Clock {
        private volatile Instant now = Instant.now();
        void advance(Duration by) { now = now.plus(by); }
        @Override public Instant instant() { return now; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { throw new UnsupportedOperationException(); }
    }

    @Autowired MeterRegistry contextRegistry; @Autowired QueuedNotificationRepository messages;
    @Autowired NotificationOutbox outbox; @Autowired JdbcTemplate jdbc;

    @Test void theApplicationRegistersTheOutboxTotal() {
        assertThat(contextRegistry.find("notification.outbox.dead.letters.total").gauge()).isNotNull();
    }

    @Test void outboxGaugesFollowTheOutboxThroughASixtySecondSnapshot() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        SettableClock clock = new SettableClock();
        new NotificationMetrics(registry, messages, clock);
        Instant start = clock.instant();
        enqueue(start.minus(Duration.ofMinutes(10)));                              // PENDING, never tried: the oldest waiting
        status(enqueue(start.minus(Duration.ofMinutes(5))), "RETRY", 2);           // failed twice, waiting again
        status(enqueue(start.minus(Duration.ofMinutes(4))), "PROCESSING", 1);      // first attempt in flight
        status(enqueue(start.minus(Duration.ofMinutes(3))), "RETRY", 0);           // released before its first attempt
        status(enqueue(start.minus(Duration.ofMinutes(20))), "DEAD_LETTER", 5);    // parked: not waiting
        status(enqueue(start.minus(Duration.ofMinutes(30))), "DELIVERED", 1);      // done: not counted
        String superseded = enqueue(start.minus(Duration.ofMinutes(2)));           // a superseded resend: cancelled, not a failure
        assertThat(messages.cancelQueued(superseded)).isEqualTo(1);

        assertThat(registry.get("notification.outbox.dead.letters.total").gauge().value()).isGreaterThanOrEqualTo(1);
        assertThat(gauge(registry, "notification.outbox.dead.letters")).isEqualTo(1);
        assertThat(gauge(registry, "notification.outbox.retrying")).isEqualTo(1);
        assertThat(gauge(registry, "notification.outbox.pending")).isEqualTo(4);
        assertThat(gauge(registry, "notification.outbox.oldest.pending.age")).isBetween(599.0, 601.0);
        assertThat(registry.get("notification.outbox.oldest.pending.age").tags("channel", CHANNEL).gauge().getId().getBaseUnit()).isEqualTo("seconds");

        // A new message is not read until the snapshot is a minute old: a scrape never scans the table.
        enqueue(start);
        assertThat(gauge(registry, "notification.outbox.pending")).isEqualTo(4);
        clock.advance(Duration.ofSeconds(61));
        assertThat(gauge(registry, "notification.outbox.pending")).isEqualTo(5);
        assertThat(gauge(registry, "notification.outbox.oldest.pending.age")).isBetween(660.0, 662.0);

        // Once nothing waits, the series stays at zero so an alert resolves instead of losing its data.
        jdbc.update("UPDATE notification_outbox SET status='DELIVERED' WHERE channel=? AND status<>'DEAD_LETTER'", CHANNEL);
        clock.advance(Duration.ofSeconds(61));
        assertThat(gauge(registry, "notification.outbox.pending")).isZero();
        assertThat(gauge(registry, "notification.outbox.retrying")).isZero();
        assertThat(gauge(registry, "notification.outbox.oldest.pending.age")).isZero();
        assertThat(gauge(registry, "notification.outbox.dead.letters")).isEqualTo(1);
    }

    private static double gauge(SimpleMeterRegistry registry, String name) {
        return registry.get(name).tags("channel", CHANNEL).gauge().value();
    }

    private String enqueue(Instant createdAt) {
        String key = "metrics-test:" + UUID.randomUUID();
        outbox.enqueue("METRICS_PROBE", CHANNEL, "probe@example.test", "case-access-code", "{}", key, createdAt);
        return key;
    }

    private void status(String key, String status, int attempts) {
        assertThat(jdbc.update("UPDATE notification_outbox SET status=?, attempts=? WHERE idempotency_key=?", status, attempts, key)).isEqualTo(1);
    }
}
