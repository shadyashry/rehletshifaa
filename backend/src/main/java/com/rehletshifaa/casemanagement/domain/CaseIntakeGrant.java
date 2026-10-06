package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The one-time grant that lets an anonymous submitter finish (upload to and submit) the draft they created. */
@Entity
@Table(name = "case_intake_grants")
public class CaseIntakeGrant extends PersistableEntity<UUID> {
    @Id @Column(name = "case_id") private UUID caseId;
    @Column(name = "grant_hash", nullable = false, length = 64) private String grantHash;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CaseIntakeGrant() {}

    public CaseIntakeGrant(UUID caseId, String grantHash, Instant expiresAt, Instant now) {
        this.caseId = caseId; this.grantHash = grantHash; this.expiresAt = micros(expiresAt); this.createdAt = micros(now);
    }

    @Override public UUID getId() { return caseId; }
}
