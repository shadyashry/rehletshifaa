package com.rehletshifaa.coordination.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class CoordinationRepository {
    public static final String FUNCTION = "CARE_COORDINATION";
    private static final String ACTIVE_MEMBERSHIP = "m.status='ACTIVE' AND m.effective_from<=? AND (m.effective_to IS NULL OR m.effective_to>?)";
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public CoordinationRepository(JdbcClient jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    public String encode(Object value) { try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException(e); } }
    public <T> T decode(String value, Class<T> type) { try { return json.readValue(value, type); } catch (Exception e) { throw new IllegalStateException("Invalid persisted routing data", e); } }

    public void lock() { jdbc.sql("SELECT id FROM coordination_routing_lock WHERE id=1 FOR UPDATE").query(Integer.class).single(); }
    public void lockCase(UUID id) {
        jdbc.sql("SELECT id FROM medical_cases WHERE id=? FOR UPDATE").param(id).query(UUID.class).optional()
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }

    // ---- Teams (workforce teams of the care-coordination function, with their routing profile) ----
    public List<Team> teams() {
        return jdbc.sql("SELECT t.id,t.name,t.status,p.care_areas,p.languages,p.fallback_team_id,COALESCE(p.revision,-1) revision "
                        + "FROM workforce_teams t LEFT JOIN coordination_team_profiles p ON p.team_id=t.id WHERE t.function_key=? ORDER BY t.name,t.id")
                .param(FUNCTION).query((r, n) -> team(r)).list();
    }
    public Optional<Team> team(UUID id) { return teams().stream().filter(t -> t.id().equals(id)).findFirst(); }
    public void profile(UUID team, TeamProfile p, long revision, String actor, Instant now) {
        if (revision == -1) {
            if (count("SELECT COUNT(*) FROM coordination_team_profiles WHERE team_id=?", team) > 0) stale(0);
            update("INSERT INTO coordination_team_profiles(team_id,care_areas,languages,fallback_team_id,updated_by,updated_at,revision) VALUES(?,?,?,?,?,?,0)",
                    team, join(p.careAreas()), join(p.languages()), p.fallbackTeam(), actor, timestamp(now));
        } else {
            stale(update("UPDATE coordination_team_profiles SET care_areas=?,languages=?,fallback_team_id=?,updated_by=?,updated_at=?,revision=revision+1 WHERE team_id=? AND revision=?",
                    join(p.careAreas()), join(p.languages()), p.fallbackTeam(), actor, timestamp(now), team, revision));
        }
    }
    /** Active memberships of care-coordination teams at {@code at}: subject → teams. */
    public Map<String, List<UUID>> memberships(Instant at) {
        Map<String, List<UUID>> result = new HashMap<>();
        jdbc.sql("SELECT m.subject,m.team_id FROM workforce_team_memberships m JOIN workforce_teams t ON t.id=m.team_id "
                        + "WHERE t.function_key=? AND t.status='ACTIVE' AND " + ACTIVE_MEMBERSHIP + " ORDER BY m.subject,m.team_id")
                .params(FUNCTION, timestamp(at), timestamp(at))
                .query((r, n) -> result.computeIfAbsent(r.getString(1), k -> new ArrayList<>()).add(r.getObject(2, UUID.class))).list();
        return result;
    }
    public List<Object[]> personTeams(Instant at) {
        return jdbc.sql("SELECT m.subject,m.team_id,m.effective_from,m.effective_to,EXISTS(SELECT 1 FROM workforce_lead_designations l WHERE l.team_id=m.team_id "
                        + "AND l.subject=m.subject AND l.status='ACTIVE' AND l.effective_from<=? AND (l.effective_to IS NULL OR l.effective_to>?)) "
                        + "FROM workforce_team_memberships m JOIN workforce_teams t ON t.id=m.team_id WHERE t.function_key=? AND " + ACTIVE_MEMBERSHIP + " ORDER BY m.subject,m.team_id")
                .params(timestamp(at), timestamp(at), FUNCTION, timestamp(at), timestamp(at))
                .query((r, n) -> new Object[]{r.getString(1), r.getObject(2, UUID.class), instant(r, 3), instant(r, 4), r.getBoolean(5)}).list();
    }

    // ---- Capacity ----
    public List<Capacity> capacities() {
        return jdbc.sql("SELECT * FROM coordinator_capacity ORDER BY subject").query((r, n) -> capacity(r)).list();
    }
    public void capacity(Capacity c, String actor, Instant now) {
        if (c.revision() == -1) {
            if (count("SELECT COUNT(*) FROM coordinator_capacity WHERE subject=?", c.subject()) > 0) stale(0);
            update("INSERT INTO coordinator_capacity(subject,maximum,on_duty,languages,care_areas,updated_by,updated_at,revision) VALUES(?,?,?,?,?,?,?,0)",
                    c.subject(), c.maximum(), c.onDuty(), join(c.languages()), join(c.careAreas()), actor, timestamp(now));
        } else {
            stale(update("UPDATE coordinator_capacity SET maximum=?,on_duty=?,languages=?,care_areas=?,updated_by=?,updated_at=?,revision=revision+1 WHERE subject=? AND revision=?",
                    c.maximum(), c.onDuty(), join(c.languages()), join(c.careAreas()), actor, timestamp(now), c.subject(), c.revision()));
        }
    }

    // ---- Policy and preferences ----
    public List<Policy> policies() {
        return jdbc.sql("SELECT * FROM coordination_policy_versions ORDER BY version_number DESC")
                .query((r, n) -> new Policy(r.getObject("id", UUID.class), r.getInt("version_number"), instant(r, "effective_from"),
                        instant(r, "effective_to"), decode(r.getString("configuration"), PolicyConfig.class))).list();
    }
    public void policy(Policy p, String actor, Instant now) {
        update("INSERT INTO coordination_policy_versions(id,version_number,effective_from,effective_to,configuration,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
                p.id(), p.version(), timestamp(p.effectiveFrom()), timestamp(p.effectiveTo()), encode(p.configuration()), actor, timestamp(now));
    }
    public List<Preference> preferences(UUID consultant) {
        return jdbc.sql("SELECT * FROM consultant_routing_preferences WHERE consultant_id=? ORDER BY version_number DESC").param(consultant)
                .query((r, n) -> preference(r)).list();
    }
    public Map<UUID, List<Preference>> allPreferences() {
        Map<UUID, List<Preference>> result = new HashMap<>();
        jdbc.sql("SELECT * FROM consultant_routing_preferences ORDER BY consultant_id,version_number DESC")
                .query((r, n) -> result.computeIfAbsent(r.getObject("consultant_id", UUID.class), k -> new ArrayList<>()).add(preference(r))).list();
        return result;
    }
    public void preference(Preference p, String actor, Instant now) {
        update("INSERT INTO consultant_routing_preferences(id,consultant_id,version_number,effective_from,effective_to,coordinator_subject,team_id,fallback_team_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                p.id(), p.consultantId(), p.version(), timestamp(p.effectiveFrom()), timestamp(p.effectiveTo()), p.coordinator(), p.team(), p.fallbackTeam(), actor, timestamp(now));
    }
    public boolean consultant(UUID id) {
        return count("SELECT COUNT(*) FROM practitioner_profiles WHERE id=? AND practitioner_type='CONSULTANT'", id) > 0;
    }
    public List<Object[]> consultants() {
        return jdbc.sql("SELECT id,display_name FROM practitioner_profiles WHERE practitioner_type='CONSULTANT' ORDER BY display_name,id")
                .query((r, n) -> new Object[]{r.getObject(1, UUID.class), r.getString(2)}).list();
    }

    // ---- Cases ----
    public CaseFacts facts(UUID id) {
        return jdbc.sql("SELECT care_category,preferred_language,status FROM medical_cases WHERE id=?").param(id)
                .query((r, n) -> new CaseFacts(id, consultantOf(id), r.getString(1), r.getString(2), owner(id), revision(id), r.getString(3))).optional()
                .orElseThrow(() -> new ApiException(404, "CASE_NOT_FOUND", "Case was not found"));
    }
    /** The case's primary Consultant (for routing preferences), if one is assigned or offered. */
    private UUID consultantOf(UUID caseId) {
        return jdbc.sql("SELECT p.id FROM case_assignments a JOIN practitioner_profiles p ON p.external_subject=a.assignee_subject WHERE a.case_id=? "
                        + "AND a.assignee_role='DOCTOR' AND a.assignment_type='PRIMARY' AND a.status IN ('ACTIVE','PENDING') ORDER BY a.assigned_at DESC,a.id LIMIT 1")
                .param(caseId).query(UUID.class).optional().orElse(null);
    }
    public String owner(UUID id) {
        return jdbc.sql("SELECT assignee_subject FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC,id LIMIT 1")
                .param(id).query(String.class).optional().orElse(null);
    }
    private long revision(UUID caseId) { return count("SELECT COUNT(*) FROM coordination_decisions WHERE case_id=?", caseId); }
    public UUID ownerAssignmentId(UUID caseId) {
        return jdbc.sql("SELECT id FROM case_assignments WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status='ACTIVE' ORDER BY assigned_at DESC,id LIMIT 1")
                .param(caseId).query(UUID.class).single();
    }
    public long workload(String subject, UUID excludedCase) {
        return count("SELECT COUNT(DISTINCT a.case_id) FROM case_assignments a JOIN medical_cases c ON c.id=a.case_id WHERE a.assignee_subject=? AND a.assignee_role='COORDINATOR' "
                + "AND a.assignment_type='PRIMARY' AND a.status='ACTIVE' AND c.status NOT IN ('CLOSED','CANCELLED') AND a.case_id<>?", subject, excludedCase);
    }
    public Instant lastAutomatic(String subject) {
        return jdbc.sql("SELECT assigned_at FROM case_assignments WHERE assignee_subject=? AND assignee_role='COORDINATOR' AND assigned_by='ROUTING_ENGINE' ORDER BY assigned_at DESC LIMIT 1")
                .param(subject).query((r, n) -> instant(r, 1)).optional().orElse(null);
    }
    public boolean queued(UUID caseId) {
        return count("SELECT COUNT(*) FROM case_tasks WHERE case_id=? AND task_type='COORDINATION_ROUTING' AND status IN ('OPEN','IN_PROGRESS') AND owner_subject IS NULL", caseId) > 0;
    }
    /** Automatically queued cases a retry may resolve; a manager's explicit QUEUE stays parked until they resolve it. */
    public List<UUID> retryableQueue() {
        return jdbc.sql("SELECT DISTINCT case_id FROM case_tasks WHERE task_type='COORDINATION_ROUTING' AND status IN ('OPEN','IN_PROGRESS') "
                + "AND owner_subject IS NULL AND coordination_queue_reason<>'MANUAL_QUEUE' ORDER BY case_id LIMIT 100").query(UUID.class).list();
    }
    public List<QueueItem> queue() {
        return jdbc.sql("SELECT t.*,c.case_number FROM case_tasks t JOIN medical_cases c ON c.id=t.case_id WHERE t.task_type='COORDINATION_ROUTING' "
                        + "AND t.status IN ('OPEN','IN_PROGRESS') AND t.owner_subject IS NULL ORDER BY t.due_at,t.id")
                .query((r, n) -> {
                    UUID caseId = r.getObject("case_id", UUID.class);
                    return new QueueItem(caseId, r.getString("case_number"), r.getObject("id", UUID.class), r.getObject("coordination_team_id", UUID.class),
                            r.getString("coordination_queue_reason"), instant(r, "coordination_queued_at"), instant(r, "due_at"), revision(caseId));
                }).list();
    }
    public long routedCases() { return count("SELECT COUNT(DISTINCT case_id) FROM coordination_decisions"); }
    public void queue(UUID task, UUID team, String reason, Instant now) {
        update("UPDATE case_tasks SET coordination_team_id=?,coordination_queue_reason=?,coordination_queued_at=COALESCE(coordination_queued_at,?) WHERE id=?", team, reason, timestamp(now), task);
    }
    /** Replaces the case's primary Coordinator and moves their open coordinator work to the new owner. */
    public void owner(CaseFacts c, String selected, String actor, String reason, Instant now) {
        if (Objects.equals(c.owner(), selected)) return;
        update("UPDATE case_assignments SET status='ENDED',ended_at=?,version=version+1 WHERE case_id=? AND assignee_role='COORDINATOR' AND assignment_type='PRIMARY' AND status IN ('ACTIVE','PENDING')",
                timestamp(now), c.id());
        if (selected != null)
            update("INSERT INTO case_assignments(id,case_id,assignee_subject,assignee_role,assignment_type,status,reason,assigned_by,assigned_at,accepted_at,version) VALUES(?,?,?,'COORDINATOR','PRIMARY','ACTIVE',?,?,?,?,0)",
                    UUID.randomUUID(), c.id(), selected, reason, actor, timestamp(now), timestamp(now));
        update("UPDATE case_tasks SET owner_subject=?,updated_at=?,version=version+1 WHERE case_id=? AND owner_role='COORDINATOR' AND visibility_scope='INTERNAL' "
                + "AND status IN ('OPEN','IN_PROGRESS') AND (owner_subject IS NULL OR owner_subject=?)", selected, timestamp(now), c.id(), c.owner());
    }

    // ---- Decisions ----
    public Optional<Decision> replay(UUID id, String actor, String key, String payload) {
        return jdbc.sql("SELECT request_data,result_data FROM coordination_decisions WHERE case_id=? AND actor_subject=? AND command_key=?").params(id, actor, key)
                .query((r, n) -> {
                    if (!r.getString(1).equals(payload)) throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "Command key was already used for different input");
                    return decode(r.getString(2), Decision.class);
                }).optional();
    }
    public List<Decision> history(UUID id) {
        return jdbc.sql("SELECT result_data FROM coordination_decisions WHERE case_id=? ORDER BY created_at DESC,id DESC").param(id)
                .query((r, n) -> decode(r.getString(1), Decision.class)).list();
    }
    public List<Object[]> recentDecisions(int limit) {
        return jdbc.sql("SELECT c.case_number,d.actor_subject,d.result_data FROM coordination_decisions d JOIN medical_cases c ON c.id=d.case_id ORDER BY d.created_at DESC,d.id DESC LIMIT " + limit)
                .query((r, n) -> new Object[]{r.getString(1), r.getString(2), decode(r.getString(3), Decision.class)}).list();
    }
    public void decision(Decision d, String actor, String key, String request) {
        if (d.policyId() == null && !("NO_ROUTING_POLICY".equals(d.path()) && d.selectedOwner() == null))
            throw new IllegalArgumentException("Only an unassigned no-policy queue decision may lack a policy");
        update("INSERT INTO coordination_decisions(id,case_id,actor_subject,command_key,request_data,policy_id,result_data,created_at) VALUES(?,?,?,?,?,?,?,?)",
                d.id(), d.caseId(), actor, key, request, d.policyId(), encode(d), timestamp(d.evaluatedAt()));
    }

    private Team team(ResultSet r) throws SQLException {
        String areas = r.getString("care_areas"), languages = r.getString("languages");
        return new Team(r.getObject("id", UUID.class), r.getString("name"), "ACTIVE".equals(r.getString("status")),
                areas == null ? Set.of() : split(areas), languages == null ? Set.of() : split(languages),
                r.getObject("fallback_team_id", UUID.class), r.getLong("revision"));
    }
    private Capacity capacity(ResultSet r) throws SQLException {
        return new Capacity(r.getString("subject"), r.getInt("maximum"), r.getBoolean("on_duty"), split(r.getString("languages")), split(r.getString("care_areas")), r.getLong("revision"));
    }
    private Preference preference(ResultSet r) throws SQLException {
        return new Preference(r.getObject("id", UUID.class), r.getObject("consultant_id", UUID.class), r.getInt("version_number"), instant(r, "effective_from"),
                instant(r, "effective_to"), r.getString("coordinator_subject"), r.getObject("team_id", UUID.class), r.getObject("fallback_team_id", UUID.class));
    }
    private int update(String sql, Object... args) { return jdbc.sql(sql).params(args).update(); }
    private long count(String sql, Object... args) { return jdbc.sql(sql).params(args).query(Long.class).single(); }
    private static Set<String> split(String s) { return s.isBlank() ? Set.of() : Set.copyOf(Arrays.asList(s.split(","))); }
    private static String join(Set<String> s) { return String.join(",", new TreeSet<>(s)); }
    private static Instant instant(ResultSet r, String key) throws SQLException { Timestamp t = r.getTimestamp(key); return t == null ? null : t.toInstant(); }
    private static Instant instant(ResultSet r, int key) throws SQLException { Timestamp t = r.getTimestamp(key); return t == null ? null : t.toInstant(); }
    private static void stale(int changed) { if (changed != 1) throw new ApiException(409, "STALE_ROUTING", "Routing configuration changed; reload before saving"); }
}
