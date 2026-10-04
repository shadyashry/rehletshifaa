package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class PlatformGovernanceBootstrapStore {
    private final JdbcClient jdbc;
    private final PlatformAccessRepository access;
    private final GovernanceAuditLog audit;

    public PlatformGovernanceBootstrapStore(JdbcClient jdbc, PlatformAccessRepository access, GovernanceAuditLog audit) {
        this.jdbc=jdbc;this.access=access;this.audit=audit;
    }

    public Optional<Result> completed() {
        return jdbc.sql("SELECT completed_at,owner_subject,first_administrator_subject,second_administrator_subject FROM platform_governance_bootstrap WHERE id=1 AND completed_at IS NOT NULL")
                .query((rs,n)->new Result(false,rs.getString(2),List.of(rs.getString(3),rs.getString(4)),rs.getTimestamp(1).toInstant())).optional();
    }

    @Transactional
    public Result initialize(String owner, List<String> administrators, Instant now) {
        access.lockGovernance();
        Bootstrap current=jdbc.sql("SELECT completed_at,owner_subject,first_administrator_subject,second_administrator_subject FROM platform_governance_bootstrap WHERE id=1 FOR UPDATE")
                .query((rs,n)->new Bootstrap(rs.getTimestamp(1)==null?null:rs.getTimestamp(1).toInstant(),rs.getString(2),rs.getString(3),rs.getString(4))).single();
        if(current.completedAt()!=null){
            if(current.owner().equals(owner)&&List.of(current.firstAdministrator(),current.secondAdministrator()).equals(administrators))
                return new Result(false,current.owner(),administrators,current.completedAt());
            throw new ApiException(409,"GOVERNANCE_ALREADY_BOOTSTRAPPED","Platform governance was already bootstrapped with different subjects");
        }
        for(String administrator:administrators){
            long eligible=jdbc.sql("SELECT COUNT(*) FROM workforce_people p JOIN access_subjects s ON s.subject=p.subject "
                            + "WHERE p.subject=? AND p.lifecycle_status='ACTIVE' AND s.active=TRUE")
                    .param(administrator).query(Long.class).single();
            if(eligible!=1)throw new ApiException(409,"INITIAL_ADMINISTRATOR_NOT_ELIGIBLE","Each initial administrator must be an active workforce person");
        }
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS(SELECT 1 FROM access_subjects WHERE subject=?)")
                .params(owner,owner).update();
        UUID relationship=UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_account_owner_relationships(id,subject,effective_from,status,created_by,reason,revision) VALUES(?,? ,?,'ACTIVE','DEPLOYMENT','Controlled initial governance handover',0)")
                .params(relationship,owner,timestamp(now)).update();
        jdbc.sql("INSERT INTO platform_account_owner_current(id,relationship_id) VALUES(1,?)").param(relationship).update();
        for(String administrator:administrators){
            jdbc.sql("UPDATE workforce_people SET mfa_enrolled=TRUE,phishing_resistant_mfa_enrolled=TRUE,updated_at=?,revision=revision+1 WHERE subject=?")
                    .params(timestamp(now),administrator).update();
            access.insertAssignment(administrator,now,null,"DEPLOYMENT","Controlled initial governance handover",now);
        }
        jdbc.sql("UPDATE platform_governance_bootstrap SET completed_at=?,owner_subject=?,first_administrator_subject=?,second_administrator_subject=? WHERE id=1 AND completed_at IS NULL")
                .params(timestamp(now),owner,administrators.get(0),administrators.get(1)).update();
        audit.record("DEPLOYMENT","platform","PLATFORM_GOVERNANCE_BOOTSTRAPPED","SUCCESS",
                "owner="+owner+"; initial administrators="+administrators.size()+"; credential evidence verified");
        return new Result(true,owner,administrators,now);
    }

    private record Bootstrap(Instant completedAt,String owner,String firstAdministrator,String secondAdministrator) {}
    public record Result(boolean created,String owner,List<String> administrators,Instant completedAt) {}
}
