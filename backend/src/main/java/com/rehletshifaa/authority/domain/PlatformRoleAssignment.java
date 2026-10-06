package com.rehletshifaa.authority.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A platform-scoped role (System Administrator), granted only through an approved privileged change request. */
@Entity
@Table(name = "platform_role_assignments")
public class PlatformRoleAssignment extends AssignedIdEntity {
    @Column(nullable = false) private String subject;
    @Column(name = "role_key", nullable = false, length = 80) private String roleKey;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "assigned_by", nullable = false) private String assignedBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(nullable = false) private long revision;

    protected PlatformRoleAssignment() {}

    public PlatformRoleAssignment(UUID id, String subject, String roleKey, Instant effectiveFrom, Instant effectiveTo, String assignedBy,
                                  String reason, Instant createdAt) {
        super(id);
        this.subject = subject; this.roleKey = roleKey; this.effectiveFrom = micros(effectiveFrom); this.effectiveTo = micros(effectiveTo);
        this.status = "ACTIVE"; this.assignedBy = assignedBy; this.reason = reason; this.createdAt = micros(createdAt);
    }

    public String getSubject() { return subject; }
    public String getRoleKey() { return roleKey; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
    public Instant getEffectiveTo() { return effectiveTo; }
    public String getStatus() { return status; }
    public long getRevision() { return revision; }
}
