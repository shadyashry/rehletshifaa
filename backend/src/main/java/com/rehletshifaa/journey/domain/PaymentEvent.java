package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** One entry of the append-only payment ledger, unique by idempotency key; written by {@code PaymentEventRepository.append}. */
@Entity
@Immutable
@Table(name = "payment_events")
public class PaymentEvent extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "deposit_id") private UUID depositId;
    @Column(name = "event_type", nullable = false, length = 30) private String eventType;
    @Column(name = "amount_egp") private BigDecimal amountEgp;
    @Column(name = "amount_display") private BigDecimal amountDisplay;
    @Column(length = 3) private String currency;
    @Column(length = 40) private String method;
    @Column(nullable = false, length = 40) private String provider;
    @Column(name = "provider_reference", length = 200) private String providerReference;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "actor_subject", length = 120) private String actorSubject;
    @Column(columnDefinition = "text") private String reason;
    @Column(name = "idempotency_key", nullable = false, unique = true, length = 200) private String idempotencyKey;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected PaymentEvent() {}
}
