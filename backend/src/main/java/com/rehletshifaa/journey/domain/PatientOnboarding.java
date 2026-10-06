package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A patient's onboarding for an accepted proposal: contact and identity verification, then completion. */
@Entity
@DynamicUpdate
@Table(name = "patient_onboardings")
public class PatientOnboarding extends AssignedIdEntity {
    @Column(name = "patient_id", nullable = false) private UUID patientId;
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "proposal_version_id") private UUID proposalVersionId;
    @Column(nullable = false, length = 40) private String state;
    @Column(name = "subject_type", length = 20) private String subjectType;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "contact_verified_at") private Instant contactVerifiedAt;
    @Column(name = "identity_verified_at") private Instant identityVerifiedAt;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected PatientOnboarding() {}

    /** An onboarding that starts now and expires at {@code expiresAt}. */
    public PatientOnboarding(UUID id, UUID patientId, UUID caseId, UUID proposalVersionId, Instant expiresAt, Instant now) {
        super(id);
        this.patientId = patientId; this.caseId = caseId; this.proposalVersionId = proposalVersionId; this.state = "IN_PROGRESS";
        this.startedAt = micros(now); this.expiresAt = micros(expiresAt); this.createdAt = micros(now); this.updatedAt = micros(now);
    }

    public String getState() { return state; }
    public String getSubjectType() { return subjectType; }
}
