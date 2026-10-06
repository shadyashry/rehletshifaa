package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** STF-04/05: the review of one invitation whose email may already belong to an identity. One per invitation. */
@Entity
@Table(name = "workforce_identity_reviews")
public class WorkforceIdentityReview extends AssignedIdEntity {
    @Column(name = "invitation_id", nullable = false, unique = true) private UUID invitationId;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "resolved_subject", length = 255) private String resolvedSubject;
    @Column(name = "reviewed_by", length = 255) private String reviewedBy;
    @Column(name = "review_reason", nullable = false, length = 1000) private String reviewReason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "accepted_at") private Instant acceptedAt;
    @Column(nullable = false) private long revision;

    protected WorkforceIdentityReview() {}

    public WorkforceIdentityReview(UUID id, UUID invitationId, String status, String resolvedSubject, String reason, Instant now) {
        super(id);
        this.invitationId = invitationId; this.status = status; this.resolvedSubject = resolvedSubject; this.reviewReason = reason;
        this.createdAt = micros(now); this.updatedAt = micros(now);
    }

    public UUID getInvitationId() { return invitationId; }
    public String getStatus() { return status; }
    public String getResolvedSubject() { return resolvedSubject; }
    public String getReviewedBy() { return reviewedBy; }
    public String getReviewReason() { return reviewReason; }
    public long getRevision() { return revision; }
}
