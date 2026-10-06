package com.rehletshifaa.clinic.domain;

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
 * A proposed change to a virtual clinic's services and prices: CREATE, UPDATE, RETIRE or ACTIVATE. It carries the
 * full service as it would be, and the catalogue {@code version} it was prepared on ({@code base_version}).
 */
@Entity
@Table(name = "clinic_service_changes")
public class ClinicServiceChange extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "catalog_service_id") private UUID catalogServiceId;
    @Column(name = "change_type", nullable = false, length = 20) private String changeType;
    @Column(name = "service_code", nullable = false, length = 60) private String serviceCode;
    @Column(name = "service_name", nullable = false, length = 500) private String serviceName;
    @Column(name = "service_kind", nullable = false, length = 40) private String serviceKind;
    @Column(columnDefinition = "text") private String description;
    @Column(name = "included_scope", columnDefinition = "text") private String includedScope;
    @Column(name = "excluded_scope", columnDefinition = "text") private String excludedScope;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "price_egp", nullable = false) private BigDecimal priceEgp;
    @Column(name = "price_max_egp") private BigDecimal priceMaxEgp;
    @Column(name = "effective_from", nullable = false) private LocalDate effectiveFrom;
    @Column(name = "valid_until") private LocalDate validUntil;
    @Column(name = "base_version") private Long baseVersion;
    @Column(name = "applied_revision") private Integer appliedRevision;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "proposed_by", nullable = false) private String proposedBy;
    @Column(name = "proposed_by_role", nullable = false, length = 30) private String proposedByRole;
    @Column(name = "proposed_at", nullable = false) private Instant proposedAt;
    @Column(name = "decided_by") private String decidedBy;
    @Column(name = "decided_at") private Instant decidedAt;
    @Column(name = "decision_reason", length = 500) private String decisionReason;
    @Column(nullable = false) private long version;

    protected ClinicServiceChange() {}

    /** The service as the change would leave it. */
    public record Proposal(String code, String name, String kind, String description, String included, String excluded, String currency,
                           BigDecimal price, BigDecimal priceMax, LocalDate effectiveFrom, LocalDate validUntil) {}

    public ClinicServiceChange(UUID practitionerId, UUID catalogServiceId, String changeType, Proposal p, Long baseVersion,
                               String proposedBy, String proposedByRole, Instant now) {
        super(UUID.randomUUID());
        this.practitionerId = practitionerId; this.catalogServiceId = catalogServiceId; this.changeType = changeType;
        this.serviceCode = p.code(); this.serviceName = p.name(); this.serviceKind = p.kind(); this.description = p.description();
        this.includedScope = p.included(); this.excludedScope = p.excluded(); this.currency = p.currency(); this.priceEgp = p.price();
        this.priceMaxEgp = p.priceMax(); this.effectiveFrom = p.effectiveFrom(); this.validUntil = p.validUntil();
        this.baseVersion = baseVersion; this.status = "PENDING_APPROVAL"; this.proposedBy = proposedBy;
        this.proposedByRole = proposedByRole; this.proposedAt = micros(now);
    }

    public boolean isPending() { return "PENDING_APPROVAL".equals(status); }

    public void reject(String by, Instant now, String reason) { decide("REJECTED", by, now, reason); }

    public void applied(UUID serviceId, int revision, String by, Instant now, String reason) {
        catalogServiceId = serviceId; appliedRevision = revision;
        decide("APPLIED", by, now, reason);
    }

    private void decide(String status, String by, Instant now, String reason) {
        this.status = status; decidedBy = by; decidedAt = micros(now); decisionReason = reason; version++;
    }

    public UUID getPractitionerId() { return practitionerId; }
    public UUID getCatalogServiceId() { return catalogServiceId; }
    public String getChangeType() { return changeType; }
    public String getServiceCode() { return serviceCode; }
    public String getServiceName() { return serviceName; }
    public String getServiceKind() { return serviceKind; }
    public String getDescription() { return description; }
    public String getIncludedScope() { return includedScope; }
    public String getExcludedScope() { return excludedScope; }
    public String getCurrency() { return currency; }
    public BigDecimal getPriceEgp() { return priceEgp; }
    public BigDecimal getPriceMaxEgp() { return priceMaxEgp; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public LocalDate getValidUntil() { return validUntil; }
    public Long getBaseVersion() { return baseVersion; }
    public Integer getAppliedRevision() { return appliedRevision; }
    public String getStatus() { return status; }
    public String getProposedBy() { return proposedBy; }
    public String getProposedByRole() { return proposedByRole; }
    public Instant getProposedAt() { return proposedAt; }
    public String getDecidedBy() { return decidedBy; }
    public Instant getDecidedAt() { return decidedAt; }
    public String getDecisionReason() { return decisionReason; }
    public long getVersion() { return version; }
}
