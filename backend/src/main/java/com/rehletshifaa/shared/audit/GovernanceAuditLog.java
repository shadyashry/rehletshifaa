package com.rehletshifaa.shared.audit;

import com.rehletshifaa.shared.persistence.OffsetPageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The governance audit trail (access, workforce, journey governance). Denials survive rollback; successful changes stay atomic. */
@Component
public class GovernanceAuditLog {
    static final String EVENT_TYPE = "ACCESS_GOVERNANCE";
    private static final int PAGE_SIZE = 100;

    private final AuditTrail audit;
    private final AuditEventRepository events;

    public GovernanceAuditLog(AuditTrail audit, AuditEventRepository events) { this.audit = audit; this.events = events; }

    /** Denials survive rollback of the rejected business transaction. Successful changes remain atomic. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void denied(String actor, String entity, String permission, String reason) {
        record(actor, entity, "ACCESS_DENIED", "DENY", permission + ":" + reason);
    }

    /** Read evidence must survive a surrounding read-only transaction. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void supervisoryRead(String actor, String caseId, String permission) {
        record(actor, caseId, "SUPERVISORY_READ", "SUCCESS", permission);
    }

    public void record(String actor, String entity, String action, String outcome, String reason) { record(actor, entity, action, outcome, reason, null); }

    /**
     * {@code reason} is the system's technical detail; {@code governanceReason} is what the person said when they made the
     * change (J-1: governed Journey actions), kept separately so neither has to be parsed out of the other.
     */
    public void record(String actor, String entity, String action, String outcome, String reason, String governanceReason) {
        audit.event(EVENT_TYPE).actor(actor, "PRINCIPAL").entity("Governance", entity).action(action).outcome(outcome)
                .reason(reason).governanceReason(governanceReason).record();
    }

    public List<Entry> list(int offset) { return list(offset, null, null, null, null); }

    public List<Entry> list(int offset, String actor, String action, Instant from, Instant to) {
        Specification<AuditEvent> filter = (root, query, cb) -> cb.equal(root.get("eventType"), EVENT_TYPE);
        if (actor != null) filter = filter.and((root, query, cb) -> cb.equal(root.get("actorSubject"), actor));
        if (action != null) filter = filter.and((root, query, cb) -> cb.equal(root.get("action"), action));
        if (from != null) filter = filter.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("occurredAt"), micros(from)));
        if (to != null) filter = filter.and((root, query, cb) -> cb.lessThan(root.get("occurredAt"), micros(to)));
        Sort newestFirst = Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id"));
        return events.findAll(filter, OffsetPageRequest.of(offset, PAGE_SIZE, newestFirst)).stream()
                .map(e -> new Entry(e.getActorSubject(), e.getEntityId(), e.getAction(), e.getOutcome(), e.getReason(), e.getOccurredAt()))
                .toList();
    }

    public record Entry(String actor, String entity, String action, String outcome, String reason, Instant occurredAt) {}
}
