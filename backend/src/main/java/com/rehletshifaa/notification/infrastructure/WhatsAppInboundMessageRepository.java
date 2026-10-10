package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.domain.WhatsAppInboundMessage;
import com.rehletshifaa.shared.persistence.BaseRepository;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WhatsAppInboundMessageRepository extends BaseRepository<WhatsAppInboundMessage, UUID> {
    boolean existsByProviderMessageId(String providerMessageId);

    /** Meta redelivers webhooks: the provider message id makes the second copy a no-op (atomic on PostgreSQL). */
    @Modifying(flushAutomatically = true)
    @Query("""
            insert into WhatsAppInboundMessage (id, providerMessageId, senderDigits, messageType, payload, providerSentAt, receivedAt,
                status, attempts, nextAttemptAt)
            values (:id, :providerMessageId, :senderDigits, :messageType, :payload, :sentAt, :receivedAt, 'PENDING', 0, :receivedAt)
            on conflict (providerMessageId) do nothing""")
    int recordOnce(@Param("id") UUID id, @Param("providerMessageId") String providerMessageId, @Param("senderDigits") String senderDigits,
                   @Param("messageType") String messageType, @Param("payload") String payload, @Param("sentAt") Instant sentAt,
                   @Param("receivedAt") Instant receivedAt);

    /** Lock timeout -2 is SKIP LOCKED: instances take different messages. Oldest sent first keeps a sender's order. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            select m from WhatsAppInboundMessage m
            where m.status in ('PENDING', 'RETRY', 'PROCESSING') and m.nextAttemptAt <= :now
            order by m.providerSentAt""")
    List<WhatsAppInboundMessage> lockDue(@Param("now") Instant now, Limit limit);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update WhatsAppInboundMessage m set m.status = 'PROCESSING', m.attempts = m.attempts + 1, m.nextAttemptAt = :leaseExpiresAt where m.id = :id")
    int lease(@Param("id") UUID id, @Param("leaseExpiresAt") Instant leaseExpiresAt);

    /** Final outcome, only by the worker that holds the current lease ({@code attempts} unchanged since it claimed). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WhatsAppInboundMessage m set m.status = :status, m.outcome = :outcome, m.caseId = :caseId, m.processedAt = :at,
                m.payload = case when :keepPayload = true then m.payload else '' end
            where m.id = :id and m.attempts = :attempt and m.status = 'PROCESSING'""")
    int complete(@Param("id") UUID id, @Param("attempt") int attempt, @Param("status") String status, @Param("outcome") String outcome,
                 @Param("caseId") UUID caseId, @Param("at") Instant at, @Param("keepPayload") boolean keepPayload);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update WhatsAppInboundMessage m set m.status = :status, m.outcome = :outcome, m.nextAttemptAt = :nextAttemptAt
            where m.id = :id and m.attempts = :attempt and m.status = 'PROCESSING'""")
    int retry(@Param("id") UUID id, @Param("attempt") int attempt, @Param("status") String status, @Param("outcome") String outcome,
              @Param("nextAttemptAt") Instant nextAttemptAt);
}
