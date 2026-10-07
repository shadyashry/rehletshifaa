package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The proposal of a case (one per case); its documents are numbered {@link ProposalVersion}s. */
@Entity
@Table(name = "proposals")
public class Proposal extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false, unique = true) private UUID caseId;
    @Column(name = "current_version", nullable = false) private int currentVersion;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected Proposal() {}

    public Proposal(UUID id, UUID caseId, Instant now) {
        super(id);
        this.caseId = caseId; this.createdAt = micros(now); this.updatedAt = micros(now);
    }

    public int getCurrentVersion() { return currentVersion; }
}
