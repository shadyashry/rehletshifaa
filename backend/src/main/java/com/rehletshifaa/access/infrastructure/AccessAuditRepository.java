package com.rehletshifaa.access.infrastructure;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class AccessAuditRepository {
    private final JdbcClient jdbc;
    private final Clock clock;
    public AccessAuditRepository(JdbcClient jdbc, Clock clock) { this.jdbc=jdbc; this.clock=clock; }
    /** Denials survive rollback of the rejected business transaction. Successful changes remain atomic. */
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void denied(String actor, String entity, String permission, String reason) {
        record(actor,entity,"ACCESS_DENIED","DENY",permission+":"+reason);
    }
    public void record(String actor, String entity, String action, String outcome, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) VALUES(?,'ACCESS_GOVERNANCE',?,'CAPABILITY','AccessGovernance',?,?,?,?,?)")
                .params(UUID.randomUUID(),actor,entity,action,outcome,reason,timestamp(clock.instant())).update();
    }
    public List<Entry> list(int offset) {
        return jdbc.sql("SELECT actor_subject,entity_id,action,outcome,reason,occurred_at FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' ORDER BY occurred_at DESC,id DESC LIMIT 100 OFFSET ?")
                .param(offset).query((r,n)->new Entry(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getTimestamp(6).toInstant())).list();
    }
    public record Entry(String actor, String entity, String action, String outcome, String reason, Instant occurredAt) {}
    public boolean editedVersion(String actor, UUID version) {
        return jdbc.sql("SELECT COUNT(*) FROM audit_events WHERE event_type='ACCESS_GOVERNANCE' AND entity_id=? AND actor_subject=? AND action='DRAFT_SAVED'")
                .params(version.toString(),actor).query(Long.class).single()>0;
    }
}
