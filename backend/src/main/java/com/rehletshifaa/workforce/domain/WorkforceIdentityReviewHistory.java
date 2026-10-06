package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Append-only history of an identity review: one row per revision. */
@Entity
@Immutable
@Table(name = "workforce_identity_review_history")
public class WorkforceIdentityReviewHistory extends AssignedIdEntity {
    @Column(name = "review_id", nullable = false) private UUID reviewId;
    @Column(nullable = false, length = 30) private String status;
    @Column(nullable = false, length = 255) private String actor;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;
    @Column(nullable = false) private long revision;

    protected WorkforceIdentityReviewHistory() {}

    public WorkforceIdentityReviewHistory(UUID reviewId, String status, String actor, String reason, Instant recordedAt, long revision) {
        super(UUID.randomUUID());
        this.reviewId = reviewId; this.status = status; this.actor = actor; this.reason = reason;
        this.recordedAt = micros(recordedAt); this.revision = revision;
    }

    public UUID getReviewId() { return reviewId; }
    public String getStatus() { return status; }
    public String getActor() { return actor; }
    public String getReason() { return reason; }
    public Instant getRecordedAt() { return recordedAt; }
    public long getRevision() { return revision; }
}
