package com.rehletshifaa.directory.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One period during which a staff member owned Consultant Operations for a consultant (SOD-05). History is kept. */
@Entity
@Table(name = "consultant_operations_ownerships")
public class ConsultantOperationsOwnership extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "owner_subject", nullable = false) private String ownerSubject;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "assigned_by", nullable = false) private String assignedBy;
    @Column(nullable = false, length = 500) private String reason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "ended_by") private String endedBy;
    @Column(name = "end_reason", length = 500) private String endReason;
    @Column(nullable = false) private long revision;

    protected ConsultantOperationsOwnership() {}

    public ConsultantOperationsOwnership(UUID id, UUID practitionerId, String ownerSubject, Instant effectiveFrom, String assignedBy,
                                         String reason, Instant createdAt) {
        super(id);
        this.practitionerId = practitionerId; this.ownerSubject = ownerSubject; this.effectiveFrom = micros(effectiveFrom);
        this.status = "ACTIVE"; this.assignedBy = assignedBy; this.reason = reason; this.createdAt = micros(createdAt);
    }

    public UUID getPractitionerId() { return practitionerId; }
    public String getOwnerSubject() { return ownerSubject; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
    public Instant getEffectiveTo() { return effectiveTo; }
    public String getStatus() { return status; }
    public String getAssignedBy() { return assignedBy; }
    public String getReason() { return reason; }
    public String getEndedBy() { return endedBy; }
    public String getEndReason() { return endReason; }
    public long getRevision() { return revision; }
}
