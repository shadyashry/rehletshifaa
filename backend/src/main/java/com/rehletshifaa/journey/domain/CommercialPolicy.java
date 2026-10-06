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
 * One version of the coordinated-care margin for a care area ({@code careCategory} null = platform default).
 * Versions are append-only; configuring a new one retires the active one. {@code version} is the business
 * policy version shown to Finance, not an optimistic-lock counter.
 */
@Entity
@Table(name = "commercial_policies")
public class CommercialPolicy extends AssignedIdEntity {
    @Column(nullable = false, length = 160) private String name;
    @Column(name = "care_category", length = 60) private String careCategory;
    @Column(name = "margin_rate", nullable = false, precision = 6, scale = 4) private BigDecimal marginRate;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private int version;
    @Column(name = "created_by", length = 120) private String createdBy;
    @Column(name = "valid_from") private LocalDate validFrom;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CommercialPolicy() {}

    public CommercialPolicy(String name, String careCategory, BigDecimal marginRate, int version, String createdBy, LocalDate validFrom, Instant createdAt) {
        super(UUID.randomUUID());
        this.name = name; this.careCategory = careCategory; this.marginRate = marginRate; this.active = true;
        this.version = version; this.createdBy = createdBy; this.validFrom = validFrom; this.createdAt = micros(createdAt);
    }

    public void retire() { this.active = false; }

    public String getName() { return name; }
    public String getCareCategory() { return careCategory; }
    public BigDecimal getMarginRate() { return marginRate; }
    public boolean isActive() { return active; }
    public int getVersion() { return version; }
    public String getCreatedBy() { return createdBy; }
    public LocalDate getValidFrom() { return validFrom; }
}
