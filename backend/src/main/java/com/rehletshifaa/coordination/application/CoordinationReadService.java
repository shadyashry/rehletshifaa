package com.rehletshifaa.coordination.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.casemanagement.infrastructure.CaseAssignmentRepository;
import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.coordination.domain.Routing.*;
import com.rehletshifaa.coordination.infrastructure.CoordinationRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.WorkforceLeadDesignationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.*;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Bounded read models for Coordination Setup (ROUTING_READ). Presentation only: names instead of account identifiers,
 * case numbers instead of case identifiers, one request per page section. Nothing here evaluates routing.
 */
@Service
public class CoordinationReadService {
    private static final int MAX_DECISIONS = 100;
    private final CoordinationRepository repo;
    private final WorkforcePersonRepository workforce;
    private final WorkforceLeadDesignationRepository leads;
    private final CaseAssignmentRepository assignments;
    private final CaseTaskRepository tasks;
    private final Authority authority;
    private final CryptoService crypto;
    private final Clock clock;
    private final GovernanceAuditLog audit;

    public CoordinationReadService(CoordinationRepository repo, WorkforcePersonRepository workforce, WorkforceLeadDesignationRepository leads,
                                   CaseAssignmentRepository assignments, CaseTaskRepository tasks, Authority authority, CryptoService crypto, Clock clock,
                                   GovernanceAuditLog audit) {
        this.repo = repo; this.workforce = workforce; this.leads = leads; this.assignments = assignments; this.tasks = tasks; this.authority = authority; this.crypto = crypto; this.clock = clock; this.audit = audit;
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
        // Account state of everyone holding the Coordinator role now; a person outside it is NOT_A_COORDINATOR.
        Map<String, String> staff = new HashMap<>();
        workforce.findRoleHolderAccounts("COORDINATOR", micros(now)).forEach(a -> staff.put(a.getSubject(), a.getAccount()));
        Set<String> subjects = new TreeSet<>(teams.keySet());
        subjects.addAll(capacity.keySet());
        subjects.addAll(staff.keySet());
        Map<String, Long> workload = workload(subjects);
        Map<String, String> names = names(subjects);
        List<CoordinationPerson> people = new ArrayList<>();
        for (String subject : subjects) {
            people.add(new CoordinationPerson(subject, names.get(subject), staff.getOrDefault(subject, "NOT_A_COORDINATOR"),
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
        // The coordinators in active care-coordination teams the caller leads now, the cases they own, then each case's open work.
        List<String> supervised = leads.findSupervisedMembers(actor.subject(), CoordinationRepository.FUNCTION, micros(now));
        if (supervised.isEmpty()) return List.of();
        var cases = assignments.findCoordinatedCases(supervised);
        if (cases.isEmpty()) return List.of();
        Map<UUID, CaseTaskRepository.WorkCounts> work = new HashMap<>();
        tasks.countOpenInternalWork(cases.stream().map(CaseAssignmentRepository.CoordinatedCase::getCaseId).collect(java.util.stream.Collectors.toSet()), micros(now))
                .forEach(w -> work.put(w.getCaseId(), w));
        Map<String, String> names = names(cases.stream().map(CaseAssignmentRepository.CoordinatedCase::getCoordinator).collect(java.util.stream.Collectors.toSet()));
        List<ManagedCaseSummary> rows = cases.stream().map(c -> {
            var w = work.get(c.getCaseId());
            return new ManagedCaseSummary(c.getCaseId(), c.getCaseNumber(), c.getStatus().name(), c.getCoordinator(), names.get(c.getCoordinator()),
                    w == null ? 0 : w.getOpen(), w == null ? 0 : w.getOverdue(), w == null ? 0 : w.getBlocking());
        }).toList();
        rows.forEach(row -> audit.record(actor.subject(), row.caseId().toString(), "SUPERVISORY_SUMMARY_READ", "SUCCESS", "CARE_COORDINATION"));
        return rows;
    }

    private Map<String, String> names(Set<String> subjects) {
        Map<String, String> names = new HashMap<>();
        if (subjects.isEmpty()) return names;
        for (WorkforcePerson person : workforce.findAllById(subjects)) names.put(person.getSubject(), decrypt(person.getDisplayNameEncrypted()));
        return names;
    }

    private Map<String, Long> workload(Set<String> subjects) {
        Map<String, Long> load = new HashMap<>();
        if (subjects.isEmpty()) return load;
        assignments.countCoordinatorCaseloads(subjects).forEach(c -> load.put(c.getSubject(), c.getCases()));
        return load;
    }

    private String decrypt(String value) { return value == null ? null : crypto.decrypt(value); }
}
