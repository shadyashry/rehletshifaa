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

@Repository
public class PlatformAccessRepository {
    public static final String SYSTEM_ADMINISTRATOR = "SYSTEM_ADMINISTRATOR";
    private final JdbcClient jdbc;

    public PlatformAccessRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void lockGovernance() {
        jdbc.sql("SELECT id FROM platform_governance_lock WHERE id=1 FOR UPDATE").query(Integer.class).single();
    }

    public boolean effectiveAdministrator(String subject, Instant at) {
        return effectiveAdministrators(at).stream().anyMatch(subject::equals);
    }

    /** Explanation inputs only; {@link #effectiveAdministrator} remains the decision used by every endpoint and invariant. */
    public SubjectFacts subjectFacts(String subject, Instant at) {
        var person = jdbc.sql("SELECT p.lifecycle_status,p.mfa_enrolled,s.active FROM workforce_people p "
                        + "JOIN access_subjects s ON s.subject=p.subject WHERE p.subject=?")
                .param(subject).query((rs, n) -> new PersonRow(rs.getString(1), rs.getBoolean(2), rs.getBoolean(3))).optional();
        List<Assignment> assignments = jdbc.sql("SELECT id,subject,effective_from,effective_to,revision FROM platform_role_assignments "
                        + "WHERE subject=? AND role_key=? AND status='ACTIVE' AND (effective_to IS NULL OR effective_to>?) ORDER BY effective_from,id")
                .params(subject, SYSTEM_ADMINISTRATOR, timestamp(at)).query(this::mapAssignment).list();
        return new SubjectFacts(person.isPresent(), person.map(PersonRow::lifecycle).orElse(null),
                person.map(PersonRow::mfa).orElse(false), person.map(PersonRow::active).orElse(false), assignments);
    }

    private record PersonRow(String lifecycle, boolean mfa, boolean active) {}

    public boolean workforceSubject(String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_people WHERE subject=?").param(subject).query(Long.class).single() == 1;
    }

    public boolean administratorCandidateEligible(String subject) {
        return jdbc.sql("SELECT COUNT(*) FROM workforce_people p JOIN access_subjects s ON s.subject=p.subject "
                        + "WHERE p.subject=? AND p.lifecycle_status='ACTIVE' AND p.mfa_enrolled=TRUE "
                        + "AND p.phishing_resistant_mfa_enrolled=TRUE AND s.active=TRUE")
                .param(subject).query(Long.class).single() == 1;
    }

    public boolean governanceInitialized() {
        return jdbc.sql("SELECT COUNT(*) FROM platform_role_assignments WHERE role_key=?")
                .param(SYSTEM_ADMINISTRATOR).query(Long.class).single() > 0;
    }

    public boolean overlappingAdministratorAssignment(String subject, Instant from, Instant to) {
        return jdbc.sql("SELECT COUNT(*) FROM platform_role_assignments WHERE subject=? AND role_key=? AND status='ACTIVE' "
                        + "AND (? IS NULL OR effective_from<?) AND (effective_to IS NULL OR effective_to>?)")
                .params(subject, SYSTEM_ADMINISTRATOR, timestamp(to), timestamp(to), timestamp(from)).query(Long.class).single() > 0;
    }

    public List<String> effectiveAdministrators(Instant at) {
        return jdbc.sql("SELECT DISTINCT a.subject FROM platform_role_assignments a "
                        + "JOIN workforce_people p ON p.subject=a.subject "
                        + "JOIN access_subjects s ON s.subject=a.subject "
                        + "WHERE a.role_key=? AND a.status='ACTIVE' AND a.effective_from<=? "
                        + "AND (a.effective_to IS NULL OR a.effective_to>?) "
                        + "AND p.lifecycle_status='ACTIVE' AND p.mfa_enrolled=TRUE AND s.active=TRUE")
                .params(SYSTEM_ADMINISTRATOR, timestamp(at), timestamp(at)).query(String.class).list();
    }

    public List<Instant> administratorBoundaries(Instant now) {
        return jdbc.sql("SELECT effective_from AS boundary FROM platform_role_assignments WHERE role_key=? AND status='ACTIVE' AND effective_from>? "
                        + "UNION SELECT effective_to AS boundary FROM platform_role_assignments WHERE role_key=? AND status='ACTIVE' AND effective_to IS NOT NULL AND effective_to>=?")
                .params(SYSTEM_ADMINISTRATOR, timestamp(now), SYSTEM_ADMINISTRATOR, timestamp(now))
                .query((rs, n) -> rs.getTimestamp("boundary").toInstant()).list();
    }

