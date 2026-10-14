package com.rehletshifaa.facility.domain;

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
 * One version of a facility's priced package: an EGP range for one procedure code in one care area, with what the price
 * includes. Versions per (facility, procedure code) are append-only; a version waits for Finance, is approved once
 * (retiring the version approved before it) or rejected, and an approved version is retired when the facility stops
 * offering it. Session 2 makes an approved, in-validity version a proposal line source that needs no Finance work item.
 */
@Entity
@Table(name = "facility_packages")
public class FacilityPackage extends AssignedIdEntity {
    public enum ApprovalStatus { PENDING_FINANCE, APPROVED, REJECTED, RETIRED }

    @Column(name = "facility_id", nullable = false) private UUID facilityId;
    @Column(name = "procedure_code", nullable = false, length = 40) private String procedureCode;
    @Column(nullable = false, length = 200) private String name;
    @Column(name = "care_category", nullable = false, length = 60) private String careCategory;
    @Column(name = "min_egp", nullable = false, precision = 14, scale = 2) private BigDecimal minEgp;
    @Column(name = "max_egp", nullable = false, precision = 14, scale = 2) private BigDecimal maxEgp;
    @Column(nullable = false, length = 2000) private String inclusions;
    @Column(length = 2000) private String exclusions;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private int version;
    @Column(name = "approval_status", nullable = false, length = 20) private String approvalStatus;
    @Column(name = "proposed_by", nullable = false, length = 120) private String proposedBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "decided_by", length = 120) private String decidedBy;
    @Column(name = "decided_at") private Instant decidedAt;
    @Column(name = "decision_note", length = 500) private String decisionNote;

    protected FacilityPackage() {}

    public FacilityPackage(UUID id, UUID facilityId, String procedureCode, String name, String careCategory, BigDecimal minEgp, BigDecimal maxEgp,
                           String inclusions, String exclusions, LocalDate validFrom, LocalDate validTo, int version, String actor, Instant now) {
        super(id);
        this.facilityId = facilityId; this.procedureCode = procedureCode; this.name = name; this.careCategory = careCategory;
        this.minEgp = minEgp; this.maxEgp = maxEgp; this.inclusions = inclusions; this.exclusions = exclusions;
        this.validFrom = validFrom; this.validTo = validTo; this.version = version;
        this.approvalStatus = ApprovalStatus.PENDING_FINANCE.name(); this.proposedBy = actor; this.createdAt = micros(now);
    }

    public void approve(String actor, String note, Instant now) { decide(ApprovalStatus.APPROVED, actor, note, now); }
    public void reject(String actor, String note, Instant now) { decide(ApprovalStatus.REJECTED, actor, note, now); }
    public void retire(String actor, String note, Instant now) { decide(ApprovalStatus.RETIRED, actor, note, now); }

    private void decide(ApprovalStatus next, String actor, String note, Instant now) {
        this.approvalStatus = next.name(); this.decidedBy = actor; this.decidedAt = micros(now); this.decisionNote = note;
    }

    public boolean isPending() { return getApprovalStatus() == ApprovalStatus.PENDING_FINANCE; }
    public boolean isApproved() { return getApprovalStatus() == ApprovalStatus.APPROVED; }

    public UUID getFacilityId() { return facilityId; }
    public String getProcedureCode() { return procedureCode; }
    public String getName() { return name; }
    public String getCareCategory() { return careCategory; }
    public BigDecimal getMinEgp() { return minEgp; }
    public BigDecimal getMaxEgp() { return maxEgp; }
    public String getInclusions() { return inclusions; }
    public String getExclusions() { return exclusions; }
    public LocalDate getValidFrom() { return validFrom; }
    public LocalDate getValidTo() { return validTo; }
    public int getVersion() { return version; }
    public ApprovalStatus getApprovalStatus() { return ApprovalStatus.valueOf(approvalStatus); }
    public String getProposedBy() { return proposedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getDecidedBy() { return decidedBy; }
    public Instant getDecidedAt() { return decidedAt; }
    public String getDecisionNote() { return decisionNote; }
}
