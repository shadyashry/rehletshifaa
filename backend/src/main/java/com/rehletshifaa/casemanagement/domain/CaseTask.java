package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.DynamicUpdate;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A unit of case work: an INTERNAL staff work item or a PATIENT_ACTION the patient completes. Title, description and
 * completion evidence are stored encrypted by the caller. Status changes are guarded updates in
 * {@code CaseTaskRepository}; {@code version} is managed explicitly.
 */
@Entity
@DynamicUpdate
@Table(name = "case_tasks")
public class CaseTask extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "task_type", nullable = false, length = 80) private String taskType;
    @Column(nullable = false, length = 240) private String title;
    @Column(columnDefinition = "text") private String description;
    @Column(name = "owner_subject") private String ownerSubject;
    @Column(name = "owner_role", length = 40) private String ownerRole;
    @Column(nullable = false, length = 20) private String priority;
    @Column(nullable = false, length = 30) private String status;
    @Column(nullable = false) private boolean blocking;
    @Column(name = "due_at") private Instant dueAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "completion_evidence", columnDefinition = "text") private String completionEvidence;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;
    @Column(name = "visibility_scope", nullable = false, length = 30) private String visibilityScope;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "cancellation_reason", length = 500) private String cancellationReason;
    @Column(name = "coordination_team_id") private UUID coordinationTeamId;
    @Column(name = "coordination_queue_reason", length = 100) private String coordinationQueueReason;
    @Column(name = "coordination_queued_at") private Instant coordinationQueuedAt;
    @Column(name = "copy_code", length = 80) private String copyCode;
    @Column(name = "copy_params", columnDefinition = "text") private String copyParams;

    protected CaseTask() {}

    /** A new OPEN task. {@code title} and {@code description} arrive already encrypted. */
    public CaseTask(UUID id, UUID caseId, String taskType, String title, String description, String ownerSubject, String ownerRole,
                    String visibilityScope, String priority, boolean blocking, Instant dueAt, String createdBy, Instant now) {
        super(id);
        this.caseId = caseId; this.taskType = taskType; this.title = title; this.description = description;
        this.ownerSubject = ownerSubject; this.ownerRole = ownerRole; this.visibilityScope = visibilityScope; this.priority = priority;
        this.status = "OPEN"; this.blocking = blocking; this.dueAt = dueAt == null ? null : micros(dueAt); this.createdBy = createdBy;
        this.createdAt = micros(now); this.updatedAt = micros(now);
    }

    /** The message code and (already encrypted) parameters the portal words this task from. */
    public CaseTask withCopy(String code, String encryptedParams) { this.copyCode = code; this.copyParams = encryptedParams; return this; }

    public UUID getCaseId() { return caseId; }
    public String getTaskType() { return taskType; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getOwnerSubject() { return ownerSubject; }
    public String getOwnerRole() { return ownerRole; }
    public String getPriority() { return priority; }
    public String getStatus() { return status; }
    public boolean isBlocking() { return blocking; }
    public Instant getDueAt() { return dueAt; }
    public String getVisibilityScope() { return visibilityScope; }
    public Instant getCreatedAt() { return createdAt; }
    public long getVersion() { return version; }
}
