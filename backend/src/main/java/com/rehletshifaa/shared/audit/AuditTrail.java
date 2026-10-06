package com.rehletshifaa.shared.audit;

import com.rehletshifaa.shared.web.CorrelationIdFilter;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The single writer of {@code audit_events}. Each row joins the caller's transaction (a rolled-back change
 * leaves no audit row) and carries the request's correlation id, so an audit entry leads straight to the
 * request's logs in Kibana ({@code http.request.id}).
 *
 * <pre>{@code audit.event("CONSULTANT_CAPABILITY_APPROVED").actor(subject, role)
 *      .entity("Practitioner", practitionerId).action("APPROVE").reason(detail).record();}</pre>
 */
@Component
public class AuditTrail {
    private final AuditEventRepository events;
    private final Clock clock;

    public AuditTrail(AuditEventRepository events, Clock clock) { this.events = events; this.clock = clock; }

    public Entry event(String eventType) { return new Entry(eventType); }

    public final class Entry {
        private final String eventType;
        private String actorSubject = "SYSTEM";
        private String actorRole = "SYSTEM";
        private UUID caseId;
        private String entityType;
        private String entityId;
        private String action;
        private String outcome = "SUCCESS";
        private String reason;
        private String governanceReason;
        private Instant occurredAt;

        private Entry(String eventType) { this.eventType = Objects.requireNonNull(eventType, "eventType"); }

        public Entry actor(String subject, String role) { this.actorSubject = subject; this.actorRole = role; return this; }
        public Entry caseId(UUID caseId) { this.caseId = caseId; return this; }
        public Entry entity(String type, Object id) { this.entityType = type; this.entityId = String.valueOf(id); return this; }
        public Entry action(String action) { this.action = action; return this; }
        public Entry outcome(String outcome) { this.outcome = outcome; return this; }
        public Entry reason(String reason) { this.reason = reason; return this; }
        public Entry governanceReason(String governanceReason) { this.governanceReason = governanceReason; return this; }
        /** Defaults to now; pass the use case's own clock reading when the audit must match it exactly. */
        public Entry at(Instant occurredAt) { this.occurredAt = occurredAt; return this; }

        public void record() {
            // Flushed at once, like the INSERT it replaced: an idempotency check later in the same
            // transaction (and any remaining JDBC reader) must see the row.
            events.saveAndFlush(new AuditEvent(UUID.randomUUID(), eventType, actorSubject, actorRole, caseId,
                    Objects.requireNonNull(entityType, "entityType"), Objects.requireNonNull(entityId, "entityId"),
                    Objects.requireNonNull(action, "action"), outcome, reason, governanceReason,
                    MDC.get(CorrelationIdFilter.MDC_KEY), micros(occurredAt == null ? clock.instant() : occurredAt)));
        }
    }
}
