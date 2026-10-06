package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PaymentEvent;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public interface PaymentEventRepository extends BaseRepository<PaymentEvent, UUID> {
    /** Appends a ledger entry; a duplicate idempotency key appends nothing. @return 1 when appended */
    @Modifying(flushAutomatically = true)
    @Query("""
            insert into PaymentEvent (id, caseId, depositId, eventType, amountEgp, amountDisplay, currency, method, provider, providerReference,
                status, actorSubject, reason, idempotencyKey, occurredAt)
            values (:id, :caseId, :depositId, :eventType, :amountEgp, :amountDisplay, :currency, :method, :provider, :providerReference,
                :status, :actor, :reason, :key, :now) on conflict do nothing""")
    int append(@Param("id") UUID id, @Param("caseId") UUID caseId, @Param("depositId") UUID depositId, @Param("eventType") String eventType,
               @Param("amountEgp") BigDecimal amountEgp, @Param("amountDisplay") BigDecimal amountDisplay, @Param("currency") String currency,
               @Param("method") String method, @Param("provider") String provider, @Param("providerReference") String providerReference,
               @Param("status") String status, @Param("actor") String actor, @Param("reason") String reason, @Param("key") String key,
               @Param("now") Instant now);
}