    public boolean hasIndefiniteEligibleAdministrator() {
        return jdbc.sql("SELECT COUNT(*) FROM platform_role_assignments a "
                        + "JOIN workforce_people p ON p.subject=a.subject JOIN access_subjects s ON s.subject=a.subject "
                        + "WHERE a.role_key=? AND a.status='ACTIVE' AND a.effective_to IS NULL "
                        + "AND p.lifecycle_status='ACTIVE' AND p.mfa_enrolled=TRUE AND s.active=TRUE")
                .param(SYSTEM_ADMINISTRATOR).query(Long.class).single() > 0;
    }

    public Assignment insertAssignment(String subject, Instant from, Instant to, String actor, String reason, Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO platform_role_assignments(id,subject,role_key,effective_from,effective_to,status,assigned_by,reason,created_at,revision) VALUES(?,?,?,?,?,'ACTIVE',?,?,?,0)")
                .params(id, subject, SYSTEM_ADMINISTRATOR, timestamp(from), timestamp(to), actor, reason, timestamp(now)).update();
        return new Assignment(id, subject, from, to, 0);
    }

    public Assignment removableAssignment(String subject, Instant removalAt) {
        List<Assignment> rows = jdbc.sql("SELECT id,subject,effective_from,effective_to,revision FROM platform_role_assignments "
                        + "WHERE subject=? AND role_key=? AND status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>?) ORDER BY effective_from,id")
                .params(subject, SYSTEM_ADMINISTRATOR, timestamp(removalAt), timestamp(removalAt)).query(this::mapAssignment).list();
        if (rows.size() != 1) throw new ApiException(409, "ADMIN_ASSIGNMENT_AMBIGUOUS", "Select a subject with exactly one effective administrator assignment");
        return rows.getFirst();
    }

    public void removeAssignment(UUID id, long revision, Instant removalAt, Instant now) {
        int changed;
        if (!removalAt.isAfter(now)) {
            changed = jdbc.sql("UPDATE platform_role_assignments SET status='REVOKED',revoked_at=?,revision=revision+1 WHERE id=? AND revision=? AND status='ACTIVE'")
                    .params(timestamp(now), id, revision).update();
        } else {
            changed = jdbc.sql("UPDATE platform_role_assignments SET effective_to=?,revision=revision+1 WHERE id=? AND revision=? AND status='ACTIVE' AND (effective_to IS NULL OR effective_to>?)")
                    .params(timestamp(removalAt), id, revision, timestamp(removalAt)).update();
        }
        if (changed != 1) throw new ApiException(409, "STALE_ADMIN_ASSIGNMENT", "The administrator assignment changed; start a new request");
    }

