package com.rehletshifaa.access.infrastructure;

import com.rehletshifaa.access.domain.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.util.*;
import java.time.Instant;
import java.sql.ResultSet;
import java.sql.SQLException;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;
import static com.rehletshifaa.access.infrastructure.RoleTemplateRepository.instant;

@Repository
public class RoleAssignmentRepository {
    private final JdbcClient jdbc;
    public RoleAssignmentRepository(JdbcClient jdbc) { this.jdbc=jdbc; }
    /** Serialize subject creation as well as mutations; no check-then-insert race. */
    public void lockSubject(String subject) {
        jdbc.sql("SELECT id FROM access_bootstrap WHERE id=1 FOR UPDATE").query(Integer.class).single();
        jdbc.sql("INSERT INTO access_subjects(subject,active,revision) SELECT ?,TRUE,0 WHERE NOT EXISTS (SELECT 1 FROM access_subjects WHERE subject=?)")
                .params(subject,subject).update();
        jdbc.sql("SELECT subject FROM access_subjects WHERE subject=? FOR UPDATE").param(subject).query(String.class).single();
    }
    public void membership(String subject, UUID org, String status, String actor, String reason, Instant now) {
        jdbc.sql("INSERT INTO access_memberships(subject,organization_id,status,effective_from,revision,created_by,reason) SELECT ?,?,?,?,0,?,? WHERE NOT EXISTS (SELECT 1 FROM access_memberships WHERE subject=? AND organization_id=?)")
                .params(subject,org,status,timestamp(now),actor,reason,subject,org).update();
    }
    public boolean activeMember(String subject, UUID organization, Instant now) {
        return jdbc.sql("SELECT COUNT(*) FROM access_memberships m JOIN access_subjects s ON s.subject=m.subject WHERE m.subject=? AND m.organization_id=? AND s.active=TRUE AND m.status='ACTIVE' AND m.effective_from<=? AND (m.effective_to IS NULL OR m.effective_to>?)")
                .params(subject,organization,timestamp(now),timestamp(now)).query(Long.class).single()>0;
    }
    public Optional<Membership> membership(String subject,UUID organization) {
        return jdbc.sql("SELECT m.*,s.active FROM access_memberships m JOIN access_subjects s ON s.subject=m.subject WHERE m.subject=? AND m.organization_id=?")
                .params(subject,organization).query((r,n)->new Membership(r.getObject("organization_id",UUID.class),
                        r.getString("status"),r.getBoolean("active"),instant(r,"effective_from"),instant(r,"effective_to"))).optional();
    }
    public record Membership(UUID organizationId,String status,boolean accountActive,Instant effectiveFrom,Instant effectiveTo) {}
    public List<RoleAssignment> assignments(String subject, UUID org) {
        return jdbc.sql("SELECT * FROM role_assignments WHERE subject=? AND organization_id=? ORDER BY effective_from,id")
                .params(subject,org).query(this::map).list();
    }
    public List<RoleAssignment> allForSubject(String subject) {
        return jdbc.sql("SELECT * FROM role_assignments WHERE subject=? AND status<>'REVOKED' ORDER BY id")
                .param(subject).query(this::map).list();
    }
    public RoleAssignment get(UUID id, UUID org) {
        return jdbc.sql("SELECT * FROM role_assignments WHERE id=? AND organization_id=?").params(id,org).query(this::map).optional()
                .orElseThrow(()->new ApiException(404,"ASSIGNMENT_NOT_FOUND","Access assignment not found"));
    }
    public void insert(RoleAssignment a) {
        jdbc.sql("INSERT INTO role_assignments(id,subject,version_id,organization_id,scope_type,target_type,target_id,effective_from,effective_to,status,source,assigned_by,reason,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)")
                .params(a.id(),a.subject(),a.versionId(),a.organizationId(),a.scope().name(),a.targetType(),a.targetId(),
                        timestamp(a.effectiveFrom()),timestamp(a.effectiveTo()),a.status(),a.source(),a.assignedBy(),a.reason()).update();
    }
    public void revoke(UUID id, long revision, Instant now) {
        if(jdbc.sql("UPDATE role_assignments SET status='REVOKED',revoked_at=?,revision=revision+1 WHERE id=? AND revision=? AND status<>'REVOKED'")
                .params(timestamp(now),id,revision).update()!=1) throw new ApiException(409,"STALE_ASSIGNMENT","Access assignment changed");
    }
    public boolean bootstrapCompleted() {
        jdbc.sql("SELECT id FROM access_bootstrap WHERE id=1 FOR UPDATE").query(Integer.class).single();
        return jdbc.sql("SELECT COUNT(*) FROM access_bootstrap WHERE id=1 AND completed_at IS NOT NULL").query(Long.class).single()>0;
    }
    public void completeBootstrap(String subject, Instant now) {
        jdbc.sql("UPDATE access_bootstrap SET completed_at=?,subject=? WHERE id=1").params(timestamp(now),subject).update();
    }
    private RoleAssignment map(ResultSet r,int n)throws SQLException {
        return new RoleAssignment(r.getObject("id",UUID.class),r.getString("subject"),r.getObject("version_id",UUID.class),
                r.getObject("organization_id",UUID.class),ScopeType.valueOf(r.getString("scope_type")),r.getString("target_type"),
                r.getString("target_id"),instant(r,"effective_from"),instant(r,"effective_to"),r.getString("status"),
                r.getString("source"),r.getString("assigned_by"),r.getString("reason"),r.getLong("revision"));
    }
}
