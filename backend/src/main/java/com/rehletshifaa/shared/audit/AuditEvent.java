package com.rehletshifaa.shared.audit;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

/** One append-only audit row. Written only through {@link AuditTrail}; never updated or deleted. */
@Entity
@Immutable
@Table(name = "audit_events")
public class AuditEvent extends AssignedIdEntity {
    @Column(name = "event_type", nullable = false, length = 100) private String eventType;
    @Column(name = "actor_subject", nullable = false) private String actorSubject;
    @Column(name = "actor_role", nullable = false, length = 40) private String actorRole;
    @Column(name = "case_id") private UUID caseId;
    @Column(name = "entity_type", nullable = false, length = 80) private String entityType;
    @Column(name = "entity_id", nullable = false) private String entityId;
    @Column(nullable = false, length = 100) private String action;
    @Column(nullable = false, length = 30) private String outcome;
    @Column(length = 1000) private String reason;
    @Column(name = "governance_reason", length = 500) private String governanceReason;
    @Column(name = "correlation_id", length = 128) private String correlationId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected AuditEvent() {}

    AuditEvent(UUID id, String eventType, String actorSubject, String actorRole, UUID caseId, String entityType, String entityId,
               String action, String outcome, String reason, String governanceReason, String correlationId, Instant occurredAt) {
        super(id);
        this.eventType = eventType; this.actorSubject = actorSubject; this.actorRole = actorRole; this.caseId = caseId;
        this.entityType = entityType; this.entityId = entityId; this.action = action; this.outcome = outcome; this.reason = reason;
        this.governanceReason = governanceReason; this.correlationId = correlationId; this.occurredAt = occurredAt;
    }

    public String getEventType() { return eventType; }
    public String getActorSubject() { return actorSubject; }
    public String getActorRole() { return actorRole; }
    public UUID getCaseId() { return caseId; }
    public String getEntityType() { return entityType; }
    public String getEntityId() { return entityId; }
    public String getAction() { return action; }
    public String getOutcome() { return outcome; }
    public String getReason() { return reason; }
    public String getGovernanceReason() { return governanceReason; }
    public String getCorrelationId() { return correlationId; }
    public Instant getOccurredAt() { return occurredAt; }
}
