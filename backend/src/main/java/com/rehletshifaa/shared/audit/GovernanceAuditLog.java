package com.rehletshifaa.shared.audit;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** The governance audit trail (access, workforce, journey governance). Denials survive rollback; successful changes stay atomic. */
@Repository
public class GovernanceAuditLog {
    private final JdbcClient jdbc;
    private final Clock clock;
    public GovernanceAuditLog(JdbcClient jdbc, Clock clock) { this.jdbc=jdbc; this.clock=clock; }
    /** Denials survive rollback of the rejected business transaction. Successful changes remain atomic. */
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void denied(String actor, String entity, String permission, String reason) {
        record(actor,entity,"ACCESS_DENIED","DENY",permission+":"+reason);
    }
    /** Read evidence must survive a surrounding read-only transaction. */
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void supervisoryRead(String actor, String caseId, String permission) {
        record(actor,caseId,"SUPERVISORY_READ","SUCCESS",permission);
    }
    public void record(String actor, String entity, String action, String outcome, String reason) { record(actor,entity,action,outcome,reason,null); }
    /**
     * {@code reason} is the system's technical detail; {@code governanceReason} is what the person said when they made the
     * change (J-1: governed Journey actions), kept separately so neither has to be parsed out of the other.
     */
    public void record(String actor, String entity, String action, String outcome, String reason, String governanceReason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,governance_reason,occurred_at) VALUES(?,'ACCESS_GOVERNANCE',?,'PRINCIPAL','Governance',?,?,?,?,?,?)")
                .params(UUID.randomUUID(),actor,entity,action,outcome,reason,governanceReason,timestamp(clock.instant())).update();
    }
    public List<Entry> list(int offset) { return list(offset,null,null,null,null); }
    public List<Entry> list(int offset,String actor,String action,Instant from,Instant to) {
        StringBuilder sql=new StringBuilder("SELECT actor_subject,entity_id,action,outcome,reason,occurred_at FROM audit_events WHERE event_type='ACCESS_GOVERNANCE'");
        List<Object> params=new ArrayList<>();
        if(actor!=null) { sql.append(" AND actor_subject=?");params.add(actor); }
        if(action!=null) { sql.append(" AND action=?");params.add(action); }
        if(from!=null) { sql.append(" AND occurred_at>=?");params.add(timestamp(from)); }
        if(to!=null) { sql.append(" AND occurred_at<?");params.add(timestamp(to)); }
        sql.append(" ORDER BY occurred_at DESC,id DESC LIMIT 100 OFFSET ?");params.add(offset);
        return jdbc.sql(sql.toString()).params(params).query((r,n)->new Entry(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getTimestamp(6).toInstant())).list();
    }
    public record Entry(String actor, String entity, String action, String outcome, String reason, Instant occurredAt) {}
}
