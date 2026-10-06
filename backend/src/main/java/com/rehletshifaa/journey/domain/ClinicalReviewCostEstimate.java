package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.util.UUID;

/** A cost line the consultant attached to a clinical review, priced from their catalogue where possible. */
@Entity
@Table(name = "clinical_review_cost_estimates")
public class ClinicalReviewCostEstimate extends AssignedIdEntity {
    @Column(name = "clinical_review_id", nullable = false) private UUID clinicalReviewId;
    @Column(name = "service_description", nullable = false, length = 500) private String serviceDescription;
    @Column(name = "estimated_cost", nullable = false) private BigDecimal estimatedCost;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "catalog_service_id") private UUID catalogServiceId;
    @Column(name = "price_egp") private BigDecimal priceEgp;
    @Column(name = "requires_finance_approval", nullable = false) private boolean requiresFinanceApproval;
    @Column(name = "price_egp_min") private BigDecimal priceEgpMin;
    @Column(name = "price_egp_max") private BigDecimal priceEgpMax;

    protected ClinicalReviewCostEstimate() {}

    public ClinicalReviewCostEstimate(UUID clinicalReviewId, String serviceDescription, BigDecimal estimatedCost, String currency, int sortOrder,
                                      UUID catalogServiceId, BigDecimal priceEgp, boolean requiresFinanceApproval) {
        super(UUID.randomUUID());
        this.clinicalReviewId = clinicalReviewId; this.serviceDescription = serviceDescription; this.estimatedCost = estimatedCost;
        this.currency = currency; this.sortOrder = sortOrder; this.catalogServiceId = catalogServiceId; this.priceEgp = priceEgp;
        this.requiresFinanceApproval = requiresFinanceApproval;
    }
}
