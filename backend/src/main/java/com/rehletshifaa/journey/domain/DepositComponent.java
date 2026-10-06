package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/** What a deposit pays for, for whom, and whether it is refundable or credited to the final bill. */
@Entity
@Table(name = "deposit_components")
public class DepositComponent extends AssignedIdEntity {
    @Column(name = "deposit_id", nullable = false) private UUID depositId;
    @Column(nullable = false, length = 20) private String beneficiary;
    @Column(nullable = false, length = 300) private String purpose;
    @Column(name = "amount_egp", nullable = false) private BigDecimal amountEgp;
    @Column(nullable = false, length = 30) private String refundability;
    @Column(name = "cancellation_terms", columnDefinition = "text") private String cancellationTerms;
    @Column(name = "credited_to_final", nullable = false) private boolean creditedToFinal;
    @Column(name = "sort_order", nullable = false) private int sortOrder;

    protected DepositComponent() {}

    public DepositComponent(UUID depositId, String beneficiary, String purpose, BigDecimal amountEgp, String refundability,
                            String cancellationTerms, boolean creditedToFinal) {
        super(UUID.randomUUID());
        this.depositId = depositId; this.beneficiary = beneficiary; this.purpose = purpose; this.amountEgp = amountEgp;
        this.refundability = refundability; this.cancellationTerms = cancellationTerms; this.creditedToFinal = creditedToFinal;
    }
}
