package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A coordinator's patient conversations handed to another coordinator for a period (out of office, a shift). Active
 * while {@code startsAt <= now < endsAt} and not revoked; while active only the cover replies to the owner's patients.
 */
@Entity
@Table(name = "reply_covers")
public class ReplyCover extends AssignedIdEntity {
    @Column(name = "owner_subject", nullable = false) private String ownerSubject;
    @Column(name = "cover_subject", nullable = false) private String coverSubject;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;
    @Column(length = 500) private String reason;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "revoked_by") private String revokedBy;

    protected ReplyCover() {}

    public ReplyCover(UUID id, String ownerSubject, String coverSubject, Instant startsAt, Instant endsAt, String reason, String createdBy, Instant now) {
        super(id);
        this.ownerSubject = ownerSubject; this.coverSubject = coverSubject; this.startsAt = micros(startsAt); this.endsAt = micros(endsAt);
        this.reason = reason; this.createdBy = createdBy; this.createdAt = micros(now);
    }

    /** Ends the cover now, or cancels it before it starts; the owner replies again at once. */
    public void revoke(String by, Instant now) {
        if (revokedAt != null) return;
        revokedAt = micros(now); revokedBy = by;
    }

    public String getOwnerSubject() { return ownerSubject; }
    public String getCoverSubject() { return coverSubject; }
    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public String getReason() { return reason; }
    public Instant getRevokedAt() { return revokedAt; }
}
