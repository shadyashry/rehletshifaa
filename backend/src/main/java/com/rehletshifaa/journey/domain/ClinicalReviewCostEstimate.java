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
    @Column(name = "facility_package_id") private UUID facilityPackageId;
    /** P1-19: CONSULTANT, FACILITY or OTHER; null on a line saved without one (it then follows its source). */
    @Column(length = 20) private String payee;

    protected ClinicalReviewCostEstimate() {}

    public ClinicalReviewCostEstimate(UUID clinicalReviewId, String serviceDescription, BigDecimal estimatedCost, String currency, int sortOrder,
                                      UUID catalogServiceId, BigDecimal priceEgp, boolean requiresFinanceApproval) {
        super(UUID.randomUUID());
        this.clinicalReviewId = clinicalReviewId; this.serviceDescription = serviceDescription; this.estimatedCost = estimatedCost;
        this.currency = currency; this.sortOrder = sortOrder; this.catalogServiceId = catalogServiceId; this.priceEgp = priceEgp;
        this.requiresFinanceApproval = requiresFinanceApproval;
    }

    /** A line priced from a Finance-approved facility package (P0-5): the expected EGP figure inside the package range, which travels with it. */
    public ClinicalReviewCostEstimate(UUID clinicalReviewId, String serviceDescription, BigDecimal estimatedCost, String currency, int sortOrder,
                                      UUID catalogServiceId, BigDecimal priceEgp, boolean requiresFinanceApproval, UUID facilityPackageId,
                                      BigDecimal priceEgpMin, BigDecimal priceEgpMax) {
        this(clinicalReviewId, serviceDescription, estimatedCost, currency, sortOrder, catalogServiceId, priceEgp, requiresFinanceApproval);
        this.facilityPackageId = facilityPackageId; this.priceEgpMin = priceEgpMin; this.priceEgpMax = priceEgpMax;
    }

    /** P1-19 (design §7.4): who is paid for the line. */
    public ClinicalReviewCostEstimate payee(String payee) { this.payee = payee; return this; }

    public String getPayee() { return payee; }
}
