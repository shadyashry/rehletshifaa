package com.rehletshifaa.casemanagement.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One status transition of a case (append-only history). */
@Entity
@Immutable
@Table(name = "case_status_history")
public class CaseStatusChange extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "from_status", length = 40) private String fromStatus;
    @Column(name = "to_status", nullable = false, length = 40) private String toStatus;
    @Column(name = "actor_subject", nullable = false) private String actorSubject;
    @Column(name = "actor_role", nullable = false, length = 40) private String actorRole;
    @Column(length = 1000) private String reason;
    @Column(name = "correlation_id", length = 128) private String correlationId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected CaseStatusChange() {}

    public CaseStatusChange(UUID caseId, String fromStatus, String toStatus, String actorSubject, String actorRole, String reason, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.fromStatus = fromStatus; this.toStatus = toStatus; this.actorSubject = actorSubject;
        this.actorRole = actorRole; this.reason = reason; this.createdAt = micros(at);
    }

    public UUID getCaseId() { return caseId; }
    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
    public String getActorSubject() { return actorSubject; }
    public String getActorRole() { return actorRole; }
    public String getReason() { return reason; }
    public Instant getCreatedAt() { return createdAt; }
}
