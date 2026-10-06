package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A one-time code sent for a case access link; attempts and consumption are guarded updates. */
@Entity
@Table(name = "case_access_challenges")
public class CaseAccessChallenge extends AssignedIdEntity {
    @Column(name = "link_id", nullable = false) private UUID linkId;
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

    protected CaseAccessChallenge() {}

    public CaseAccessChallenge(UUID id, UUID linkId, String codeHash, String deliveryChannel, String destinationHint, Instant expiresAt,
                               int maxAttempts, Instant now) {
        super(id);
        this.linkId = linkId; this.codeHash = codeHash; this.deliveryChannel = deliveryChannel; this.destinationHint = destinationHint;
        this.expiresAt = micros(expiresAt); this.maxAttempts = maxAttempts; this.createdAt = micros(now);
    }
}
