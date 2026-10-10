package com.rehletshifaa.notification.application;

import com.rehletshifaa.notification.infrastructure.WhatsAppInboundMessageRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Inbound WhatsApp messages between the webhook and whoever files them. Recording is idempotent per provider message
 * id; processing is leased (SKIP LOCKED + expiry) so instances never handle one message twice at once and a crash only
 * delays it. Each outcome is written only by the worker holding the current lease.
 */
@Service
public class WhatsAppInboundStore {
    static final long LEASE_SECONDS = 300;
    /** After this many attempts a message is FAILED and kept for inspection instead of retried. */
    static final int MAX_ATTEMPTS = 8;

    private final WhatsAppInboundMessageRepository messages;
    private final CryptoService crypto;
    private final Clock clock;

    public WhatsAppInboundStore(WhatsAppInboundMessageRepository messages, CryptoService crypto, Clock clock) {
        this.messages = messages; this.crypto = crypto; this.clock = clock;
    }

    /** A claimed message: the decrypted message object as Meta sent it, plus the attempt that holds the lease. */
    public record InboundMessage(UUID id, String providerMessageId, String senderDigits, String messageType, String payload,
                                 Instant sentAt, int attempt) {}

    /** @return true when the message is new, false for a redelivery */
    @Transactional
    public boolean record(String providerMessageId, String senderDigits, String messageType, String messageJson, Instant sentAt) {
        // The usual redelivery is answered by the lookup; ON CONFLICT covers two deliveries racing on PostgreSQL.
        if (messages.existsByProviderMessageId(providerMessageId)) return false;
        Instant now = clock.instant();
        return messages.recordOnce(UUID.randomUUID(), providerMessageId, senderDigits, messageType,
                EncryptedText.encode(crypto, messageJson), micros(sentAt), micros(now)) == 1;
    }

    @Transactional
    public List<InboundMessage> claim(int batchSize) {
        Instant now = clock.instant();
        Instant leaseExpiresAt = now.plusSeconds(LEASE_SECONDS);
        return messages.lockDue(micros(now), Limit.of(batchSize)).stream().map(m -> {
            messages.lease(m.getId(), micros(leaseExpiresAt));
            return new InboundMessage(m.getId(), m.getProviderMessageId(), m.getSenderDigits(), m.getMessageType(),
                    EncryptedText.decode(crypto, m.getPayload()), m.getProviderSentAt(), m.getAttempts() + 1);
        }).toList();
    }

    /** Filed into a case (or deliberately ignored, with {@code caseId} null): the payload is no longer needed. */
    @Transactional
    public boolean processed(InboundMessage message, UUID caseId, String outcome) {
        return messages.complete(message.id(), message.attempt(), "PROCESSED", outcome, caseId, micros(clock.instant()), false) == 1;
    }

    /** No open case for the sender: kept, encrypted, for an intake conversation to take over. */
    @Transactional
    public boolean unmatched(InboundMessage message) {
        return messages.complete(message.id(), message.attempt(), "UNMATCHED", "NO_OPEN_CASE", null, micros(clock.instant()), true) == 1;
    }

    /** A transient failure: retried with backoff, or FAILED (payload kept) once the attempts are spent. */
    @Transactional
    public boolean retryLater(InboundMessage message, String outcome) {
        if (message.attempt() >= MAX_ATTEMPTS)
            return messages.complete(message.id(), message.attempt(), "FAILED", outcome, null, micros(clock.instant()), true) == 1;
        Duration backoff = Duration.ofSeconds(Math.min(3600, 30L * message.attempt() * message.attempt()));
        return messages.retry(message.id(), message.attempt(), "RETRY", outcome, micros(clock.instant().plus(backoff))) == 1;
    }
}
