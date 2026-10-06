package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One numbered document of a proposal: a preliminary estimate or a final treatment quote. It moves through internal
 * approval (clinical, operations, finance) to release and the patient's decision, each step a guarded update in
 * {@code ProposalVersionRepository}. Commercial figures are EGP; the display currency is fixed at release.
 */
@Entity
@DynamicUpdate
@Table(name = "proposal_versions")
public class ProposalVersion extends AssignedIdEntity {
    @Column(name = "proposal_id", nullable = false) private UUID proposalId;
    @Column(name = "version_number", nullable = false) private int versionNumber;
    @Column(nullable = false, length = 40) private String status;
    @Column(nullable = false, length = 8) private String language;
    @Column(name = "clinical_review_id", nullable = false) private UUID clinicalReviewId;
    @Column(name = "operational_plan", columnDefinition = "text") private String operationalPlan;
    @Column(length = 3) private String currency;
    @Column(name = "included_services", columnDefinition = "text") private String includedServices;
    @Column(name = "excluded_services", columnDefinition = "text") private String excludedServices;
    @Column(name = "payment_terms", columnDefinition = "text") private String paymentTerms;
    @Column(name = "refund_terms", columnDefinition = "text") private String refundTerms;
    @Column(columnDefinition = "text") private String disclaimers;
    @Column(name = "valid_until") private Instant validUntil;
    @Column(name = "clinical_approved_by") private String clinicalApprovedBy;
    @Column(name = "clinical_approved_at") private Instant clinicalApprovedAt;
    @Column(name = "operations_completed_by") private String operationsCompletedBy;
    @Column(name = "operations_completed_at") private Instant operationsCompletedAt;
    @Column(name = "finance_approved_by") private String financeApprovedBy;
    @Column(name = "finance_approved_at") private Instant financeApprovedAt;
    @Column(name = "released_by") private String releasedBy;
    @Column(name = "released_at") private Instant releasedAt;
    @Column(name = "viewed_at") private Instant viewedAt;
    @Column(name = "superseded_at") private Instant supersededAt;
    @Column(name = "html_snapshot", columnDefinition = "text") private String htmlSnapshot;
    @Column(name = "pdf_object_key", length = 300) private String pdfObjectKey;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "coordinator_notes", columnDefinition = "text") private String coordinatorNotes;
    @Column(name = "fx_rate") private BigDecimal fxRate;
    @Column(name = "fx_rate_date") private LocalDate fxRateDate;
    @Column(name = "fx_source", length = 20) private String fxSource;
    @Column(name = "requires_finance_approval", nullable = false) private boolean requiresFinanceApproval;
    @Column(name = "document_type", nullable = false, length = 30) private String documentType;
    @Column(columnDefinition = "text") private String assumptions;
    @Column(name = "scope_change_reason", columnDefinition = "text") private String scopeChangeReason;
    @Column(name = "provider_net_egp") private BigDecimal providerNetEgp;
    @Column(name = "commercial_policy_id") private UUID commercialPolicyId;
    @Column(name = "commercial_policy_version") private Integer commercialPolicyVersion;
    @Column(name = "margin_rate") private BigDecimal marginRate;
    @Column(name = "margin_amount_egp") private BigDecimal marginAmountEgp;
    @Column(name = "tax_egp", nullable = false) private BigDecimal taxEgp;
    @Column(name = "patient_total_min_egp") private BigDecimal patientTotalMinEgp;
    @Column(name = "patient_total_expected_egp") private BigDecimal patientTotalExpectedEgp;
    @Column(name = "patient_total_max_egp") private BigDecimal patientTotalMaxEgp;

    protected ProposalVersion() {}

    /** The document's identity: which proposal, which number, which kind, built on which clinical review. */
    public record Document(UUID proposalId, int versionNumber, String documentType, String scopeChangeReason, String language,
                           UUID clinicalReviewId) {}

    /** What the patient is offered and on which terms. */
    public record Terms(String operationalPlan, String currency, String includedServices, String excludedServices, String paymentTerms,
                        String refundTerms, String disclaimers, String coordinatorNotes, Instant validUntil) {}

    /** The commercial calculation (EGP) and the policy it was made under. */
    public record Pricing(boolean requiresFinanceApproval, BigDecimal providerNetEgp, UUID commercialPolicyId, Integer commercialPolicyVersion,
                          BigDecimal marginRate, BigDecimal marginAmountEgp, BigDecimal patientTotalMinEgp, BigDecimal patientTotalExpectedEgp,
                          BigDecimal patientTotalMaxEgp) {}

    /** A new version, clinically approved by the clinical review's approver. */
    public ProposalVersion(UUID id, Document d, Terms t, Pricing p, String clinicalApprovedBy, Instant clinicalApprovedAt, String createdBy,
                           Instant now) {
        super(id);
        this.proposalId = d.proposalId(); this.versionNumber = d.versionNumber(); this.documentType = d.documentType();
        this.scopeChangeReason = d.scopeChangeReason(); this.language = d.language(); this.clinicalReviewId = d.clinicalReviewId();
        this.status = "CLINICALLY_APPROVED";
        this.operationalPlan = t.operationalPlan(); this.currency = t.currency(); this.includedServices = t.includedServices();
        this.excludedServices = t.excludedServices(); this.paymentTerms = t.paymentTerms(); this.refundTerms = t.refundTerms();
        this.disclaimers = t.disclaimers(); this.coordinatorNotes = t.coordinatorNotes(); this.validUntil = micros(t.validUntil());
        this.requiresFinanceApproval = p.requiresFinanceApproval(); this.providerNetEgp = p.providerNetEgp();
        this.commercialPolicyId = p.commercialPolicyId(); this.commercialPolicyVersion = p.commercialPolicyVersion();
        this.marginRate = p.marginRate(); this.marginAmountEgp = p.marginAmountEgp(); this.patientTotalMinEgp = p.patientTotalMinEgp();
        this.patientTotalExpectedEgp = p.patientTotalExpectedEgp(); this.patientTotalMaxEgp = p.patientTotalMaxEgp();
        this.taxEgp = BigDecimal.ZERO;
        this.clinicalApprovedBy = clinicalApprovedBy; this.clinicalApprovedAt = clinicalApprovedAt;
        this.createdBy = createdBy; this.createdAt = micros(now);
    }
}
