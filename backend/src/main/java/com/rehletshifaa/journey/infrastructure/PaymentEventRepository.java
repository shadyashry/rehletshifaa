package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.domain.PaymentEvent;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface PaymentEventRepository extends BaseRepository<PaymentEvent, UUID> {
    interface Entry {
        String getEventType(); BigDecimal getAmountDisplay(); String getCurrency(); String getMethod(); String getProvider();
        String getProviderReference(); String getStatus(); String getReason(); Instant getOccurredAt();
    }

    /** The deposit's ledger in the order it happened. */
    @Query("""
            select e.eventType as eventType, e.amountDisplay as amountDisplay, e.currency as currency, e.method as method, e.provider as provider,
                e.providerReference as providerReference, e.status as status, e.reason as reason, e.occurredAt as occurredAt
            from PaymentEvent e where e.depositId = :depositId order by e.occurredAt""")
    List<Entry> findLedgerOf(@Param("depositId") UUID depositId);

    /** EGP recorded as paid and as refunded on the deposit; each is null when nothing of that kind was recorded. */
    interface Totals { BigDecimal getPaidEgp(); BigDecimal getRefundedEgp(); }

    @Query("""
            select sum(case when e.eventType = 'PAYMENT_RECORDED' then e.amountEgp end) as paidEgp,
                sum(case when e.eventType = 'REFUND_RECORDED' then e.amountEgp end) as refundedEgp
            from PaymentEvent e where e.depositId = :depositId""")
    Totals findTotalsOf(@Param("depositId") UUID depositId);

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
