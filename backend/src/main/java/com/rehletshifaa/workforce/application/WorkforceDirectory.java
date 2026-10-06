package com.rehletshifaa.workforce.application;

import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.WorkforceCurrentManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceLeadDesignationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * WF-15 read port for modules that need staff facts (journey, coordination, notifications). It replaces the legacy
 * {@code staff_members} directory: a person "holds" a role only through an effective WF-02 assignment while ACTIVE with
 * active platform access, and supervision is limited to teams the person currently leads plus direct reports
 * (WF-08 with the OD-09 fail-safe: no transitive depth). Callers pass server-resolved subjects only.
 */
@Service
public class WorkforceDirectory {
    private final WorkforceRoleAssignmentRepository assignments;
    private final WorkforcePersonRepository people;
    private final WorkforceLeadDesignationRepository leads;
    private final WorkforceCurrentManagerRepository currentManagers;
    private final CryptoService crypto;
    private final Clock clock;

    public WorkforceDirectory(WorkforceRoleAssignmentRepository assignments, WorkforcePersonRepository people,
                              WorkforceLeadDesignationRepository leads, WorkforceCurrentManagerRepository currentManagers,
                              CryptoService crypto, Clock clock) {
        this.assignments = assignments; this.people = people; this.leads = leads; this.currentManagers = currentManagers;
        this.crypto = crypto; this.clock = clock;
    }

    public record Member(String subject, String displayName, String role) {}
    public record Contact(String subject, String displayName, String email, String locale, List<String> roles) {}

    /** Active holders of any of the given WF-02 roles, ordered by subject. */
    public List<Member> activeHolders(String... roles) {
        return assignments.findActiveHolders(List.of(roles), micros(clock.instant())).stream()
                .map(h -> new Member(h.getSubject(), crypto.decrypt(h.getDisplayNameEncrypted()), h.getRoleKey())).toList();
    }

    public boolean holds(String subject, String... roles) {
        return assignments.holdsAny(subject, List.of(roles), micros(clock.instant()));
    }

    /** Contact facts for notifications and display, whatever the lifecycle. */
    public Optional<Contact> contact(String subject) {
        Instant now = micros(clock.instant());
        return people.findById(subject).map(p -> new Contact(subject, crypto.decrypt(p.getDisplayNameEncrypted()),
                p.getEmailEncrypted() == null ? null : crypto.decrypt(p.getEmailEncrypted()), p.getLocale(),
                assignments.findEffectiveRoleKeys(subject, now)));
    }

    public Optional<String> subjectByEmailHash(String emailHash) {
        return people.findByEmailHash(emailHash).map(WorkforcePerson::getSubject);
    }

    public boolean person(String subject) {
        return people.existsById(subject);
    }

    /**
     * WF-07/WF-08/INV-28: subjects the lead may supervise in the function — members of active teams of that function
     * the lead currently leads, plus current direct reports in that function. Never the lead themselves.
     */
    public Set<String> supervised(String lead, String function) {
        Set<String> subjects = new HashSet<>(leads.findSupervisedMembers(lead, function, micros(clock.instant())));
        subjects.addAll(currentManagers.findDirectReports(lead, function));
        subjects.remove(lead);
        return subjects;
    }
}
