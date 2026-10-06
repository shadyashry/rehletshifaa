package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.domain.WorkforceCurrentManager;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.WorkforceCurrentManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceTeamMembershipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * WF-15/WF-17 read port: the workforce facts of one authenticated subject, read at a given instant.
 *
 * <p>Callers pass the server-resolved subject; nothing here trusts browser input. The facts grant nothing by
 * themselves (WF-13).</p>
 */
@Service
public class WorkforceFacts {
    private final WorkforcePersonRepository people;
    private final WorkforceRoleAssignmentRepository assignments;
    private final WorkforceTeamMembershipRepository memberships;
    private final WorkforceCurrentManagerRepository currentManagers;
    private final CryptoService crypto;

    public WorkforceFacts(WorkforcePersonRepository people, WorkforceRoleAssignmentRepository assignments,
                          WorkforceTeamMembershipRepository memberships, WorkforceCurrentManagerRepository currentManagers,
                          CryptoService crypto) {
        this.people = people; this.assignments = assignments; this.memberships = memberships;
        this.currentManagers = currentManagers; this.crypto = crypto;
    }

    public record RoleFact(String role, String function, Instant effectiveFrom, Instant effectiveTo, String source) {}
    public record TeamFact(UUID teamId, String function, String name, boolean lead) {}
    public record ManagerFact(String function, String managerSubject, String managerDisplayName) {}
    public record PersonFacts(String subject, String displayName, String lifecycleStatus, boolean mfaEnrolled,
                              boolean phishingResistantMfaEnrolled, List<RoleFact> roles, List<String> functions,
                              List<TeamFact> teams, List<ManagerFact> managers) {}

    @Transactional(readOnly = true)
    public Optional<PersonFacts> forSubject(String subject, Instant at) {
        Instant when = micros(at);
        return people.findById(subject).map(person -> {
            List<RoleFact> roles = assignments.findEffectiveRoleFacts(subject, when).stream()
                    .map(r -> new RoleFact(r.getRoleKey(), r.getFunctionKey(), r.getEffectiveFrom(), r.getEffectiveTo(), r.getSource()))
                    .toList();
            // WF-03: a person belongs to every function for which they hold an effective role.
            TreeSet<String> functions = roles.stream().map(RoleFact::function).collect(Collectors.toCollection(TreeSet::new));
            List<TeamFact> teams = memberships.findCurrentTeams(subject, when).stream()
                    .map(t -> new TeamFact(t.getTeamId(), t.getFunctionKey(), t.getName(), t.isLead())).toList();
            return new PersonFacts(person.getSubject(), crypto.decrypt(person.getDisplayNameEncrypted()), person.getLifecycleStatus(),
                    person.isMfaEnrolled(), person.isPhishingResistantMfaEnrolled(), roles, List.copyOf(functions), teams, managers(subject));
        });
    }

    private List<ManagerFact> managers(String subject) {
        List<WorkforceCurrentManager> pointers = currentManagers.findByStaffSubjectOrderByFunctionKey(subject);
        Map<String, WorkforcePerson> managers = people.findAllById(pointers.stream().map(WorkforceCurrentManager::getManagerSubject).toList())
                .stream().collect(Collectors.toMap(WorkforcePerson::getSubject, Function.identity()));
        // The pointer's manager always has a person row (foreign key), as the inner join this replaces assumed.
        return pointers.stream().filter(p -> managers.containsKey(p.getManagerSubject()))
                .map(p -> new ManagerFact(p.getFunctionKey(), p.getManagerSubject(),
                        crypto.decrypt(managers.get(p.getManagerSubject()).getDisplayNameEncrypted())))
                .toList();
    }
}
