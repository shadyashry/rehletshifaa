package com.rehletshifaa.notification.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One queued notification. Written in the business transaction that caused it and delivered after commit by
 * leased workers; {@code templateData} is encrypted and cleared once delivered. State changes after creation go
 * through the repository's guarded updates.
 */
@Entity
@Table(name = "notification_outbox")
public class QueuedNotification extends AssignedIdEntity {
    @Column(name = "notification_type", nullable = false, length = 60) private String notificationType;
    @Column(nullable = false, length = 30) private String channel;
    @Column(nullable = false, length = 320) private String destination;
    @Column(name = "template_key", nullable = false, length = 100) private String templateKey;
    @Column(name = "template_data", nullable = false, columnDefinition = "text") private String templateData;
    @Column(nullable = false, length = 30) private String status;
    @Column(nullable = false) private int attempts;
    @Column(name = "max_attempts", nullable = false) private int maxAttempts;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(name = "last_error_code", length = 100) private String lastErrorCode;
    @Column(name = "provider_reference") private String providerReference;
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 160) private String idempotencyKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "delivered_at") private Instant deliveredAt;
    @Column(name = "provider_delivery_status", length = 30) private String providerDeliveryStatus;
    @Column(name = "provider_status_at") private Instant providerStatusAt;
    @Column(name = "provider_error_code", length = 100) private String providerErrorCode;

    protected QueuedNotification() {}

    public QueuedNotification(String notificationType, String channel, String destination, String templateKey, String templateData,
                         int maxAttempts, String idempotencyKey, Instant now) {
        super(UUID.randomUUID());
        this.notificationType = notificationType; this.channel = channel; this.destination = destination; this.templateKey = templateKey;
        this.templateData = templateData; this.status = "PENDING"; this.maxAttempts = maxAttempts; this.idempotencyKey = idempotencyKey;
        this.nextAttemptAt = micros(now); this.createdAt = micros(now);
    }

    public String getChannel() { return channel; }
    public String getDestination() { return destination; }
    public String getTemplateKey() { return templateKey; }
    public String getTemplateData() { return templateData; }
    public String getStatus() { return status; }
    public int getAttempts() { return attempts; }
    public int getMaxAttempts() { return maxAttempts; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public Instant getDeliveredAt() { return deliveredAt; }
}
