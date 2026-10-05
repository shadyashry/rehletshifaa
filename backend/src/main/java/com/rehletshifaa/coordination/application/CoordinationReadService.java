package com.rehletshifaa.coordination.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

/**
 * Bounded read models for Coordination Setup (ROUTING_READ). Presentation only: names instead of account identifiers,
 * case numbers instead of case identifiers, one request per page section. Nothing here evaluates routing.
 */
@Service
public class CoordinationReadService {
    private static final int MAX_DECISIONS = 100;
    private final JdbcClient jdbc;
    private final CoordinationRepository repo;
    private final Authority authority;
    private final CryptoService crypto;
    private final Clock clock;
    private final GovernanceAuditLog audit;

    public CoordinationReadService(JdbcClient jdbc, CoordinationRepository repo, Authority authority, CryptoService crypto, Clock clock, GovernanceAuditLog audit) {
        this.jdbc = jdbc; this.repo = repo; this.authority = authority; this.crypto = crypto; this.clock = clock; this.audit = audit;
    }

    @Transactional(readOnly = true)
    public CoordinationOverview overview() {
        authority.require(Permission.ROUTING_READ);
        Instant now = clock.instant();
        Policy policy = repo.policies().stream().filter(p -> CoordinationConfigurationService.effective(p.effectiveFrom(), p.effectiveTo(), now)).findFirst().orElse(null);
        return new CoordinationOverview(repo.routedCases(), repo.queue().size(), policy == null ? null : policy.version(),
                policy == null ? null : policy.effectiveFrom(), policy == null ? null : policy.effectiveTo());
    }

