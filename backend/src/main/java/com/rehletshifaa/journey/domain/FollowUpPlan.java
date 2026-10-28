package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A planned follow-up after treatment. */
@Entity
@Table(name = "follow_up_plans")
public class FollowUpPlan extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "practitioner_id") private UUID practitionerId;
    @Column(name = "due_at", nullable = false) private Instant dueAt;
    @Column(nullable = false, length = 40) private String mode;
    @Column(name = "required_tests", columnDefinition = "text") private String requiredTests;
    @Column(columnDefinition = "text") private String instructions;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "closure_reason", length = 500) private String closureReason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected FollowUpPlan() {}

    public FollowUpPlan(UUID id, UUID caseId, UUID practitionerId, Instant dueAt, String mode, String requiredTests,
                        String instructions, Instant now) {
        super(id);
        this.caseId = caseId; this.practitionerId = practitionerId; this.dueAt = micros(dueAt);
        this.mode = mode; this.requiredTests = requiredTests; this.instructions = instructions; this.status = "PLANNED";
        this.createdAt = micros(now); this.updatedAt = micros(now);
    }

    public UUID getCaseId() { return caseId; }
    public UUID getPractitionerId() { return practitionerId; }
    public String getRequiredTests() { return requiredTests; }
    public String getInstructions() { return instructions; }
    public Instant getDueAt() { return dueAt; }
    public String getMode() { return mode; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
