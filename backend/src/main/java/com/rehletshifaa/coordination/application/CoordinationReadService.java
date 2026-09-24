package com.rehletshifaa.coordination.application;

import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/**
 * Bounded read models for Coordination Setup (UX-7). Presentation only: names instead of account identifiers,
 * case numbers instead of case identifiers, and one request per page section instead of one per person or case.
 * Every read is organization-scoped and authorized with the same assignment.* capability as the configuration
 * it describes. Nothing here evaluates routing or changes state.
 */
@Service
public class CoordinationReadService {
    private static final int MAX_DECISIONS = 100;
    private final JdbcClient jdbc; private final CoordinationRepository repo; private final CoordinationConfigurationService config;
    private final CryptoService crypto; private final Clock clock;
    public CoordinationReadService(JdbcClient jdbc, CoordinationRepository repo, CoordinationConfigurationService config, CryptoService crypto, Clock clock) {
        this.jdbc = jdbc; this.repo = repo; this.config = config; this.crypto = crypto; this.clock = clock;
    }

    /** Live vs evaluation-only routing counts and the policy in effect. The live-queue count is only for queue managers. */
    @Transactional(readOnly = true)
    public CoordinationOverview overview(UUID org) {
        config.authorizeAny(org);
        long live = count("SELECT COUNT(*) FROM coordination_case_routing WHERE organization_id=? AND mode='LIVE'", org);
        long evaluated = count("SELECT COUNT(*) FROM coordination_case_routing WHERE organization_id=? AND mode='SHADOW'", org);
        Long queue = config.allowed(org, "assignment.queue.manage") ? Long.valueOf(repo.queue(org).size()) : null;
        Instant now = clock.instant();
        Policy policy = repo.policies(org).stream().filter(p -> CoordinationConfigurationService.effective(p.effectiveFrom(), p.effectiveTo(), now)).findFirst().orElse(null);
        return new CoordinationOverview(live, evaluated, queue, policy == null ? null : policy.version(),
                policy == null ? null : policy.effectiveFrom(), policy == null ? null : policy.effectiveTo());
    }

