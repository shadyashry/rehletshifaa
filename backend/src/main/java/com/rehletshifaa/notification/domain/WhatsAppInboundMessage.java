package com.rehletshifaa.notification.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One message a person sent to the business number, stored once per provider message id the moment the webhook
 * accepts it and processed later from a lease (as the notification outbox is). The payload is the encrypted message
 * object; it is cleared once the message has been filed, and kept while it is UNMATCHED (no open case for the sender)
 * for intake conversations to pick up.
 */
@Entity
@Table(name = "whatsapp_inbound_messages")
public class WhatsAppInboundMessage extends AssignedIdEntity {
    @Column(name = "provider_message_id", nullable = false, unique = true) private String providerMessageId;
    @Column(name = "sender_digits", nullable = false, length = 20) private String senderDigits;
    @Column(name = "message_type", nullable = false, length = 30) private String messageType;
    @Column(nullable = false, columnDefinition = "text") private String payload;
    @Column(name = "provider_sent_at", nullable = false) private Instant providerSentAt;
    @Column(name = "received_at", nullable = false) private Instant receivedAt;
    @Column(nullable = false, length = 20) private String status;
    @Column(nullable = false) private int attempts;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(length = 60) private String outcome;
    @Column(name = "case_id") private UUID caseId;
    @Column(name = "processed_at") private Instant processedAt;

    protected WhatsAppInboundMessage() {}

    public String getProviderMessageId() { return providerMessageId; }
    public String getSenderDigits() { return senderDigits; }
    public String getMessageType() { return messageType; }
    public String getPayload() { return payload; }
    public Instant getProviderSentAt() { return providerSentAt; }
    public String getStatus() { return status; }
    public int getAttempts() { return attempts; }
    public String getOutcome() { return outcome; }
    public UUID getCaseId() { return caseId; }
}
