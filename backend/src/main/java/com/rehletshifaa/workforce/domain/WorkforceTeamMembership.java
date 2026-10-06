package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** Membership of a person in a team (WF-04); ended, never deleted. */
@Entity
@Table(name = "workforce_team_memberships")
public class WorkforceTeamMembership extends AssignedIdEntity {
    @Column(name = "team_id", nullable = false) private UUID teamId;
    @Column(nullable = false, length = 255) private String subject;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_by", nullable = false, length = 255) private String createdBy;
    @Column(nullable = false, length = 500) private String reason;
    @Column(nullable = false) private long revision;

    protected WorkforceTeamMembership() {}

    public WorkforceTeamMembership(UUID id, UUID teamId, String subject, Instant effectiveFrom, String createdBy, String reason) {
        super(id);
        this.teamId = teamId; this.subject = subject; this.effectiveFrom = micros(effectiveFrom); this.status = "ACTIVE";
        this.createdBy = createdBy; this.reason = reason;
    }

    public UUID getTeamId() { return teamId; }
    public String getSubject() { return subject; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
    public Instant getEffectiveTo() { return effectiveTo; }
    public String getStatus() { return status; }
    public long getRevision() { return revision; }
}
