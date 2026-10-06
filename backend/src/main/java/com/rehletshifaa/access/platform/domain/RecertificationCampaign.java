package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** IAM-15: a periodic access review over one scope (privileged or standard roles). */
@Entity
@Table(name = "access_recertification_campaigns")
public class RecertificationCampaign extends AssignedIdEntity {
    @Column(nullable = false, length = 20) private String scope;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "started_by", nullable = false) private String startedBy;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "due_at", nullable = false) private Instant dueAt;
    @Column(name = "closed_at") private Instant closedAt;

    protected RecertificationCampaign() {}

    public RecertificationCampaign(UUID id, String scope, String startedBy, Instant startedAt, Instant dueAt) {
        super(id);
        this.scope = scope; this.status = "OPEN"; this.startedBy = startedBy; this.startedAt = micros(startedAt); this.dueAt = micros(dueAt);
    }

    public void close(Instant at) { status = "CLOSED"; closedAt = micros(at); }

    public String getScope() { return scope; }
    public String getStatus() { return status; }
    public String getStartedBy() { return startedBy; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getDueAt() { return dueAt; }
}