    public ChangeRequest insertRequest(String type, String subject, Assignment assignment, Instant from, Instant to,
            String actor, String reason, Instant now, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO privileged_access_change_requests(id,change_type,subject,assignment_id,assignment_revision,effective_from,effective_to,status,requested_by,request_reason,requested_at,expires_at,revision) "
                        + "VALUES(?,?,?,?,?,?,?,'PENDING',?,?,?,?,0)")
                .params(id, type, subject, assignment == null ? null : assignment.id(), assignment == null ? null : assignment.revision(),
                        timestamp(from), timestamp(to), actor, reason, timestamp(now), timestamp(expiresAt)).update();
        return new ChangeRequest(id, type, subject, assignment == null ? null : assignment.id(), assignment == null ? null : assignment.revision(),
                from, to, "PENDING", actor, reason, expiresAt, 0, null, null, null, null);
    }

    public ChangeRequest requestForUpdate(UUID id) {
        return jdbc.sql("SELECT r.*,CAST(NULL AS VARCHAR) AS decided_by,CAST(NULL AS VARCHAR) AS approver_type,"
                        + "CAST(NULL AS VARCHAR) AS decision_reason,CAST(NULL AS TIMESTAMP WITH TIME ZONE) AS decided_at "
                        + "FROM privileged_access_change_requests r WHERE r.id=? FOR UPDATE").param(id).query(this::mapRequest).optional()
                .orElseThrow(() -> new ApiException(404, "CHANGE_REQUEST_NOT_FOUND", "Privileged change request not found"));
    }

    public ChangeRequest request(UUID id) {
        return jdbc.sql("SELECT r.*,d.decided_by,d.approver_type,d.reason AS decision_reason,d.decided_at "
                        + "FROM privileged_access_change_requests r LEFT JOIN privileged_access_change_decisions d ON d.request_id=r.id WHERE r.id=?")
                .param(id).query(this::mapRequest).optional()
                .orElseThrow(() -> new ApiException(404, "CHANGE_REQUEST_NOT_FOUND", "Privileged change request not found"));
    }

    public void decide(UUID id, long revision, String decision, String actor, String approverType, String reason, Instant now) {
        if (jdbc.sql("UPDATE privileged_access_change_requests SET status=?,revision=revision+1 WHERE id=? AND revision=? AND status='PENDING'")
                .params(decision, id, revision).update() != 1)
            throw new ApiException(409, "STALE_CHANGE_REQUEST", "The privileged change request changed; reload and try again");
        jdbc.sql("INSERT INTO privileged_access_change_decisions(request_id,decision,decided_by,reason,decided_at,approver_type) VALUES(?,?,?,?,?,?)")
                .params(id, decision, actor, reason, timestamp(now), approverType).update();
    }

    /** Current and scheduled System Administrator assignments, earliest first. */
    public List<Assignment> administratorAssignments(Instant at) {
        return jdbc.sql("SELECT id,subject,effective_from,effective_to,revision FROM platform_role_assignments WHERE role_key=? AND status='ACTIVE' "
                        + "AND (effective_to IS NULL OR effective_to>?) ORDER BY effective_from,id")
                .params(SYSTEM_ADMINISTRATOR, timestamp(at)).query(this::mapAssignment).list();
    }

    /** Pending requests first, then the most recent decided ones (bounded). */
    public List<ChangeRequest> recentRequests(int limit) {
        return jdbc.sql("SELECT r.*,d.decided_by,d.approver_type,d.reason AS decision_reason,d.decided_at "
                        + "FROM privileged_access_change_requests r LEFT JOIN privileged_access_change_decisions d ON d.request_id=r.id "
                        + "ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.expires_at DESC,r.id LIMIT " + limit)
                .query(this::mapRequest).list();
    }

    public void expire(UUID id, long revision) {
        jdbc.sql("UPDATE privileged_access_change_requests SET status='EXPIRED',revision=revision+1 WHERE id=? AND revision=? AND status='PENDING'")
                .params(id, revision).update();
    }

    private Assignment mapAssignment(ResultSet rs, int row) throws SQLException {
        return new Assignment(rs.getObject("id", UUID.class), rs.getString("subject"), rs.getTimestamp("effective_from").toInstant(),
                rs.getTimestamp("effective_to") == null ? null : rs.getTimestamp("effective_to").toInstant(), rs.getLong("revision"));
    }

    private ChangeRequest mapRequest(ResultSet rs, int row) throws SQLException {
        return new ChangeRequest(rs.getObject("id", UUID.class), rs.getString("change_type"), rs.getString("subject"),
                rs.getObject("assignment_id", UUID.class), (Long) rs.getObject("assignment_revision"), rs.getTimestamp("effective_from").toInstant(),
                rs.getTimestamp("effective_to") == null ? null : rs.getTimestamp("effective_to").toInstant(), rs.getString("status"),
                rs.getString("requested_by"), rs.getString("request_reason"), rs.getTimestamp("expires_at").toInstant(), rs.getLong("revision"),
                rs.getString("decided_by"), rs.getString("approver_type"), rs.getString("decision_reason"),
                rs.getTimestamp("decided_at") == null ? null : rs.getTimestamp("decided_at").toInstant());
    }

    public record Assignment(UUID id, String subject, Instant effectiveFrom, Instant effectiveTo, long revision) {}
    /** Current and scheduled (not yet ended) System Administrator assignments plus the lifecycle facts they depend on. */
    public record SubjectFacts(boolean workforcePerson, String lifecycleStatus, boolean mfaEnrolled,
                               boolean accessSubjectActive, List<Assignment> administratorAssignments) {}
    public record ChangeRequest(UUID id, String type, String subject, UUID assignmentId, Long assignmentRevision,
                                Instant effectiveFrom, Instant effectiveTo, String status, String requestedBy, String requestReason,
                                Instant expiresAt, long revision, String decidedBy, String approverType,
                                String decisionReason, Instant decidedAt) {}
}
