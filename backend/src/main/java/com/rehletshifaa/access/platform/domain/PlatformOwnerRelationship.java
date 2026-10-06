package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One period during which a subject was the Platform Account Owner. History is kept; the current one is pointed to. */
@Entity
@Table(name = "platform_account_owner_relationships")
public class PlatformOwnerRelationship extends AssignedIdEntity {
    @Column(nullable = false) private String subject;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(nullable = false) private long revision;

    protected PlatformOwnerRelationship() {}

    public PlatformOwnerRelationship(String subject, Instant effectiveFrom, String createdBy, String reason) {
        super(UUID.randomUUID());
        this.subject = subject; this.effectiveFrom = micros(effectiveFrom); this.status = "ACTIVE"; this.createdBy = createdBy; this.reason = reason;
    }

    /** Ends a still-open relationship; returns false if it already ended. */
    public boolean end(Instant at) {
        if (!"ACTIVE".equals(status) || effectiveTo != null) return false;
        effectiveTo = micros(at); status = "ENDED"; revision++;
        return true;
    }

    public String getSubject() { return subject; }
    public boolean isCurrent() { return "ACTIVE".equals(status) && effectiveTo == null; }
}
