package com.rehletshifaa.retention.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;

/**
 * P1-7: how long one record class is kept, from what, and whether purging it is on hold. Changed by migration only (reviewed like
 * code); the schema refuses days or a lifted hold on {@link RecordClass#LEGAL_RECORD}.
 */
@Entity
@Immutable
@Table(name = "retention_policies")
public class RetentionPolicy {
    /** When the retention clock starts for the class. */
    public enum Anchor { CREATED, PROCESSED, CLOSED, EXPIRED, CASE_CLOSED, RELATIONSHIP_ENDED, NONE }

    @Id @Enumerated(EnumType.STRING) @Column(name = "record_class", length = 40) private RecordClass recordClass;
    @Column(name = "retention_days") private Integer retentionDays;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 30) private Anchor anchor;
    @Column(name = "legal_hold", nullable = false) private boolean legalHold;
    @Column(nullable = false, length = 300) private String basis;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected RetentionPolicy() {}

    public RecordClass getRecordClass() { return recordClass; }
    /** Null: kept (no term set, or nothing personal). */
    public Integer getRetentionDays() { return retentionDays; }
    public Anchor getAnchor() { return anchor; }
    public boolean isLegalHold() { return legalHold; }
    public String getBasis() { return basis; }
    public Instant getUpdatedAt() { return updatedAt; }

    /** A purge of this class may run now: it has a term and no hold, and it is not a legal record. */
    public boolean purgeable() { return retentionDays != null && !legalHold && recordClass != RecordClass.LEGAL_RECORD; }
}
