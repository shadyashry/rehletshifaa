package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

/**
 * WF-04/05/10/11/12 hierarchy commands on the single platform team model.
 *
 * <p>Only the manager of the affected function may act, and the function is always read from server records (the
 * team or the reporting line), never from the request. System Administrator authority is not a path here
 * (D-11/D-13). Every command serializes on its function's catalogue row, is revision-protected, reasoned and audited,
 * and takes effect immediately, so a lead that loses a designation loses supervisory actions on the next request.
 * Shadow mode: the legacy V22 directory still drives live behaviour until cutover.</p>
 */
@Service
public class WorkforceHierarchyService {
    private static final Set<String> MEMBER_LIFECYCLES = Set.of("INVITED", "ACTIVE");
    private final JdbcClient jdbc;
    private final WorkforceAccessPolicy access;
    private final Clock clock;

    public WorkforceHierarchyService(JdbcClient jdbc, WorkforceAccessPolicy access, Clock clock) {
        this.jdbc = jdbc;
        this.access = access;
        this.clock = clock;
    }

    public record CreateTeam(String function, String name, String reason) {}
    public record Retire(long revision, String reason) {}
    public record AddMember(String subject, String reason) {}
    public record Designate(String subject, String reason) {}
    public record SetManager(String function, String staffSubject, String managerSubject, String reason) {}
    public record EndManager(String function, String staffSubject, long revision, String reason) {}
    public record Result(UUID id, long revision) {}

    private record Team(UUID id, String function, String status, long revision) {}
    private record Relation(UUID id, UUID teamId, String subject, String status, long revision, Instant effectiveFrom) {}

    @Transactional
    public Result createTeam(CreateTeam command) {
        String function = text(command.function(), 50, "Choose a function");
        var actor = manager(function);
        String name = text(command.name(), 160, "Name the team");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (jdbc.sql("SELECT COUNT(*) FROM workforce_teams WHERE function_key=? AND name=?").params(function, name).query(Long.class).single() > 0)
            throw new ApiException(409, "TEAM_NAME_EXISTS", "A team with this name already exists in the function");
        UUID id = UUID.randomUUID();
        Instant now = clock.instant();
        jdbc.sql("INSERT INTO workforce_teams(id,function_key,name,status,created_by,created_at,updated_at,revision) VALUES(?,?,?,'ACTIVE',?,?,?,0)")
                .params(id, function, name, actor, timestamp(now), timestamp(now)).update();
        audit(actor, "WorkforceTeam", id, "TEAM_CREATED", function + "; " + name, reason, now);
        return new Result(id, 0);
    }

    @Transactional
    public Result retireTeam(UUID teamId, Retire command) {
        Team team = team(teamId);
        var actor = manager(team.function());
        String reason = text(command.reason(), 500, "Give a reason for this change");
        Instant now = clock.instant();
        if (count("SELECT COUNT(*) FROM workforce_team_memberships WHERE team_id=? AND status='ACTIVE'", teamId) > 0)
            throw new ApiException(409, "TEAM_HAS_MEMBERS", "Move or end every membership before retiring the team");
        if (jdbc.sql("UPDATE workforce_teams SET status='RETIRED',updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND status='ACTIVE'")
                .params(timestamp(now), teamId, command.revision()).update() != 1) stale();
        audit(actor, "WorkforceTeam", teamId, "TEAM_RETIRED", team.function(), reason, now);
        return new Result(teamId, command.revision() + 1);
    }

    @Transactional
    public Result addMember(UUID teamId, AddMember command) {
        Team team = activeTeam(teamId);
        var actor = manager(team.function());
        String subject = text(command.subject(), 255, "Choose a workforce person");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        Instant now = clock.instant();
        String lifecycle = jdbc.sql("SELECT lifecycle_status FROM workforce_people WHERE subject=?").param(subject)
                .query(String.class).optional()
                .orElseThrow(() -> new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "Workforce person not found"));
        if (!MEMBER_LIFECYCLES.contains(lifecycle))
            throw new ApiException(409, "WORKFORCE_LIFECYCLE_NOT_ELIGIBLE", "Only invited or active people can join a team");
        if (!holdsFunctionRole(subject, team.function(), now))
            throw new ApiException(409, "FUNCTION_ROLE_REQUIRED", "The person needs an effective role in this function first");
        if (activeMembership(teamId, subject).isPresent())
            throw new ApiException(409, "ALREADY_TEAM_MEMBER", "The person is already a member of this team");
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO workforce_team_memberships(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE',?,?,0)")
                .params(id, teamId, subject, timestamp(startAfter("workforce_team_memberships", teamId, subject, now)), actor, reason).update();
        audit(actor, "WorkforceTeamMembership", id, "TEAM_MEMBER_ADDED", "team=" + teamId + "; subject=" + subject, reason, now);
        return new Result(id, 0);
    }

