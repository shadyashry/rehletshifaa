package com.rehletshifaa.notification.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/** One provider delivery receipt, stored once per (provider, message, status, event time). Append-only. */
@Entity
@Immutable
@Table(name = "whatsapp_delivery_events")
public class WhatsAppDeliveryEvent extends AssignedIdEntity {
    @Column(nullable = false, length = 30) private String provider;
    @Column(name = "provider_message_id", nullable = false) private String providerMessageId;
    @Column(name = "delivery_status", nullable = false, length = 30) private String deliveryStatus;
    @Column(name = "provider_event_at", nullable = false) private Instant providerEventAt;
    @Column(name = "error_code", length = 100) private String errorCode;
    @Column(name = "payload_hash", nullable = false, length = 64) private String payloadHash;
    @Column(name = "received_at", nullable = false) private Instant receivedAt;

    protected WhatsAppDeliveryEvent() {}
}
