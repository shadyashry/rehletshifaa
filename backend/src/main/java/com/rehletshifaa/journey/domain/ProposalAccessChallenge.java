package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A one-time code that unlocks a proposal share link; attempts and consumption are guarded updates. */
@Entity
@Table(name = "proposal_access_challenges")
public class ProposalAccessChallenge extends AssignedIdEntity {
    @Column(name = "share_token_id", nullable = false) private UUID shareTokenId;
    @Column(name = "proposal_version_id", nullable = false) private UUID proposalVersionId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "code_hash", nullable = false, length = 128) private String codeHash;
    @Column(name = "delivery_channel", nullable = false, length = 20) private String deliveryChannel;
    @Column(name = "destination_hint", nullable = false, length = 100) private String destinationHint;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(nullable = false) private int attempts;
    @Column(name = "max_attempts", nullable = false) private int maxAttempts;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "grant_hash", length = 128) private String grantHash;
    @Column(name = "grant_expires_at") private Instant grantExpiresAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected ProposalAccessChallenge() {}

    /** The share link and proposal version the code unlocks. */
    public record Target(UUID shareTokenId, UUID proposalVersionId, UUID caseId) {}

    /** A code sent to the patient, open until it expires. */
    public ProposalAccessChallenge(UUID id, Target target, String codeHash, String deliveryChannel, String destinationHint, Instant expiresAt,
                                   int maxAttempts, Instant now) {
        super(id);
        this.shareTokenId = target.shareTokenId(); this.proposalVersionId = target.proposalVersionId(); this.caseId = target.caseId();
        this.codeHash = codeHash; this.deliveryChannel = deliveryChannel; this.destinationHint = destinationHint;
        this.expiresAt = micros(expiresAt); this.maxAttempts = maxAttempts; this.createdAt = micros(now);
    }

    /**
     * An access already proven another way (a verified case link): recorded as a challenge consumed at once, carrying
     * the grant it was exchanged for.
     */
    public static ProposalAccessChallenge provenElsewhere(Target target, String codeHash, String deliveryChannel, String destinationHint,
                                                          String grantHash, Instant grantExpiresAt, Instant now) {
        ProposalAccessChallenge c = new ProposalAccessChallenge(UUID.randomUUID(), target, codeHash, deliveryChannel, destinationHint, now, 1, now);
        c.attempts = 1; c.consumedAt = micros(now); c.grantHash = grantHash; c.grantExpiresAt = micros(grantExpiresAt);
        return c;
    }
}