    @Transactional
    public Result endMembership(UUID membershipId, Retire command) {
        Relation membership = relation("workforce_team_memberships", membershipId);
        Team team = team(membership.teamId());
        var actor = manager(team.function());
        String reason = text(command.reason(), 500, "Give a reason for this change");
        Instant now = clock.instant();
        if (activeLead(team.id(), membership.subject()).isPresent())
            throw new ApiException(409, "END_LEAD_DESIGNATION_FIRST", "End this person's lead designation on the team first");
        end("workforce_team_memberships", membership, command.revision(), now);
        audit(actor, "WorkforceTeamMembership", membershipId, "TEAM_MEMBER_ENDED", "team=" + team.id() + "; subject=" + membership.subject(), reason, now);
        return new Result(membershipId, command.revision() + 1);
    }

    @Transactional
    public Result designateLead(UUID teamId, Designate command) {
        Team team = activeTeam(teamId);
        var actor = manager(team.function());
        String subject = text(command.subject(), 255, "Choose a team member");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (subject.equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot designate yourself as a lead");
        Instant now = clock.instant();
        if (activeMembership(teamId, subject).isEmpty())
            throw new ApiException(409, "TEAM_MEMBERSHIP_REQUIRED", "Only a current team member can be designated lead");
        if (!holdsFunctionRole(subject, team.function(), now))
            throw new ApiException(409, "FUNCTION_ROLE_REQUIRED", "The lead needs an effective role in this function");
        if (activeLead(teamId, subject).isPresent())
            throw new ApiException(409, "ALREADY_TEAM_LEAD", "The person already leads this team");
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO workforce_lead_designations(id,team_id,subject,effective_from,status,created_by,reason,revision) VALUES(?,?,?,?,'ACTIVE',?,?,0)")
                .params(id, teamId, subject, timestamp(startAfter("workforce_lead_designations", teamId, subject, now)), actor, reason).update();
        audit(actor, "WorkforceLeadDesignation", id, "LEAD_DESIGNATED", "team=" + teamId + "; subject=" + subject, reason, now);
        return new Result(id, 0);
    }

    @Transactional
    public Result endLead(UUID designationId, Retire command) {
        Relation lead = relation("workforce_lead_designations", designationId);
        Team team = team(lead.teamId());
        var actor = manager(team.function());
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (lead.subject().equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot end your own lead designation");
        Instant now = clock.instant();
        // WF-12: the only lead of a team with other members, or a manager whose last designation this is, is blocked.
        if (count("SELECT COUNT(*) FROM workforce_lead_designations WHERE team_id=? AND status='ACTIVE' AND id<>?", team.id(), designationId) == 0
                && count("SELECT COUNT(*) FROM workforce_team_memberships WHERE team_id=? AND status='ACTIVE' AND subject<>?", team.id(), lead.subject()) > 0)
            throw new ApiException(409, "ONLY_TEAM_LEAD", "Designate another lead before ending this one");
        if (count("SELECT COUNT(*) FROM workforce_current_managers WHERE function_key=? AND manager_subject=?", team.function(), lead.subject()) > 0
                && count("SELECT COUNT(*) FROM workforce_lead_designations l JOIN workforce_teams t ON t.id=l.team_id "
                        + "WHERE l.subject=? AND l.status='ACTIVE' AND t.function_key=? AND l.id<>?", lead.subject(), team.function(), designationId) == 0)
            throw new ApiException(409, "DIRECT_REPORTS_WITHOUT_MANAGER", "Re-parent this person's direct reports before ending their last lead designation");
        end("workforce_lead_designations", lead, command.revision(), now);
        audit(actor, "WorkforceLeadDesignation", designationId, "LEAD_ENDED", "team=" + team.id() + "; subject=" + lead.subject(), reason, now);
        return new Result(designationId, command.revision() + 1);
    }

    /** WF-05/INV-27: replaces the person's current manager in the function; rejects cycles. */
    @Transactional
    public Result setManager(SetManager command) {
        String function = text(command.function(), 50, "Choose a function");
        var actor = manager(function);
        String staff = text(command.staffSubject(), 255, "Choose a workforce person");
        String managerSubject = text(command.managerSubject(), 255, "Choose a manager");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (staff.equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot change your own reporting line");
        if (staff.equals(managerSubject))
            throw new ApiException(409, "REPORTING_CYCLE", "A person cannot report to themselves");
        Instant now = clock.instant();
        if (!holdsFunctionRole(staff, function, now))
            throw new ApiException(409, "FUNCTION_ROLE_REQUIRED", "The person needs an effective role in this function");
        if (!holdsFunctionRole(managerSubject, function, now) || count("SELECT COUNT(*) FROM workforce_lead_designations l "
                + "JOIN workforce_teams t ON t.id=l.team_id WHERE l.subject=? AND l.status='ACTIVE' AND t.status='ACTIVE' AND t.function_key=?",
                managerSubject, function) == 0)
            throw new ApiException(409, "MANAGER_NOT_ELIGIBLE", "The manager needs a role and an active lead designation in this function");
        Set<String> seen = new HashSet<>();
        for (String upward = managerSubject; upward != null && seen.add(upward); upward = currentManager(function, upward))
            if (upward.equals(staff)) throw new ApiException(409, "REPORTING_CYCLE", "This change would create a reporting cycle");
        Optional<Relation> previous = currentLine(function, staff);
        previous.ifPresent(line -> endLine(function, staff, line, now));
        Instant start = previous.map(line -> endAt(line, now)).orElse(now);
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO workforce_reporting_lines(id,function_key,staff_subject,manager_subject,effective_from,status,created_by,reason,revision) "
                        + "VALUES(?,?,?,?,?,'ACTIVE',?,?,0)")
                .params(id, function, staff, managerSubject, timestamp(start), actor, reason).update();
        jdbc.sql("INSERT INTO workforce_current_managers(function_key,staff_subject,manager_subject,reporting_line_id) VALUES(?,?,?,?)")
                .params(function, staff, managerSubject, id).update();
        audit(actor, "WorkforceReportingLine", id, "MANAGER_SET", function + "; staff=" + staff + "; manager=" + managerSubject, reason, now);
        return new Result(id, 0);
    }

    @Transactional
    public Result endManager(EndManager command) {
        String function = text(command.function(), 50, "Choose a function");
        var actor = manager(function);
        String staff = text(command.staffSubject(), 255, "Choose a workforce person");
        String reason = text(command.reason(), 500, "Give a reason for this change");
        if (staff.equals(actor))
            throw new ApiException(409, "SELF_HIERARCHY_CHANGE", "You cannot change your own reporting line");
        Instant now = clock.instant();
        Relation line = currentLine(function, staff)
                .orElseThrow(() -> new ApiException(404, "REPORTING_LINE_NOT_FOUND", "The person has no current manager in this function"));
        if (line.revision() != command.revision()) stale();
        endLine(function, staff, line, now);
        audit(actor, "WorkforceReportingLine", line.id(), "MANAGER_ENDED", function + "; staff=" + staff, reason, now);
        return new Result(line.id(), line.revision() + 1);
    }

    private String manager(String function) {
        String actor = access.requireFunctionManager(function).subject();
        // INV-27: hierarchy changes in one function are serialized.
        jdbc.sql("SELECT function_key FROM workforce_functions WHERE function_key=? FOR UPDATE").param(function)
                .query(String.class).optional()
                .orElseThrow(() -> new ApiException(404, "FUNCTION_NOT_FOUND", "Function not found"));
        return actor;
    }

    private boolean holdsFunctionRole(String subject, String function, Instant at) {
        return count("SELECT COUNT(*) FROM workforce_role_assignments a JOIN workforce_role_catalogue r ON r.role_key=a.role_key "
                + "WHERE a.subject=? AND r.function_key=? AND a.status='ACTIVE' AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?)",
                subject, function, timestamp(at), timestamp(at)) > 0;
    }

    private Team team(UUID id) {
        return jdbc.sql("SELECT id,function_key,status,revision FROM workforce_teams WHERE id=? FOR UPDATE").param(id)
                .query((rs, n) -> new Team(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getLong(4))).optional()
                .orElseThrow(() -> new ApiException(404, "TEAM_NOT_FOUND", "Team not found"));
    }

    private Team activeTeam(UUID id) {
        Team team = team(id);
        if (!"ACTIVE".equals(team.status())) throw new ApiException(409, "TEAM_RETIRED", "The team is retired");
        return team;
    }

    private Relation relation(String table, UUID id) {
        return jdbc.sql("SELECT id,team_id,subject,status,revision,effective_from FROM " + table + " WHERE id=? FOR UPDATE").param(id)
                .query((rs, n) -> new Relation(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3),
                        rs.getString(4), rs.getLong(5), rs.getTimestamp(6).toInstant())).optional()
                .orElseThrow(() -> new ApiException(404, "HIERARCHY_RECORD_NOT_FOUND", "Record not found"));
    }

    private Optional<UUID> activeMembership(UUID teamId, String subject) {
        return jdbc.sql("SELECT id FROM workforce_team_memberships WHERE team_id=? AND subject=? AND status='ACTIVE'")
                .params(teamId, subject).query(UUID.class).optional();
    }

    private Optional<UUID> activeLead(UUID teamId, String subject) {
        return jdbc.sql("SELECT id FROM workforce_lead_designations WHERE team_id=? AND subject=? AND status='ACTIVE'")
                .params(teamId, subject).query(UUID.class).optional();
    }

    private void end(String table, Relation relation, long revision, Instant now) {
        if (!"ACTIVE".equals(relation.status()) || jdbc.sql("UPDATE " + table + " SET status='ENDED',effective_to=?,revision=revision+1 "
                        + "WHERE id=? AND revision=? AND status='ACTIVE'")
                .params(timestamp(endAt(relation, now)), relation.id(), revision).update() != 1) stale();
    }

    private String currentManager(String function, String staff) {
        return jdbc.sql("SELECT manager_subject FROM workforce_current_managers WHERE function_key=? AND staff_subject=?")
                .params(function, staff).query(String.class).optional().orElse(null);
    }

    private Optional<Relation> currentLine(String function, String staff) {
        return jdbc.sql("SELECT l.id,l.manager_subject,l.status,l.revision,l.effective_from FROM workforce_current_managers c "
                        + "JOIN workforce_reporting_lines l ON l.id=c.reporting_line_id WHERE c.function_key=? AND c.staff_subject=?")
                .params(function, staff)
                .query((rs, n) -> new Relation(rs.getObject(1, UUID.class), null, rs.getString(2), rs.getString(3), rs.getLong(4), rs.getTimestamp(5).toInstant()))
                .optional();
    }

    private void endLine(String function, String staff, Relation line, Instant now) {
        jdbc.sql("DELETE FROM workforce_current_managers WHERE function_key=? AND staff_subject=? AND reporting_line_id=?")
                .params(function, staff, line.id()).update();
        if (jdbc.sql("UPDATE workforce_reporting_lines SET status='ENDED',effective_to=?,revision=revision+1 WHERE id=? AND revision=? AND status='ACTIVE'")
                .params(timestamp(endAt(line, now)), line.id(), line.revision()).update() != 1) stale();
    }

    /** Periods are never zero-length: a record ended within its own start tick lasts one microsecond. */
    private static Instant endAt(Relation relation, Instant now) {
        Instant end = now.truncatedTo(ChronoUnit.MICROS);
        return end.isAfter(relation.effectiveFrom()) ? end : relation.effectiveFrom().plus(1, ChronoUnit.MICROS);
    }

    /** A new period starts no earlier than the same person's previous period on the team ended (same-tick re-adds). */
    private Instant startAfter(String table, UUID teamId, String subject, Instant now) {
        Instant start = now.truncatedTo(ChronoUnit.MICROS);
        return jdbc.sql("SELECT effective_to FROM " + table + " WHERE team_id=? AND subject=? AND effective_to IS NOT NULL "
                        + "ORDER BY effective_to DESC LIMIT 1").params(teamId, subject)
                .query((rs, n) -> rs.getTimestamp(1).toInstant()).optional()
                .filter(lastEnd -> lastEnd.isAfter(start)).orElse(start);
    }

    private long count(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(Long.class).single();
    }

    private void audit(String actor, String entityType, UUID id, String action, String detail, String reason, Instant now) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) "
                        + "VALUES(?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), "WORKFORCE_HIERARCHY", actor, "FUNCTION_MANAGER", entityType, id.toString(), action,
                        "SUCCESS", bounded(detail + "; reason=" + reason), timestamp(now)).update();
    }

    private static String bounded(String value) {
        return value.length() <= 1000 ? value : value.substring(0, 1000);
    }

    private static void stale() {
        throw new ApiException(409, "STALE_HIERARCHY_RECORD", "The record changed; reload and try again");
    }

    private static String text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }
}
