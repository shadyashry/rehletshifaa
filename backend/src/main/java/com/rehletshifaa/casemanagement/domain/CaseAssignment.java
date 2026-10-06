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
 * Who is responsible for a case in which role (coordinator, consultant, operations, finance). Status moves through
 * PENDING → ACTIVE → ENDED (or DECLINED) by guarded updates in {@code CaseAssignmentRepository}; {@code version}
 * is managed explicitly.
 */
@Entity
@DynamicUpdate
@Table(name = "case_assignments")
public class CaseAssignment extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "assignee_subject", nullable = false) private String assigneeSubject;
    @Column(name = "assignee_role", nullable = false, length = 40) private String assigneeRole;
    @Column(name = "assignment_type", nullable = false, length = 30) private String assignmentType;
    @Column(length = 100) private String pod;
    @Column(nullable = false, length = 30) private String status;
    @Column(nullable = false, length = 500) private String reason;
    @Column(name = "assigned_by", nullable = false) private String assignedBy;
    @Column(name = "assigned_at", nullable = false) private Instant assignedAt;
    @Column(name = "accepted_at") private Instant acceptedAt;
    @Column(name = "ended_at") private Instant endedAt;
    @Column(nullable = false) private long version;

    protected CaseAssignment() {}

    private CaseAssignment(UUID id, UUID caseId, String assigneeSubject, String assigneeRole, String assignmentType, String pod, String status,
                           String reason, String assignedBy, Instant assignedAt, Instant acceptedAt) {
        super(id);
        this.caseId = caseId; this.assigneeSubject = assigneeSubject; this.assigneeRole = assigneeRole; this.assignmentType = assignmentType;
        this.pod = pod; this.status = status; this.reason = reason; this.assignedBy = assignedBy; this.assignedAt = micros(assignedAt);
        this.acceptedAt = acceptedAt == null ? null : micros(acceptedAt);
    }

    /** An assignment the assignee still has to accept. */
    public static CaseAssignment pending(UUID id, UUID caseId, String subject, String role, String type, String pod, String reason,
                                        String assignedBy, Instant at) {
        return new CaseAssignment(id, caseId, subject, role, type, pod, "PENDING", reason, assignedBy, at, null);
    }

    /** An assignment that is in force at once (the routing engine's coordinator ownership). */
    public static CaseAssignment active(UUID caseId, String subject, String role, String type, String reason, String assignedBy, Instant at) {
        return new CaseAssignment(UUID.randomUUID(), caseId, subject, role, type, null, "ACTIVE", reason, assignedBy, at, at);
    }

    public UUID getCaseId() { return caseId; }
    public String getAssigneeSubject() { return assigneeSubject; }
    public String getAssigneeRole() { return assigneeRole; }
    public String getAssignmentType() { return assignmentType; }
    public String getPod() { return pod; }
    public String getStatus() { return status; }
    public String getReason() { return reason; }
    public String getAssignedBy() { return assignedBy; }
    public Instant getAssignedAt() { return assignedAt; }
    public Instant getAcceptedAt() { return acceptedAt; }
    public Instant getEndedAt() { return endedAt; }
    public long getVersion() { return version; }
}
