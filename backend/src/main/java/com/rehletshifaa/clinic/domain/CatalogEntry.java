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
 * One service on a consultant price list (EGP). Two writers: the platform price-list admin ({@code PLATFORM_MANAGED}
 * rows, no revision bump) and applied virtual-clinic service changes (each one a new {@code revision}).
 * {@code version} is the optimistic check both sides bump.
 */
@Entity
@Table(name = "consultant_service_catalog")
public class CatalogEntry extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "service_code", nullable = false, length = 60) private String serviceCode;
    @Column(name = "service_name", nullable = false, length = 500) private String serviceName;
    @Column(length = 120) private String category;
    @Column(name = "price_egp", nullable = false) private BigDecimal priceEgp;
    @Column(nullable = false) private boolean active;
    @Column(name = "valid_until") private LocalDate validUntil;
    @Column(name = "created_by", nullable = false, length = 120) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;
    @Column(name = "service_kind", length = 40) private String serviceKind;
    @Column(columnDefinition = "text") private String description;
    @Column(name = "included_scope", columnDefinition = "text") private String includedScope;
    @Column(name = "excluded_scope", columnDefinition = "text") private String excludedScope;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "price_max_egp") private BigDecimal priceMaxEgp;
    @Column(name = "effective_from") private LocalDate effectiveFrom;
    @Column(nullable = false) private int revision;
    @Column(name = "approval_status", nullable = false, length = 30) private String approvalStatus;
    @Column(name = "approved_by") private String approvedBy;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "updated_by") private String updatedBy;

    protected CatalogEntry() {}

    private CatalogEntry(UUID practitionerId, String code, String name, String category, BigDecimal price, boolean active,
                         LocalDate validUntil, String by, Instant now) {
        super(UUID.randomUUID());
        this.practitionerId = practitionerId; this.serviceCode = code; this.serviceName = name; this.category = category;
        this.priceEgp = price; this.active = active; this.validUntil = validUntil; this.createdBy = by;
        this.createdAt = micros(now); this.updatedAt = micros(now); this.currency = "EGP"; this.revision = 1;
        this.approvalStatus = "PLATFORM_MANAGED";
    }

    /** A service the platform adds to the price list (admin, CSV import or care-area template). */
    public static CatalogEntry platformManaged(UUID practitionerId, String code, String name, String category, BigDecimal price,
                                              boolean active, LocalDate validUntil, String by, Instant now) {
        return new CatalogEntry(practitionerId, code, name, category, price, active, validUntil, by, now);
    }

    /** The first revision of a service created through the virtual clinic. */
    public static CatalogEntry fromClinic(UUID practitionerId, ClinicServiceChange change, String category, String approvalStatus,
                                          String approvedBy, String by, Instant now) {
        CatalogEntry e = new CatalogEntry(practitionerId, change.getServiceCode(), change.getServiceName(), category, change.getPriceEgp(),
                true, change.getValidUntil(), by, now);
        e.serviceKind = change.getServiceKind(); e.description = change.getDescription(); e.includedScope = change.getIncludedScope();
        e.excludedScope = change.getExcludedScope(); e.currency = change.getCurrency(); e.priceMaxEgp = change.getPriceMaxEgp();
        e.effectiveFrom = change.getEffectiveFrom(); e.approvalStatus = approvalStatus; e.approvedBy = approvedBy;
        e.approvedAt = approvedBy == null ? null : micros(now); e.updatedBy = by;
        return e;
    }

    /** Applies a clinic change as the next revision. */
    public void applyClinicChange(ClinicServiceChange change, String category, boolean active, String approvalStatus, String approvedBy,
                                  String by, Instant now) {
        serviceName = change.getServiceName(); serviceKind = change.getServiceKind(); this.category = category;
        description = change.getDescription(); includedScope = change.getIncludedScope(); excludedScope = change.getExcludedScope();
        currency = change.getCurrency(); priceEgp = change.getPriceEgp(); priceMaxEgp = change.getPriceMaxEgp();
        effectiveFrom = change.getEffectiveFrom(); validUntil = change.getValidUntil(); this.active = active;
        revision++; this.approvalStatus = approvalStatus; this.approvedBy = approvedBy; approvedAt = approvedBy == null ? null : micros(now);
        updatedBy = by;
        touch(now);
    }

    /** A platform price-list edit. */
    public void edit(String name, String category, BigDecimal price, boolean active, LocalDate validUntil, Instant now) {
        serviceName = name; this.category = category; priceEgp = price; this.active = active; this.validUntil = validUntil;
        touch(now);
    }

    /** A CSV import row: valid-until is not part of the import and is kept. */
    public void importValues(String name, String category, BigDecimal price, boolean active, Instant now) {
        edit(name, category, price, active, validUntil, now);
    }

    public void deactivate(Instant now) {
        active = false;
        touch(now);
    }

    private void touch(Instant now) { updatedAt = micros(now); version++; }

    public UUID getPractitionerId() { return practitionerId; }
    public String getServiceCode() { return serviceCode; }
    public String getServiceName() { return serviceName; }
    public String getCategory() { return category; }
    public BigDecimal getPriceEgp() { return priceEgp; }
    public boolean isActive() { return active; }
    public LocalDate getValidUntil() { return validUntil; }
    public String getServiceKind() { return serviceKind; }
    public String getDescription() { return description; }
    public String getIncludedScope() { return includedScope; }
    public String getExcludedScope() { return excludedScope; }
    public String getCurrency() { return currency; }
    public BigDecimal getPriceMaxEgp() { return priceMaxEgp; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public int getRevision() { return revision; }
    public String getApprovalStatus() { return approvalStatus; }
    public long getVersion() { return version; }
}
