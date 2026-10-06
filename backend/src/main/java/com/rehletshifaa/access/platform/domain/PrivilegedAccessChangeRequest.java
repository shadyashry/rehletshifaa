package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A maker/checker request to appoint or remove a System Administrator; decided once, or expires. */
@Entity
@Table(name = "privileged_access_change_requests")
public class PrivilegedAccessChangeRequest extends AssignedIdEntity {
    @Column(name = "change_type", nullable = false, length = 20) private String changeType;
    @Column(nullable = false) private String subject;
    @Column(name = "assignment_id") private UUID assignmentId;
    @Column(name = "assignment_revision") private Long assignmentRevision;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "requested_by", nullable = false) private String requestedBy;
    @Column(name = "request_reason", nullable = false, length = 1000) private String requestReason;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(nullable = false) private long revision;

    protected PrivilegedAccessChangeRequest() {}

    public PrivilegedAccessChangeRequest(UUID id, String changeType, String subject, UUID assignmentId, Long assignmentRevision,
                                         Instant effectiveFrom, Instant effectiveTo, String requestedBy, String requestReason,
                                         Instant requestedAt, Instant expiresAt) {
        super(id);
        this.changeType = changeType; this.subject = subject; this.assignmentId = assignmentId; this.assignmentRevision = assignmentRevision;
        this.effectiveFrom = micros(effectiveFrom); this.effectiveTo = micros(effectiveTo); this.status = "PENDING";
        this.requestedBy = requestedBy; this.requestReason = requestReason; this.requestedAt = micros(requestedAt); this.expiresAt = micros(expiresAt);
    }

    public String getChangeType() { return changeType; }
    public String getSubject() { return subject; }
    public UUID getAssignmentId() { return assignmentId; }
    public Long getAssignmentRevision() { return assignmentRevision; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
    public Instant getEffectiveTo() { return effectiveTo; }
    public String getStatus() { return status; }
    public String getRequestedBy() { return requestedBy; }
    public Instant getExpiresAt() { return expiresAt; }
    public long getRevision() { return revision; }
}