    /**
     * Teams & People: RehletShifaa coordinators who are members of this organization, plus anyone already in one of
     * its teams or capacity records (so a former member never silently disappears from a team). Clinicians and other
     * members are not listed: they cannot receive coordination work.
     */
    @Transactional(readOnly = true)
    public List<CoordinationPerson> people(UUID org) {
        config.authorize(org, "assignment.team.view");
        Set<String> members = new HashSet<>(jdbc.sql("SELECT subject FROM access_memberships WHERE organization_id=? AND status='ACTIVE'").param(org).query(String.class).list());
        Map<String, List<PersonTeam>> teams = new TreeMap<>();
        for (Team team : repo.teams(org))
            for (Member m : repo.members(team.id()))
                teams.computeIfAbsent(m.subject(), k -> new ArrayList<>()).add(new PersonTeam(team.id(), m.active(), m.lead(), m.effectiveFrom(), m.effectiveTo(), m.revision()));
        Map<String, Capacity> capacity = new HashMap<>();
        repo.capacities(org).forEach(c -> capacity.put(c.subject(), c));
        Map<String, String[]> staff = new HashMap<>();
        jdbc.sql("SELECT external_subject,display_name_encrypted,disabled_at,invitation_status FROM staff_members WHERE staff_role IN ('COORDINATOR','COORDINATOR_LEAD')")
                .query((r, n) -> staff.put(r.getString(1), new String[]{r.getString(2), r.getTimestamp(3) != null || "DISABLED".equals(r.getString(4)) ? "DISABLED" : "ACTIVE"})).list();
        Set<String> subjects = new TreeSet<>(teams.keySet());
        subjects.addAll(capacity.keySet());
        for (String member : members) if (staff.containsKey(member)) subjects.add(member);
        Map<String, Long> workload = workload(subjects);
        List<CoordinationPerson> people = new ArrayList<>();
        for (String subject : subjects) {
            String[] s = staff.get(subject);
            String name = s == null ? null : decrypt(s[0]);
            people.add(new CoordinationPerson(subject, name, s == null ? "NONE" : s[1], members.contains(subject),
                    teams.getOrDefault(subject, List.of()), capacity.get(subject), workload.getOrDefault(subject, 0L)));
        }
        people.sort(Comparator.comparing((CoordinationPerson p) -> p.name() == null ? null : p.name().toLowerCase(Locale.ROOT), Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(CoordinationPerson::subject));
        return List.copyOf(people);
    }

    /** Clinician Preferences: this organization's Consultants by name with the preference in effect now. */
    @Transactional(readOnly = true)
    public List<ConsultantRouting> consultants(UUID org) {
        config.authorize(org, "assignment.policy.view");
        Instant now = clock.instant();
        Map<UUID, List<Preference>> preferences = new HashMap<>();
        jdbc.sql("SELECT * FROM consultant_routing_preferences WHERE organization_id=? ORDER BY consultant_id,version_number DESC").param(org)
                .query((r, n) -> preferences.computeIfAbsent(r.getObject("consultant_id", UUID.class), k -> new ArrayList<>()).add(new Preference(
                        r.getObject("id", UUID.class), org, r.getObject("consultant_id", UUID.class), r.getInt("version_number"), instant(r.getTimestamp("effective_from")),
                        instant(r.getTimestamp("effective_to")), r.getString("coordinator_subject"), r.getObject("team_id", UUID.class), r.getObject("fallback_team_id", UUID.class)))).list();
        return jdbc.sql("SELECT o.practitioner_id,p.display_name FROM clinician_onboardings o JOIN practitioner_profiles p ON p.id=o.practitioner_id WHERE o.organization_id=? AND o.clinician_type='CONSULTANT' AND o.status NOT IN ('OFFBOARDED','SUSPENDED') ORDER BY p.display_name,o.practitioner_id")
                .param(org).query((r, n) -> {
                    UUID id = r.getObject(1, UUID.class);
                    List<Preference> versions = preferences.getOrDefault(id, List.of());
                    Preference current = versions.stream().filter(p -> CoordinationConfigurationService.effective(p.effectiveFrom(), p.effectiveTo(), now)).findFirst().orElse(null);
                    return new ConsultantRouting(id, r.getString(2), current, versions.isEmpty() ? null : versions.getFirst());
                }).list();
    }

    /** Routing decision history for the organization, newest first, bounded. Case numbers only — no patient data. */
    @Transactional(readOnly = true)
    public List<DecisionEntry> decisions(UUID org, Integer limit) {
        config.authorize(org, "assignment.audit.view");
        int bounded = limit == null ? 50 : Math.max(1, Math.min(limit, MAX_DECISIONS));
        record Row(String caseNumber, String actor, Decision decision) {}
        List<Row> rows = jdbc.sql("SELECT c.case_number,d.actor_subject,d.result_data FROM coordination_decisions d JOIN medical_cases c ON c.id=d.case_id WHERE d.organization_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT " + bounded)
                .param(org).query((r, n) -> new Row(r.getString(1), r.getString(2), repo.decode(r.getString(3), Decision.class))).list();
        Set<String> subjects = new HashSet<>();
        rows.forEach(r -> { subjects.add(r.actor()); subjects.add(r.decision().previousOwner()); subjects.add(r.decision().selectedOwner()); });
        subjects.remove(null);
        Map<String, String> names = names(subjects);
        return rows.stream().map(r -> {
            Decision d = r.decision();
            String actor = "SYSTEM".equals(r.actor()) ? null : names.get(r.actor());
            return new DecisionEntry(d.id(), d.caseId(), r.caseNumber(), d.mode(), d.path(), d.source(), actor, d.previousOwner(), names.get(d.previousOwner()),
                    d.selectedOwner(), names.get(d.selectedOwner()), d.team(), d.reason(), d.evaluatedAt(), d.legacyMatches(), d.policyVersion());
        }).toList();
    }

    private Map<String, String> names(Set<String> subjects) {
        Map<String, String> names = new HashMap<>();
        if (subjects.isEmpty()) return names;
        jdbc.sql("SELECT external_subject,display_name_encrypted FROM staff_members WHERE external_subject IN (:subjects)").param("subjects", subjects)
                .query((r, n) -> names.put(r.getString(1), decrypt(r.getString(2)))).list();
        return names;
    }

    private Map<String, Long> workload(Set<String> subjects) {
        Map<String, Long> load = new HashMap<>();
        if (subjects.isEmpty()) return load;
        jdbc.sql("SELECT a.assignee_subject,COUNT(DISTINCT a.case_id) FROM case_assignments a JOIN medical_cases c ON c.id=a.case_id WHERE a.assignee_subject IN (:subjects) AND a.assignee_role='COORDINATOR' AND a.assignment_type='PRIMARY' AND a.status='ACTIVE' AND c.status NOT IN ('CLOSED','CANCELLED') GROUP BY a.assignee_subject")
                .param("subjects", subjects).query((r, n) -> load.put(r.getString(1), r.getLong(2))).list();
        return load;
    }

    private String decrypt(String value) { try { return value == null ? null : crypto.decrypt(value); } catch (RuntimeException e) { return null; } }
    private long count(String sql, Object... args) { return jdbc.sql(sql).params(args).query(Long.class).single(); }
    private static Instant instant(Timestamp t) { return t == null ? null : t.toInstant(); }
}
