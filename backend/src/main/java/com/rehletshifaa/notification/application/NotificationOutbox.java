package com.rehletshifaa.notification.application;

import com.rehletshifaa.notification.domain.QueuedNotification;
import com.rehletshifaa.notification.infrastructure.QueuedNotificationRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * The single writer of new outbox messages. Each joins the caller's transaction, so a rolled-back business change
 * never sends anything; delivery happens after commit ({@link NotificationOutboxProcessor}).
 */
@Component
public class NotificationOutbox {
    /** Delivery attempts per message before it is parked for an operator. */
    static final int MAX_ATTEMPTS = 5;
    private final QueuedNotificationRepository messages;

    public NotificationOutbox(QueuedNotificationRepository messages) { this.messages = messages; }

    /** Queues a message; a second message with the same idempotency key is an error (unique key). */
    public void enqueue(String type, String channel, String destination, String templateKey, String templateData,
                        String idempotencyKey, Instant now) {
        messages.saveAndFlush(new QueuedNotification(type, channel, destination, templateKey, templateData, MAX_ATTEMPTS, idempotencyKey, now));
    }

    /** Queues a message unless one with the same idempotency key already exists (safe to call on replay). */
    public void enqueueOnce(String type, String channel, String destination, String templateKey, String templateData,
                            String idempotencyKey, Instant now) {
        if (!messages.existsByIdempotencyKey(idempotencyKey)) enqueue(type, channel, destination, templateKey, templateData, idempotencyKey, now);
    }
}
