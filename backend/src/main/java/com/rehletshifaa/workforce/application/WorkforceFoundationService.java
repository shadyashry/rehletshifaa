package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.domain.WorkforceCurrentManager;
import com.rehletshifaa.workforce.domain.WorkforceLeadDesignation;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.domain.WorkforceReportingLine;
import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;
import com.rehletshifaa.workforce.domain.WorkforceTeam;
import com.rehletshifaa.workforce.domain.WorkforceTeamMembership;
import com.rehletshifaa.workforce.infrastructure.WorkforceCatalogueRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceCurrentManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceLeadDesignationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceReportingLineRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamMembershipRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * WF-13/WF-17 read models: role/function catalogue, people with their effective roles, and teams.
 * Each view loads every child set in one query and groups in memory (no query per row).
 */
@Service
public class WorkforceFoundationService {
    private static final String ACTIVE = "ACTIVE";
    private final WorkforceCatalogueRepository catalogue;
    private final WorkforcePersonRepository people;
    private final WorkforceRoleAssignmentRepository assignments;
    private final WorkforceTeamRepository teams;
    private final WorkforceTeamMembershipRepository memberships;
    private final WorkforceLeadDesignationRepository leads;
    private final WorkforceCurrentManagerRepository currentManagers;
    private final WorkforceReportingLineRepository reportingLines;
    private final WorkforceAccessPolicy access;
    private final CryptoService crypto;
    private final Clock clock;

    public WorkforceFoundationService(WorkforceCatalogueRepository catalogue, WorkforcePersonRepository people,
                                      WorkforceRoleAssignmentRepository assignments, WorkforceTeamRepository teams,
                                      WorkforceTeamMembershipRepository memberships, WorkforceLeadDesignationRepository leads,
                                      WorkforceCurrentManagerRepository currentManagers, WorkforceReportingLineRepository reportingLines,
                                      WorkforceAccessPolicy access, CryptoService crypto, Clock clock) {
        this.catalogue = catalogue; this.people = people; this.assignments = assignments; this.teams = teams;
        this.memberships = memberships; this.leads = leads; this.currentManagers = currentManagers;
        this.reportingLines = reportingLines; this.access = access; this.crypto = crypto; this.clock = clock;
    }

    public record RoleView(String key, String displayName) {}
    public record FunctionView(String key, String displayName, List<RoleView> roles) {}
    public record PersonView(String subject, String displayName, String lifecycleStatus, List<String> roles) {}
    /** A current member; ids and revisions are for the end-membership, end-lead and end-reporting-line commands. */
    public record TeamMemberView(String subject, String displayName, UUID membershipId, long membershipRevision, boolean lead,
                                 UUID leadId, Long leadRevision, String managerSubject, Long managerRevision) {}
    public record TeamView(UUID id, String function, String name, String status, long revision, List<TeamMemberView> members) {}

    @Transactional(readOnly = true)
    public List<FunctionView> catalogue() {
        access.require(WorkforceAccessPolicy.Action.READ);
        Map<String, List<RoleView>> roles = catalogue.findActiveRoles().stream().collect(Collectors.groupingBy(
                r -> r.getFunctionKey(), Collectors.mapping(r -> new RoleView(r.getKey(), r.getDisplayName()), Collectors.toList())));
        return catalogue.findActiveFunctions().stream()
                .map(f -> new FunctionView(f.getKey(), f.getDisplayName(), roles.getOrDefault(f.getKey(), List.of()))).toList();
    }

    @Transactional(readOnly = true)
    public List<PersonView> people() {
        access.require(WorkforceAccessPolicy.Action.READ);
        Map<String, List<String>> roles = assignments.findAllEffective(micros(clock.instant())).stream().collect(Collectors.groupingBy(
                WorkforceRoleAssignment::getSubject, Collectors.mapping(WorkforceRoleAssignment::getRoleKey, Collectors.toList())));
        return people.findAllByOrderBySubjectAsc().stream()
                .map(p -> new PersonView(p.getSubject(), crypto.decrypt(p.getDisplayNameEncrypted()), p.getLifecycleStatus(),
                        roles.getOrDefault(p.getSubject(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TeamView> teams() {
        access.require(WorkforceAccessPolicy.Action.READ);
        List<WorkforceTeam> all = teams.findAllOrdered();
        if (all.isEmpty()) return List.of();
        List<UUID> teamIds = all.stream().map(WorkforceTeam::getId).toList();
        Map<UUID, List<WorkforceTeamMembership>> membersByTeam = memberships.findByTeamIdInAndStatusOrderBySubject(teamIds, ACTIVE).stream()
                .collect(Collectors.groupingBy(WorkforceTeamMembership::getTeamId));
        List<String> subjects = membersByTeam.values().stream().flatMap(List::stream).map(WorkforceTeamMembership::getSubject).distinct().toList();
        Map<String, WorkforcePerson> persons = people.findAllById(subjects).stream()
                .collect(Collectors.toMap(WorkforcePerson::getSubject, Function.identity()));
        Map<String, WorkforceLeadDesignation> activeLeads = leads.findByTeamIdInAndStatus(teamIds, ACTIVE).stream()
                .collect(Collectors.toMap(l -> l.getTeamId() + "|" + l.getSubject(), Function.identity(), (a, b) -> a));
        Map<String, WorkforceCurrentManager> pointers = (subjects.isEmpty() ? List.<WorkforceCurrentManager>of()
                : currentManagers.findByStaffSubjectIn(subjects)).stream()
                .collect(Collectors.toMap(c -> c.getFunctionKey() + "|" + c.getStaffSubject(), Function.identity()));
        Map<UUID, Long> lineRevisions = reportingLines.findAllById(pointers.values().stream().map(WorkforceCurrentManager::getReportingLineId).toList())
                .stream().collect(Collectors.toMap(WorkforceReportingLine::getId, WorkforceReportingLine::getRevision));
        return all.stream().map(team -> new TeamView(team.getId(), team.getFunctionKey(), team.getName(), team.getStatus(), team.getRevision(),
                membersByTeam.getOrDefault(team.getId(), List.of()).stream()
                        // Every membership has a person row (foreign key), as the inner join this replaces assumed.
                        .filter(m -> persons.containsKey(m.getSubject()))
                        .map(m -> {
                            WorkforceLeadDesignation lead = activeLeads.get(team.getId() + "|" + m.getSubject());
                            WorkforceCurrentManager pointer = pointers.get(team.getFunctionKey() + "|" + m.getSubject());
                            return new TeamMemberView(m.getSubject(), crypto.decrypt(persons.get(m.getSubject()).getDisplayNameEncrypted()),
                                    m.getId(), m.getRevision(), lead != null, lead == null ? null : lead.getId(),
                                    lead == null ? null : lead.getRevision(), pointer == null ? null : pointer.getManagerSubject(),
                                    pointer == null ? null : lineRevisions.get(pointer.getReportingLineId()));
                        }).toList()))
                .toList();
    }
}
