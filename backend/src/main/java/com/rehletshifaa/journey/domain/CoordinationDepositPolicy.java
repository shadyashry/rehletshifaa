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
 * One revision of the coordination-deposit policy, for one care area or (no care area) the default. Configuring a new
 * amount deactivates the previous revision and adds the next one.
 */
@Entity
@Table(name = "deposit_policies")
public class CoordinationDepositPolicy extends AssignedIdEntity {
    @Column(nullable = false, length = 160) private String name;
    @Column(name = "care_category", length = 60) private String careCategory;
    @Column(name = "coordination_deposit_egp", nullable = false) private BigDecimal coordinationDepositEgp;
    @Column(nullable = false) private boolean active;
    @Column(nullable = false) private int version;
    @Column(name = "created_by", length = 120) private String createdBy;
    @Column(name = "valid_from") private LocalDate validFrom;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CoordinationDepositPolicy() {}

    public CoordinationDepositPolicy(UUID id, String name, String careCategory, BigDecimal coordinationDepositEgp, int version,
                                     String createdBy, LocalDate validFrom, Instant now) {
        super(id);
        this.name = name; this.careCategory = careCategory; this.coordinationDepositEgp = coordinationDepositEgp; this.active = true;
        this.version = version; this.createdBy = createdBy; this.validFrom = validFrom; this.createdAt = micros(now);
    }
}
