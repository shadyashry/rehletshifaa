package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A purpose-scoped secure link to a case (STATUS, ONBOARDING, INFORMATION_RESPONSE). Only the token hash is stored. */
@Entity
@Table(name = "case_access_links")
public class CaseAccessLink extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(nullable = false, length = 40) private String purpose;
    @Column(name = "token_hash", nullable = false, unique = true, length = 128) private String tokenHash;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CaseAccessLink() {}

    public CaseAccessLink(UUID id, UUID caseId, UUID patientId, String purpose, String tokenHash, Instant expiresAt, Instant now) {
        super(id);
        this.caseId = caseId; this.patientId = patientId; this.purpose = purpose; this.tokenHash = tokenHash;
        this.expiresAt = micros(expiresAt); this.createdAt = micros(now);
    }
}
