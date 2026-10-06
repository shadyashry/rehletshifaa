package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A coordination deposit requested from the patient: EGP total, the display amount at the proposal's snapshot rate and
 * the policy revision it came from. Its status is recomputed from the append-only payment ledger.
 */
@Entity
@Table(name = "deposits")
public class Deposit extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "proposal_version_id") private UUID proposalVersionId;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "fx_rate") private BigDecimal fxRate;
    @Column(name = "fx_rate_date") private LocalDate fxRateDate;
    @Column(name = "fx_source", length = 20) private String fxSource;
    @Column(name = "policy_id") private UUID policyId;
    @Column(name = "policy_version") private Integer policyVersion;
    @Column(name = "total_egp", nullable = false) private BigDecimal totalEgp;
    @Column(name = "total_display") private BigDecimal totalDisplay;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_by", length = 120) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(nullable = false) private long version;
    @Column(name = "waived_at") private Instant waivedAt;
    @Column(name = "waived_by", length = 120) private String waivedBy;
    @Column(name = "waiver_reason", columnDefinition = "text") private String waiverReason;

    protected Deposit() {}

    /** The exchange-rate snapshot the deposit is quoted at. */
    public record Quote(String currency, BigDecimal fxRate, LocalDate fxRateDate, String fxSource, BigDecimal totalEgp, BigDecimal totalDisplay) {}

    /** A newly requested deposit. */
    public Deposit(UUID id, UUID caseId, UUID proposalVersionId, Quote quote, UUID policyId, int policyVersion, String createdBy, Instant now) {
        super(id);
        this.caseId = caseId; this.proposalVersionId = proposalVersionId; this.currency = quote.currency(); this.fxRate = quote.fxRate();
        this.fxRateDate = quote.fxRateDate(); this.fxSource = quote.fxSource(); this.totalEgp = quote.totalEgp();
        this.totalDisplay = quote.totalDisplay(); this.policyId = policyId; this.policyVersion = policyVersion; this.status = "REQUESTED";
        this.createdBy = createdBy; this.createdAt = micros(now);
    }
}
