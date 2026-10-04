package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class PlatformOwnerRecoveryStore {
    private final JdbcClient jdbc;
    private final PlatformAccessRepository access;
    private final GovernanceAuditLog audit;
    private final GovernanceNotificationOutbox notifications;

    public PlatformOwnerRecoveryStore(JdbcClient jdbc, PlatformAccessRepository access, GovernanceAuditLog audit,
            GovernanceNotificationOutbox notifications) {
        this.jdbc=jdbc;this.access=access;this.audit=audit;this.notifications=notifications;
    }

    public Recovery create(String currentOwner,String incoming,String actor,String reason,String evidence,String incident,
            Instant now,Instant expiresAt){
        access.lockGovernance();
        String actualOwner=jdbc.sql("SELECT r.subject FROM platform_account_owner_current c JOIN platform_account_owner_relationships r ON r.id=c.relationship_id WHERE c.id=1 AND r.status='ACTIVE' AND r.effective_to IS NULL")
                .query(String.class).optional().orElseThrow(()->new ApiException(409,"PLATFORM_OWNER_NOT_INITIALIZED","Platform ownership has not been initialized"));
        if(!actualOwner.equals(currentOwner))stale();
        if(!access.effectiveAdministrator(actor,now))
            throw new ApiException(403,"PRIVILEGED_APPROVER_REQUIRED","An effective System Administrator is required for owner recovery");
        if(access.effectiveAdministrators(now).size()<2)
            throw new ApiException(409,"OWNER_RECOVERY_ADMIN_QUORUM_UNAVAILABLE","Two effective System Administrators are required for owner recovery");
        if(jdbc.sql("SELECT COUNT(*) FROM platform_owner_recovery_requests WHERE status NOT IN ('COMPLETED','REJECTED','EXPIRED') AND expires_at>?")
                .param(timestamp(now)).query(Long.class).single()!=0)
            throw new ApiException(409,"OWNER_RECOVERY_ALREADY_PENDING","Complete or expire the existing owner recovery first");
        UUID id=UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_owner_recovery_requests(id,current_owner_subject,incoming_owner_subject,status,initiated_by,reason,evidence_reference,incident_reference,initiated_at,expires_at,revision) "
                +"VALUES(?,?,?,'PENDING_SECOND_ADMIN',?,?,?,?,?,?,0)")
                .params(id,currentOwner,incoming,actor,reason,evidence,incident,timestamp(now),timestamp(expiresAt)).update();
        audit.record(actor,id.toString(),"PLATFORM_OWNER_RECOVERY_INITIATED","SUCCESS","incomingOwner="+incoming+"; incident="+incident+"; "+reason);
        notifications.enqueue("OWNER_RECOVERY_INITIATED",id.toString(),"Unavailable-owner recovery was initiated; independent confirmation is required.",now);
        return byId(id);
    }

    public Recovery confirm(UUID id,long revision,String actor,String reason,Instant now){
        access.lockGovernance();
        if(!access.effectiveAdministrator(actor,now))
            throw new ApiException(403,"PRIVILEGED_APPROVER_REQUIRED","An effective System Administrator is required for owner recovery");
        Recovery recovery=forUpdate(id);pending(recovery,revision,"PENDING_SECOND_ADMIN",now);
        if(recovery.initiatedBy().equals(actor)||recovery.currentOwner().equals(actor)||recovery.incomingOwner().equals(actor)) independent();
        evidence(id,"SECOND_ADMIN_CONFIRMATION",actor,reason,null,true,now);
        transition(recovery,"PENDING_OPERATOR_VERIFICATION",now,null);
        audit.record(actor,id.toString(),"PLATFORM_OWNER_RECOVERY_ADMIN_CONFIRMED","SUCCESS",reason);
        notifications.enqueue("OWNER_RECOVERY_ADMIN_CONFIRMED",id.toString(),"A second independent System Administrator confirmed owner recovery.",now);
        return byId(id);
    }

    public Recovery verify(UUID id,long revision,String operator,String reason,String evidenceReference,boolean waive,Instant now){
        access.lockGovernance();Recovery recovery=forUpdate(id);pending(recovery,revision,"PENDING_OPERATOR_VERIFICATION",now);
        if(operator.equals(recovery.initiatedBy())||operator.equals(recovery.currentOwner())||operator.equals(recovery.incomingOwner())
                ||jdbc.sql("SELECT COUNT(*) FROM platform_owner_recovery_evidence WHERE request_id=? AND actor_subject=?")
                    .params(id,operator).query(Long.class).single()!=0) independent();
        evidence(id,"OPERATOR_VERIFICATION",operator,reason,evidenceReference,false,now);
        if(waive)evidence(id,"COOLING_OFF_WAIVER",operator,reason,evidenceReference,false,now);
        transition(recovery,"PENDING_SUCCESSOR_ACCEPTANCE",now,null);
        audit.record(operator,id.toString(),"PLATFORM_OWNER_RECOVERY_OPERATOR_VERIFIED","SUCCESS","waiveCoolingOff="+waive+"; "+reason);
        notifications.enqueue(waive?"OWNER_RECOVERY_COOLING_OFF_WAIVED":"OWNER_RECOVERY_OPERATOR_VERIFIED",id.toString(),
                waive?"The independent operator verified recovery and waived cooling-off under recorded evidence.":"The independent operator verified owner recovery.",now);
        return byId(id);
    }

    public Recovery accept(UUID id,long revision,String actor,String reason,Instant now){
        Recovery recovery=forUpdate(id);pending(recovery,revision,"PENDING_SUCCESSOR_ACCEPTANCE",now);
        if(!recovery.incomingOwner().equals(actor))throw new ApiException(403,"RECOVERY_SUCCESSOR_REQUIRED","Only the named successor can accept ownership recovery");
        evidence(id,"SUCCESSOR_ACCEPTANCE",actor,reason,null,true,now);
        boolean waived=jdbc.sql("SELECT COUNT(*) FROM platform_owner_recovery_evidence WHERE request_id=? AND evidence_type='COOLING_OFF_WAIVER'")
                .param(id).query(Long.class).single()==1;
        Instant until=waived?now:now.plusSeconds(24*60*60);
        transition(recovery,"COOLING_OFF",now,until);
        audit.record(actor,id.toString(),"PLATFORM_OWNER_RECOVERY_SUCCESSOR_ACCEPTED","SUCCESS","coolingOffUntil="+until+"; "+reason);
        notifications.enqueue("OWNER_RECOVERY_SUCCESSOR_ACCEPTED",id.toString(),"The nominated successor accepted recovered ownership; cooling-off is in progress.",now);
        return byId(id);
    }

    public Recovery reject(UUID id,long revision,String actor,String reason,Instant now){
        access.lockGovernance();Recovery recovery=forUpdate(id);
        if(!access.effectiveAdministrator(actor,now))
            throw new ApiException(403,"PRIVILEGED_APPROVER_REQUIRED","An effective System Administrator is required for owner recovery");
        if(recovery.revision()!=revision||List.of("COMPLETED","REJECTED","EXPIRED").contains(recovery.status()))stale();
        if(!recovery.expiresAt().isAfter(now))throw new ApiException(409,"OWNER_RECOVERY_EXPIRED","Owner recovery request expired");
        if(jdbc.sql("UPDATE platform_owner_recovery_requests SET status='REJECTED',revision=revision+1 WHERE id=? AND revision=?")
                .params(id,revision).update()!=1)stale();
        audit.record(actor,id.toString(),"PLATFORM_OWNER_RECOVERY_REJECTED","SUCCESS",reason);
        notifications.enqueue("OWNER_RECOVERY_REJECTED",id.toString(),"Unavailable-owner recovery was rejected by an effective System Administrator.",now);
        return byId(id);
    }

    public int expireDue(Instant now){
        access.lockGovernance();
        List<Recovery> expired=jdbc.sql("SELECT * FROM platform_owner_recovery_requests WHERE status NOT IN ('COOLING_OFF','COMPLETED','REJECTED','EXPIRED') AND expires_at<=? FOR UPDATE")
                .param(timestamp(now)).query(this::map).list();
        for(Recovery recovery:expired){
            if(jdbc.sql("UPDATE platform_owner_recovery_requests SET status='EXPIRED',revision=revision+1 WHERE id=? AND revision=?")
                    .params(recovery.id(),recovery.revision()).update()!=1)stale();
            audit.record("system:owner-recovery-scheduler",recovery.id().toString(),"PLATFORM_OWNER_RECOVERY_EXPIRED","SUCCESS","Recovery lifetime elapsed");
            notifications.enqueue("OWNER_RECOVERY_EXPIRED",recovery.id().toString(),"Unavailable-owner recovery expired without changing ownership.",now);
        }
        return expired.size();
    }

    public List<Recovery> due(Instant now){return jdbc.sql("SELECT * FROM platform_owner_recovery_requests WHERE status='COOLING_OFF' AND cooling_off_until<=? ORDER BY cooling_off_until")
            .param(timestamp(now)).query(this::map).list();}

    public Recovery complete(UUID id,long revision,String operator,Instant now){
        Recovery recovery=forUpdate(id);if(recovery.revision()!=revision||!recovery.status().equals("COOLING_OFF"))stale();
        if(recovery.coolingOffUntil()==null||recovery.coolingOffUntil().isAfter(now))
            throw new ApiException(409,"OWNER_RECOVERY_COOLING_OFF","The owner recovery cooling-off period has not ended");
        if(jdbc.sql("SELECT COUNT(DISTINCT evidence_type) FROM platform_owner_recovery_evidence WHERE request_id=? AND evidence_type IN ('SECOND_ADMIN_CONFIRMATION','OPERATOR_VERIFICATION','SUCCESSOR_ACCEPTANCE')")
                .param(id).query(Long.class).single()!=3)throw new ApiException(409,"OWNER_RECOVERY_EVIDENCE_INCOMPLETE","Owner recovery evidence is incomplete");
        if(jdbc.sql("UPDATE platform_owner_recovery_requests SET status='COMPLETED',completed_at=?,revision=revision+1 WHERE id=? AND revision=? AND status='COOLING_OFF'")
                .params(timestamp(now),id,revision).update()!=1)stale();
        audit.record(operator,id.toString(),"PLATFORM_OWNER_RECOVERY_COMPLETED","SUCCESS","incomingOwner="+recovery.incomingOwner());
        notifications.enqueue("OWNER_RECOVERY_COMPLETED",id.toString(),"Unavailable-owner recovery completed and ownership authority moved immediately.",now);
        return byId(id);
    }

    public Recovery byId(UUID id){return jdbc.sql("SELECT * FROM platform_owner_recovery_requests WHERE id=?").param(id).query(this::map).optional()
            .orElseThrow(()->new ApiException(404,"OWNER_RECOVERY_NOT_FOUND","Owner recovery request not found"));}
    private Recovery forUpdate(UUID id){return jdbc.sql("SELECT * FROM platform_owner_recovery_requests WHERE id=? FOR UPDATE").param(id).query(this::map).optional()
            .orElseThrow(()->new ApiException(404,"OWNER_RECOVERY_NOT_FOUND","Owner recovery request not found"));}
    private void evidence(UUID request,String type,String actor,String reason,String reference,boolean phishing,Instant now){
        jdbc.sql("INSERT INTO platform_owner_recovery_evidence(id,request_id,evidence_type,actor_subject,reason,evidence_reference,phishing_resistant_authentication,recorded_at) VALUES(?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(),request,type,actor,reason,reference,phishing,timestamp(now)).update();}
    private void transition(Recovery r,String status,Instant now,Instant cooling){if(jdbc.sql("UPDATE platform_owner_recovery_requests SET status=?,cooling_off_until=?,revision=revision+1 WHERE id=? AND revision=?")
            .params(status,timestamp(cooling),r.id(),r.revision()).update()!=1)stale();}
    private void pending(Recovery r,long revision,String status,Instant now){if(r.revision()!=revision||!r.status().equals(status))stale();if(!r.expiresAt().isAfter(now))throw new ApiException(409,"OWNER_RECOVERY_EXPIRED","Owner recovery request expired");}
    private Recovery map(ResultSet rs,int n)throws SQLException{return new Recovery(rs.getObject("id",UUID.class),rs.getString("current_owner_subject"),rs.getString("incoming_owner_subject"),rs.getString("status"),rs.getString("initiated_by"),rs.getString("reason"),rs.getString("evidence_reference"),rs.getString("incident_reference"),rs.getTimestamp("initiated_at").toInstant(),rs.getTimestamp("expires_at").toInstant(),rs.getTimestamp("cooling_off_until")==null?null:rs.getTimestamp("cooling_off_until").toInstant(),rs.getLong("revision"));}
    private static void independent(){throw new ApiException(409,"INDEPENDENT_OWNER_RECOVERY_ACTOR_REQUIRED","Owner recovery requires an independent actor");}
    private static void stale(){throw new ApiException(409,"STALE_OWNER_RECOVERY","Owner recovery changed; reload and try again");}
    public record Recovery(UUID id,String currentOwner,String incomingOwner,String status,String initiatedBy,String reason,String evidenceReference,String incidentReference,Instant initiatedAt,Instant expiresAt,Instant coolingOffUntil,long revision){}
}
