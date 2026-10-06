package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** WF-02: a database business-role assignment, the authority for internal staff. Revoked, never deleted. */
@Entity
@Table(name = "workforce_role_assignments")
public class WorkforceRoleAssignment extends AssignedIdEntity {
    public static final String SOURCE_GRANT = "GRANT";
    public static final String SOURCE_INVITATION = "INVITATION";

    @Column(nullable = false, length = 255) private String subject;
    @Column(name = "role_key", nullable = false, length = 80) private String roleKey;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(nullable = false, length = 40) private String source;
    @Column(name = "assigned_by", nullable = false, length = 255) private String assignedBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "revoked_by", length = 255) private String revokedBy;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "revoke_reason", length = 1000) private String revokeReason;
    @Column(nullable = false) private long revision;

    protected WorkforceRoleAssignment() {}

    public WorkforceRoleAssignment(UUID id, String subject, String roleKey, Instant effectiveFrom, Instant effectiveTo, String source,
                                   String assignedBy, String reason, Instant createdAt) {
        super(id);
        this.subject = subject; this.roleKey = roleKey; this.effectiveFrom = micros(effectiveFrom); this.effectiveTo = micros(effectiveTo);
        this.status = "ACTIVE"; this.source = source; this.assignedBy = assignedBy; this.reason = reason; this.createdAt = micros(createdAt);
    }

    public String getSubject() { return subject; }
    public String getRoleKey() { return roleKey; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
    public Instant getEffectiveTo() { return effectiveTo; }
    public String getStatus() { return status; }
    public String getSource() { return source; }
    public String getAssignedBy() { return assignedBy; }
    public String getReason() { return reason; }
    public long getRevision() { return revision; }
}
