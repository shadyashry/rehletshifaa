package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/** WF-02 business-role assignments. Callers hold the platform governance lock for every mutation. */
@Repository
public class WorkforceRoleAssignmentStore {
    private final JdbcClient jdbc;

    public WorkforceRoleAssignmentStore(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record RoleAssignment(UUID id, String subject, String role, String function, Instant effectiveFrom,
                                 Instant effectiveTo, String status, String source, String assignedBy, String reason,
                                 long revision) {}

    public List<RoleAssignment> forSubject(String subject) {
        return jdbc.sql(SELECT + "WHERE a.subject=? ORDER BY a.effective_from,a.id").param(subject).query(this::map).list();
    }

    public RoleAssignment forUpdate(UUID id) {
        return jdbc.sql(SELECT + "WHERE a.id=? FOR UPDATE").param(id).query(this::map).optional()
                .orElseThrow(() -> new ApiException(404, "ROLE_ASSIGNMENT_NOT_FOUND", "Role assignment not found"));
    }

    public Optional<String> lifecycle(String subject) {
        return jdbc.sql("SELECT lifecycle_status FROM workforce_people WHERE subject=?").param(subject).query(String.class).optional();
    }

    public Optional<String> activeRoleFunction(String role) {
        return jdbc.sql("SELECT function_key FROM workforce_role_catalogue WHERE role_key=? AND active=TRUE").param(role)
                .query(String.class).optional();
    }

    /** SOD-04: Consultant identities cannot hold an internal workforce role. */
    public boolean consultantIdentity(String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM practitioner_profiles WHERE external_subject=?").param(subject)
                .query(Long.class).single() > 0;
    }

    public boolean overlapping(String subject, String role, Instant from, Instant to) {
        if (to == null) {
            return jdbc.sql("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE' "
                            + "AND (effective_to IS NULL OR effective_to>?)")
                    .params(subject, role, timestamp(from)).query(Long.class).single() > 0;
        }
        return jdbc.sql("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE' "
                        + "AND effective_from<? AND (effective_to IS NULL OR effective_to>?)")
                .params(subject, role, timestamp(to), timestamp(from)).query(Long.class).single() > 0;
    }

    /**
     * SOD-04 conflict rules against every overlapping active assignment, including the platform-scope
     * {@code SYSTEM_ADMINISTRATOR} assignment. Returns the first violated rule reason.
     */
    public Optional<String> conflict(String subject, String role, Instant from, Instant to) {
        String base = "SELECT c.rule_reason FROM workforce_role_conflicts c JOIN ("
                        + "SELECT role_key,effective_from,effective_to FROM workforce_role_assignments WHERE subject=? AND status='ACTIVE' "
                        + "UNION ALL SELECT role_key,effective_from,effective_to FROM platform_role_assignments WHERE subject=? AND status='ACTIVE'"
                        + ") held ON held.role_key=c.conflicting_role_key "
                        + "WHERE c.role_key=? ";
        if (to == null) {
            return jdbc.sql(base + "AND (held.effective_to IS NULL OR held.effective_to>?) ORDER BY c.conflicting_role_key")
                    .params(subject, subject, role, timestamp(from)).query(String.class).list().stream().findFirst();
        }
        return jdbc.sql(base + "AND held.effective_from<? AND (held.effective_to IS NULL OR held.effective_to>?) ORDER BY c.conflicting_role_key")
                .params(subject, subject, role, timestamp(to), timestamp(from)).query(String.class).list().stream().findFirst();
    }

    /** Current or scheduled (not ended) active assignment of the role, from any source. */
    public boolean holds(String subject, String role, Instant at) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE' "
                        + "AND (effective_to IS NULL OR effective_to>?)")
                .params(subject, role, timestamp(at)).query(Long.class).single() > 0;
    }

    /** SOD-04 pair rule between two roles, independent of any assignment. */
    public Optional<String> pairConflict(String role, String other) {
        return jdbc.sql("SELECT rule_reason FROM workforce_role_conflicts WHERE role_key=? AND conflicting_role_key=?")
                .params(role, other).query(String.class).optional();
    }

    /** True when another assignment in the same function stays effective at {@code at}. */
    public boolean retainsFunction(String subject, String function, UUID excluded, Instant at) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_role_assignments a JOIN workforce_role_catalogue r ON r.role_key=a.role_key "
                        + "WHERE a.subject=? AND r.function_key=? AND a.id<>? AND a.status='ACTIVE' "
                        + "AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?)")
                .params(subject, function, excluded, timestamp(at), timestamp(at)).query(Long.class).single() > 0;
    }

    /** WF-12: the subject is the only current lead of an active team in the function that has other members. */
    public boolean onlyLeadOfStaffedTeam(String subject, String function, Instant at) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_teams t "
                        + "JOIN workforce_lead_designations l ON l.team_id=t.id AND l.subject=? AND l.status='ACTIVE' "
                        + "AND l.effective_from<=? AND (l.effective_to IS NULL OR l.effective_to>?) "
                        + "WHERE t.function_key=? AND t.status='ACTIVE' "
                        + "AND NOT EXISTS(SELECT 1 FROM workforce_lead_designations o WHERE o.team_id=t.id AND o.subject<>? AND o.status='ACTIVE' "
                        + "AND o.effective_from<=? AND (o.effective_to IS NULL OR o.effective_to>?)) "
                        + "AND EXISTS(SELECT 1 FROM workforce_team_memberships m WHERE m.team_id=t.id AND m.subject<>? AND m.status='ACTIVE' "
                        + "AND m.effective_from<=? AND (m.effective_to IS NULL OR m.effective_to>?))")
                .params(subject, timestamp(at), timestamp(at), function, subject, timestamp(at), timestamp(at),
                        subject, timestamp(at), timestamp(at)).query(Long.class).single() > 0;
    }

    /** WF-12: current direct reports in the function (each has exactly one current manager per function). */
    public boolean hasDirectReports(String subject, String function) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_current_managers WHERE manager_subject=? AND function_key=?")
                .params(subject, function).query(Long.class).single() > 0;
    }

    public RoleAssignment insert(String subject, String role, Instant from, Instant to, String actor, String reason, Instant now) {
        return insert(subject, role, from, to, "GRANT", actor, reason, now);
    }

    public RoleAssignment insert(String subject, String role, Instant from, Instant to, String source, String actor, String reason, Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO workforce_role_assignments(id,subject,role_key,effective_from,effective_to,status,source,assigned_by,reason,created_at,revision) "
                        + "VALUES(?,?,?,?,?,'ACTIVE',?,?,?,?,0)")
                .params(id, subject, role, timestamp(from), timestamp(to), source, actor, reason, timestamp(now)).update();
        return forUpdate(id);
    }

    public void revoke(RoleAssignment assignment, Instant removalAt, String actor, String reason, Instant now) {
        int changed = !removalAt.isAfter(now)
                ? jdbc.sql("UPDATE workforce_role_assignments SET status='REVOKED',revoked_by=?,revoked_at=?,revoke_reason=?,revision=revision+1 "
                                + "WHERE id=? AND revision=? AND status='ACTIVE'")
                        .params(actor, timestamp(now), reason, assignment.id(), assignment.revision()).update()
                : jdbc.sql("UPDATE workforce_role_assignments SET effective_to=?,revoked_by=?,revoke_reason=?,revision=revision+1 "
                                + "WHERE id=? AND revision=? AND status='ACTIVE' AND (effective_to IS NULL OR effective_to>?)")
                        .params(timestamp(removalAt), actor, reason, assignment.id(), assignment.revision(), timestamp(removalAt)).update();
        if (changed != 1) throw new ApiException(409, "STALE_ROLE_ASSIGNMENT", "The role assignment changed; reload and try again");
    }

    private static final String SELECT = "SELECT a.id,a.subject,a.role_key,r.function_key,a.effective_from,a.effective_to,a.status,"
            + "a.source,a.assigned_by,a.reason,a.revision FROM workforce_role_assignments a "
            + "JOIN workforce_role_catalogue r ON r.role_key=a.role_key ";

    private RoleAssignment map(ResultSet rs, int row) throws SQLException {
        return new RoleAssignment(rs.getObject("id", UUID.class), rs.getString("subject"), rs.getString("role_key"),
                rs.getString("function_key"), rs.getTimestamp("effective_from").toInstant(),
                rs.getTimestamp("effective_to") == null ? null : rs.getTimestamp("effective_to").toInstant(),
                rs.getString("status"), rs.getString("source"), rs.getString("assigned_by"), rs.getString("reason"),
                rs.getLong("revision"));
    }
}
