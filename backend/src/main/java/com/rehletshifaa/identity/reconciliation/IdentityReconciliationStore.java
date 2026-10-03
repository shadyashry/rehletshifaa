package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.identity.IdentityProvisioningPort.IdentityState;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class IdentityReconciliationStore {
    private final JdbcClient jdbc;

    public IdentityReconciliationStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public UUID start(String trigger, String actor, String reason, Instant now) {
        UUID id=UUID.randomUUID();
        jdbc.sql("INSERT INTO identity_reconciliation_runs(id,trigger_type,status,requested_by,reason,started_at) VALUES(?,?,'RUNNING',?,?,?)")
                .params(id,trigger,actor,reason,timestamp(now)).update();
        return id;
    }

    public List<Person> people() {
        return jdbc.sql("SELECT p.subject,p.lifecycle_status,CASE WHEN EXISTS(SELECT 1 FROM platform_role_assignments a "
                        + "WHERE a.subject=p.subject AND a.role_key='SYSTEM_ADMINISTRATOR' AND a.status='ACTIVE') THEN TRUE ELSE FALSE END administrator "
                        + "FROM workforce_people p ORDER BY p.subject")
                .query((rs,n)->new Person(rs.getString("subject"),rs.getString("lifecycle_status"),rs.getBoolean("administrator"))).list();
    }

    @Transactional
    public Run apply(UUID runId, List<Observation> observations, Instant now) {
        jdbc.sql("SELECT id FROM platform_governance_lock WHERE id=1 FOR UPDATE").query(Integer.class).single();
        int discrepancies=0;
        for (Observation observation:observations) {
            Person person=observation.person(); IdentityState state=observation.state();
            jdbc.sql("UPDATE workforce_people SET mfa_enrolled=?,phishing_resistant_mfa_enrolled=?,updated_at=?,revision=revision+1 WHERE subject=?")
                    .params(state.exists()&&state.mfaEnrolled(),state.exists()&&state.phishingResistantMfaEnrolled(),timestamp(now),person.subject()).update();
            if(!state.exists()) discrepancies+=discrepancy(runId,person,"IDENTITY_NOT_FOUND",person.lifecycle(),"NOT_FOUND",now);
            else {
                boolean databaseEnabled=enabledLifecycle(person.lifecycle());
                if(databaseEnabled&&!state.enabled())discrepancies+=discrepancy(runId,person,"DATABASE_ACTIVE_IDENTITY_DISABLED",person.lifecycle(),"DISABLED",now);
                if(!databaseEnabled&&state.enabled())discrepancies+=discrepancy(runId,person,"DATABASE_INACTIVE_IDENTITY_ENABLED",person.lifecycle(),"ENABLED",now);
                if(databaseEnabled&&!state.mfaEnrolled())discrepancies+=discrepancy(runId,person,"MFA_NOT_ENROLLED",person.lifecycle(),"NO_MFA_CREDENTIAL",now);
                if(person.administrator()&&!state.phishingResistantMfaEnrolled())discrepancies+=discrepancy(runId,person,"PHISHING_RESISTANT_MFA_NOT_ENROLLED",person.lifecycle(),"NO_WEBAUTHN_CREDENTIAL",now);
            }
        }
        long targetAssignments=jdbc.sql("SELECT COUNT(*) FROM platform_role_assignments WHERE role_key='SYSTEM_ADMINISTRATOR'").query(Long.class).single();
        long effectiveAdministrators=jdbc.sql("SELECT COUNT(DISTINCT a.subject) FROM platform_role_assignments a "
                        + "JOIN workforce_people p ON p.subject=a.subject JOIN access_subjects s ON s.subject=a.subject "
                        + "WHERE a.role_key='SYSTEM_ADMINISTRATOR' AND a.status='ACTIVE' AND a.effective_from<=? "
                        + "AND (a.effective_to IS NULL OR a.effective_to>?) AND p.lifecycle_status='ACTIVE' AND p.mfa_enrolled=TRUE AND s.active=TRUE")
                .params(timestamp(now),timestamp(now)).query(Long.class).single();
        if(targetAssignments>0&&effectiveAdministrators==0) {
            Person platform=new Person("platform","ACTIVE",true);
            discrepancies+=discrepancy(runId,platform,"ZERO_EFFECTIVE_SYSTEM_ADMINISTRATORS","TARGET_GOVERNANCE_INITIALIZED","ZERO_EFFECTIVE",now);
        }
        String status=discrepancies==0?"PASSED":"DISCREPANCIES";
        jdbc.sql("UPDATE identity_reconciliation_runs SET status=?,completed_at=?,checked_count=?,discrepancy_count=? WHERE id=? AND status='RUNNING'")
                .params(status,timestamp(now),observations.size(),discrepancies,runId).update();
        if (status.equals("PASSED")) {
            jdbc.sql("UPDATE identity_restore_gate SET status='CLEARED',cleared_at=?,cleared_by_run_id=?,revision=revision+1 "
                            + "WHERE id=1 AND status='BLOCKED' AND EXISTS(SELECT 1 FROM identity_reconciliation_runs "
                            + "WHERE id=? AND trigger_type='POST_RESTORE' AND status='PASSED')")
                    .params(timestamp(now),runId,runId).update();
        }
        return get(runId);
    }

    public Run fail(UUID runId, int checked, Instant now) {
        jdbc.sql("UPDATE identity_reconciliation_runs SET status='FAILED',completed_at=?,checked_count=? WHERE id=? AND status='RUNNING'")
                .params(timestamp(now),checked,runId).update();
        return get(runId);
    }

    public List<Run> runs() {
        return jdbc.sql("SELECT * FROM identity_reconciliation_runs ORDER BY started_at DESC").query(this::run).list();
    }

    public List<Discrepancy> discrepancies(UUID runId) {
        return jdbc.sql("SELECT * FROM identity_reconciliation_discrepancies WHERE run_id=? ORDER BY subject,discrepancy_type,id")
                .param(runId).query((rs,n)->new Discrepancy(rs.getObject("id",UUID.class),rs.getObject("run_id",UUID.class),rs.getString("subject"),
                        rs.getString("discrepancy_type"),rs.getString("database_state"),rs.getString("identity_state"),rs.getTimestamp("detected_at").toInstant())).list();
    }

    private Run get(UUID id) { return jdbc.sql("SELECT * FROM identity_reconciliation_runs WHERE id=?").param(id).query(this::run).single(); }
    private Run run(ResultSet rs,int row)throws SQLException { return new Run(rs.getObject("id",UUID.class),rs.getString("trigger_type"),rs.getString("status"),
            rs.getString("requested_by"),rs.getString("reason"),rs.getTimestamp("started_at").toInstant(),instant(rs,"completed_at"),
            rs.getInt("checked_count"),rs.getInt("discrepancy_count")); }
    private int discrepancy(UUID run,Person person,String type,String database,String identity,Instant now){
        return jdbc.sql("INSERT INTO identity_reconciliation_discrepancies(id,run_id,subject,discrepancy_type,database_state,identity_state,detected_at) VALUES(?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(),run,person.subject(),type,database,identity,timestamp(now)).update();
    }
    private static boolean enabledLifecycle(String lifecycle){return lifecycle.equals("ACTIVE")||lifecycle.equals("INVITED");}
    private static Instant instant(ResultSet rs,String column)throws SQLException{var value=rs.getTimestamp(column);return value==null?null:value.toInstant();}

    public record Person(String subject,String lifecycle,boolean administrator) {}
    public record Observation(Person person,IdentityState state) {}
    public record Run(UUID id,String trigger,String status,String requestedBy,String reason,Instant startedAt,Instant completedAt,int checkedCount,int discrepancyCount) {}
    public record Discrepancy(UUID id,UUID runId,String subject,String type,String databaseState,String identityState,Instant detectedAt) {}
}
