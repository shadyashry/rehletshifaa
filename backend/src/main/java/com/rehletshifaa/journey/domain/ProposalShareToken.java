package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A secure link to a released proposal version. Only the token hash is stored. */
@Entity
@Table(name = "proposal_share_tokens")
public class ProposalShareToken extends AssignedIdEntity {
    @Column(name = "proposal_version_id", nullable = false) private UUID proposalVersionId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "token_hash", nullable = false, unique = true, length = 128) private String tokenHash;
    @Column(name = "signed_name", length = 160) private String signedName;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "revoked_at") private Instant revokedAt;

    protected ProposalShareToken() {}

    public ProposalShareToken(UUID id, UUID proposalVersionId, UUID caseId, String tokenHash, Instant expiresAt, Instant now) {
        super(id);
        this.proposalVersionId = proposalVersionId; this.caseId = caseId; this.tokenHash = tokenHash; this.expiresAt = micros(expiresAt);
        this.createdAt = micros(now);
    }
}
