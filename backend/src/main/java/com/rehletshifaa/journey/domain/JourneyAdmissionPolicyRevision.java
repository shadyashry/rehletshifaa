package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A maker/checker revision of the policy that admits new cases to one exact journey version: prepared, then approved
 * (ACTIVE), rejected, paused or superseded. {@code revision} is the optimistic token for decisions.
 */
@Entity
@Table(name = "journey_admission_policy_revisions")
public class JourneyAdmissionPolicyRevision extends AssignedIdEntity {
    @Column(name = "journey_version_id", nullable = false) private UUID journeyVersionId;
    @Column(name = "eligibility_scope", nullable = false, length = 30) private String eligibilityScope;
    @Column(name = "care_categories", length = 1000) private String careCategories;
    @Column(nullable = false, length = 30) private String state;
    @Column(name = "prepared_by", nullable = false) private String preparedBy;
    @Column(name = "preparation_reason", nullable = false, length = 500) private String preparationReason;
    @Column(name = "prepared_at", nullable = false) private Instant preparedAt;
    @Column(name = "approved_by") private String approvedBy;
    @Column(name = "approval_reason", length = 500) private String approvalReason;
    @Column(name = "approved_at") private Instant approvedAt;
    @Column(name = "paused_by") private String pausedBy;
    @Column(name = "pause_reason", length = 500) private String pauseReason;
    @Column(name = "paused_at") private Instant pausedAt;
    @Column(nullable = false) private long revision;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected JourneyAdmissionPolicyRevision() {}

    /** A revision prepared for approval. {@code careCategories} is the comma-separated slug list. */
    public JourneyAdmissionPolicyRevision(UUID id, UUID journeyVersionId, String eligibilityScope, String careCategories, String preparedBy,
                                          String preparationReason, Instant now) {
        super(id);
        this.journeyVersionId = journeyVersionId; this.eligibilityScope = eligibilityScope; this.careCategories = careCategories;
        this.state = "PENDING_APPROVAL"; this.preparedBy = preparedBy; this.preparationReason = preparationReason;
        this.preparedAt = micros(now); this.updatedAt = micros(now);
    }

    public UUID getJourneyVersionId() { return journeyVersionId; }
    public String getEligibilityScope() { return eligibilityScope; }
    public String getCareCategories() { return careCategories; }
    public String getState() { return state; }
    public String getPreparedBy() { return preparedBy; }
    public String getPreparationReason() { return preparationReason; }
    public Instant getPreparedAt() { return preparedAt; }
    public String getApprovedBy() { return approvedBy; }
    public String getApprovalReason() { return approvalReason; }
    public Instant getApprovedAt() { return approvedAt; }
    public String getPausedBy() { return pausedBy; }
    public String getPauseReason() { return pauseReason; }
    public Instant getPausedAt() { return pausedAt; }
    public long getRevision() { return revision; }
}
