package com.rehletshifaa.notification.application;

import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository.OutboxChannelRow;
import com.rehletshifaa.shared.metrics.CachedSnapshot;
import com.rehletshifaa.shared.metrics.GroupedGauges;
import com.rehletshifaa.shared.metrics.GroupedGauges.Column;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.List;

/**
 * P1-8 (E-05): the notification module's business meters, all registered here. The only tag is {@code channel} (EMAIL,
 * WHATSAPP, ...); never destinations, case ids or template data.
 * <ul>
 *   <li>{@code notification.outbox.dead.letters} (parked for an operator), {@code notification.outbox.retrying} (waiting
 *       after at least one failed attempt), {@code notification.outbox.pending} (waiting to be sent: PENDING, RETRY or
 *       PROCESSING) and {@code notification.outbox.oldest.pending.age} (seconds) per {@code channel}, with the untagged
 *       {@code notification.outbox.dead.letters.total}; one grouped read of the outbox at most every 60 s.</li>
 * </ul>
 * These are levels. Delivery events (delivered, retry, dead_letter, ...) are already counted by
 * {@code notification.delivery{channel,outcome}} in {@link NotificationOutboxProcessor} and {@link NotificationOutboxStore}.
 */
@Component
public class NotificationMetrics {
    public NotificationMetrics(MeterRegistry registry, QueuedNotificationRepository messages, Clock clock) {
        new GroupedGauges<OutboxChannelRow>(registry, clock, CachedSnapshot.MAX_AGE, messages::summarizeByChannel,
                row -> Tags.of("channel", row.getChannel() == null ? "NONE" : row.getChannel()),
                List.of(new Column<>("notification.outbox.dead.letters", "Outbox messages parked as dead letters", "items", row -> row.getDeadLetters()),
                        new Column<>("notification.outbox.retrying", "Outbox messages waiting after a failed attempt", "items", row -> row.getRetrying()),
                        new Column<>("notification.outbox.pending", "Outbox messages waiting to be sent", "items", row -> row.getPending()),
                        new Column<>("notification.outbox.oldest.pending.age", "Age of the oldest outbox message waiting to be sent", "seconds",
                                row -> row.getOldestPending() == null ? 0 : Math.max(0, Duration.between(row.getOldestPending(), clock.instant()).toSeconds()))),
                "notification.outbox.dead.letters.total", "Outbox messages parked as dead letters, all channels");
    }
}
