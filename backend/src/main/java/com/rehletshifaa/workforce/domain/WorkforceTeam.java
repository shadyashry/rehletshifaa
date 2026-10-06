package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A team in one function (WF-04). Retired, never deleted. */
@Entity
@Table(name = "workforce_teams")
public class WorkforceTeam extends AssignedIdEntity {
    @Column(name = "function_key", nullable = false, length = 50) private String functionKey;
    @Column(nullable = false, length = 160) private String name;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_by", nullable = false, length = 255) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long revision;

    protected WorkforceTeam() {}

    public WorkforceTeam(UUID id, String functionKey, String name, String createdBy, Instant now) {
        super(id);
        this.functionKey = functionKey; this.name = name; this.status = "ACTIVE"; this.createdBy = createdBy;
        this.createdAt = micros(now); this.updatedAt = micros(now);
    }

    public String getFunctionKey() { return functionKey; }
    public String getName() { return name; }
    public String getStatus() { return status; }
    public long getRevision() { return revision; }
}
