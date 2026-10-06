package com.rehletshifaa.coordination.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One published version of the routing policy, effective for a period; its configuration is stored as JSON. Never edited. */
@Entity
@Immutable
@Table(name = "coordination_policy_versions")
public class CoordinationPolicyVersion extends AssignedIdEntity {
    @Column(name = "version_number", nullable = false, unique = true) private int versionNumber;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, columnDefinition = "text") private String configuration;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CoordinationPolicyVersion() {}

    public CoordinationPolicyVersion(UUID id, int versionNumber, Instant effectiveFrom, Instant effectiveTo, String configuration,
                                     String createdBy, Instant now) {
        super(id);
        this.versionNumber = versionNumber; this.effectiveFrom = micros(effectiveFrom); this.effectiveTo = micros(effectiveTo);
        this.configuration = configuration; this.createdBy = createdBy; this.createdAt = micros(now);
    }
}
