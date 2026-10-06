package com.rehletshifaa.notification.infrastructure;

import com.rehletshifaa.notification.domain.WhatsAppDeliveryEvent;
import com.rehletshifaa.shared.persistence.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.UUID;

public interface WhatsAppDeliveryEventRepository extends BaseRepository<WhatsAppDeliveryEvent, UUID> {
    /**
     * Records a receipt once: the provider retries webhooks, and a duplicate must change nothing. Atomic
     * ({@code ON CONFLICT DO NOTHING}), so concurrent deliveries of the same receipt cannot both count.
     *
     * @return 1 when this receipt is new, 0 when it was already recorded
     */
    @Modifying(flushAutomatically = true)
    @Query("""
            insert into WhatsAppDeliveryEvent (id, provider, providerMessageId, deliveryStatus, providerEventAt, errorCode, payloadHash, receivedAt)
            values (:id, :provider, :messageId, :status, :eventAt, :errorCode, :payloadHash, :receivedAt)
            on conflict (provider, providerMessageId, deliveryStatus, providerEventAt) do nothing""")
    int recordOnce(@Param("id") UUID id, @Param("provider") String provider, @Param("messageId") String messageId,
                   @Param("status") String status, @Param("eventAt") Instant eventAt, @Param("errorCode") String errorCode,
                   @Param("payloadHash") String payloadHash, @Param("receivedAt") Instant receivedAt);
}