    /** Coordinators (and anyone still in a care-coordination team or holding capacity) with teams, capacity and caseload. */
    @Transactional(readOnly = true)
    public List<CoordinationPerson> people() {
        authority.require(Permission.ROUTING_READ);
        Instant now = clock.instant();
        Map<String, List<PersonTeam>> teams = new TreeMap<>();
        for (Object[] row : repo.personTeams(now))
            teams.computeIfAbsent((String) row[0], k -> new ArrayList<>()).add(new PersonTeam((UUID) row[1], (Boolean) row[4], (Instant) row[2], (Instant) row[3]));
        Map<String, Capacity> capacity = new HashMap<>();
        repo.capacities().forEach(c -> capacity.put(c.subject(), c));
        Map<String, String[]> staff = new HashMap<>();
        jdbc.sql("SELECT p.subject,p.display_name_encrypted,CASE WHEN p.lifecycle_status='ACTIVE' AND s.active=TRUE THEN 'ACTIVE' ELSE 'DISABLED' END "
                        + "FROM workforce_people p JOIN access_subjects s ON s.subject=p.subject WHERE EXISTS(SELECT 1 FROM workforce_role_assignments a "
                        + "WHERE a.subject=p.subject AND a.role_key='COORDINATOR' AND a.status='ACTIVE' AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>?))")
                .params(Timestamp.from(now), Timestamp.from(now))
                .query((r, n) -> staff.put(r.getString(1), new String[]{r.getString(2), r.getString(3)})).list();
        Set<String> subjects = new TreeSet<>(teams.keySet());
        subjects.addAll(capacity.keySet());
        subjects.addAll(staff.keySet());
        Map<String, Long> workload = workload(subjects);
        Map<String, String> names = names(subjects);
        List<CoordinationPerson> people = new ArrayList<>();
        for (String subject : subjects) {
            String[] s = staff.get(subject);
            people.add(new CoordinationPerson(subject, names.get(subject), s == null ? "NOT_A_COORDINATOR" : s[1],
                    teams.getOrDefault(subject, List.of()), capacity.get(subject), workload.getOrDefault(subject, 0L)));
        }
        people.sort(Comparator.comparing((CoordinationPerson p) -> p.name() == null ? null : p.name().toLowerCase(Locale.ROOT), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(CoordinationPerson::subject));
        return List.copyOf(people);
    }

    /** Consultants by name with the routing preference in effect now. */
    @Transactional(readOnly = true)
    public List<ConsultantRouting> consultants() {
        authority.require(Permission.ROUTING_READ);
        Instant now = clock.instant();
        Map<UUID, List<Preference>> preferences = repo.allPreferences();
        return repo.consultants().stream().map(row -> {
            UUID id = (UUID) row[0];
            List<Preference> versions = preferences.getOrDefault(id, List.of());
            Preference current = versions.stream().filter(p -> CoordinationConfigurationService.effective(p.effectiveFrom(), p.effectiveTo(), now)).findFirst().orElse(null);
            return new ConsultantRouting(id, (String) row[1], current, versions.isEmpty() ? null : versions.getFirst());
        }).toList();
    }

    /** Routing decision history, newest first, bounded. Case numbers only — no patient data. */
    @Transactional(readOnly = true)
    public List<DecisionEntry> decisions(Integer limit) {
        authority.require(Permission.ROUTING_READ);
        int bounded = limit == null ? 50 : Math.max(1, Math.min(limit, MAX_DECISIONS));
        List<Object[]> rows = repo.recentDecisions(bounded);
        Set<String> subjects = new HashSet<>();
        for (Object[] row : rows) {
            Decision d = (Decision) row[2];
            subjects.add((String) row[1]); subjects.add(d.previousOwner()); subjects.add(d.selectedOwner());
        }
        subjects.remove(null);
        Map<String, String> names = names(subjects);
        return rows.stream().map(row -> {
            Decision d = (Decision) row[2];
            String actor = "SYSTEM".equals(row[1]) ? null : names.get((String) row[1]);
            return new DecisionEntry(d.id(), d.caseId(), (String) row[0], d.path(), d.source(), actor, d.previousOwner(), names.get(d.previousOwner()),
                    d.selectedOwner(), names.get(d.selectedOwner()), d.team(), d.reason(), d.evaluatedAt(), d.policyVersion());
        }).toList();
    }

    public record ManagedCaseSummary(UUID caseId, String caseReference, String stage, String coordinatorSubject,
                                     String coordinatorName, long openWork, long overdueWork, long blockingWork) {}

    /** QA-12: operational fields only, restricted to active assignees in teams the caller currently leads. */
    @Transactional
    public List<ManagedCaseSummary> managedCaseSummaries() {
        var actor = authority.authorize(Permission.COORDINATION_CASE_SUMMARY);
        Instant now = clock.instant();
        List<ManagedCaseSummary> rows = jdbc.sql("SELECT c.id,c.case_number,c.status,a.assignee_subject,p.display_name_encrypted,"
                        + "COUNT(t.id),COALESCE(SUM(CASE WHEN t.due_at<? THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN t.blocking=TRUE THEN 1 ELSE 0 END),0) "
                        + "FROM case_assignments a JOIN medical_cases c ON c.id=a.case_id LEFT JOIN workforce_people p ON p.subject=a.assignee_subject "
                        + "LEFT JOIN case_tasks t ON t.case_id=c.id AND t.status IN ('OPEN','IN_PROGRESS') AND t.visibility_scope='INTERNAL' "
                        + "WHERE a.assignee_role='COORDINATOR' AND a.assignment_type='PRIMARY' AND a.status='ACTIVE' AND EXISTS("
                        + "SELECT 1 FROM workforce_lead_designations l JOIN workforce_teams wt ON wt.id=l.team_id "
                        + "JOIN workforce_team_memberships m ON m.team_id=wt.id AND m.subject=a.assignee_subject "
                        + "WHERE l.subject=? AND l.status='ACTIVE' AND l.effective_from<=? AND (l.effective_to IS NULL OR l.effective_to>?) "
                        + "AND wt.function_key='CARE_COORDINATION' AND wt.status='ACTIVE' AND m.status='ACTIVE' "
                        + "AND m.effective_from<=? AND (m.effective_to IS NULL OR m.effective_to>?)) "
                        + "GROUP BY c.id,c.case_number,c.status,a.assignee_subject,p.display_name_encrypted ORDER BY c.updated_at DESC")
                .params(Timestamp.from(now), actor.subject(), Timestamp.from(now), Timestamp.from(now), Timestamp.from(now), Timestamp.from(now))
                .query((rs, n) -> new ManagedCaseSummary(rs.getObject(1, UUID.class), rs.getString(2),
                        rs.getString(3), rs.getString(4), decrypt(rs.getString(5)), rs.getLong(6), rs.getLong(7), rs.getLong(8))).list();
        rows.forEach(row -> audit.record(actor.subject(), row.caseId().toString(), "SUPERVISORY_SUMMARY_READ", "SUCCESS", "CARE_COORDINATION"));
        return rows;
    }

    private Map<String, String> names(Set<String> subjects) {
        Map<String, String> names = new HashMap<>();
        if (subjects.isEmpty()) return names;
        jdbc.sql("SELECT subject,display_name_encrypted FROM workforce_people WHERE subject IN (:subjects)").param("subjects", subjects)
                .query((r, n) -> names.put(r.getString(1), decrypt(r.getString(2)))).list();
        return names;
    }

    private Map<String, Long> workload(Set<String> subjects) {
        Map<String, Long> load = new HashMap<>();
        if (subjects.isEmpty()) return load;
        jdbc.sql("SELECT a.assignee_subject,COUNT(DISTINCT a.case_id) FROM case_assignments a JOIN medical_cases c ON c.id=a.case_id WHERE a.assignee_subject IN (:subjects) "
                        + "AND a.assignee_role='COORDINATOR' AND a.assignment_type='PRIMARY' AND a.status='ACTIVE' AND c.status NOT IN ('CLOSED','CANCELLED') GROUP BY a.assignee_subject")
                .param("subjects", subjects).query((r, n) -> load.put(r.getString(1), r.getLong(2))).list();
        return load;
    }

    private String decrypt(String value) { try { return value == null ? null : crypto.decrypt(value); } catch (RuntimeException e) { return null; } }
}
