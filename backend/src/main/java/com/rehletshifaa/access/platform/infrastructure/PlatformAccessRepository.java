package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PrivilegedAccessChangeDecision;
import com.rehletshifaa.access.platform.domain.PrivilegedAccessChangeRequest;
import com.rehletshifaa.authority.domain.PlatformRoleAssignment;
import com.rehletshifaa.authority.infrastructure.PlatformRoleAssignmentRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.persistence.PlatformGovernanceLockRepository;
import com.rehletshifaa.workforce.domain.AccessSubject;
import com.rehletshifaa.workforce.domain.WorkforcePerson;
import com.rehletshifaa.workforce.infrastructure.AccessSubjectRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Repository
public class PlatformAccessRepository {
    public static final String SYSTEM_ADMINISTRATOR = "SYSTEM_ADMINISTRATOR";
    private final PlatformGovernanceLockRepository governanceLock;
    private final PlatformRoleAssignmentRepository assignments;
    private final PrivilegedAccessChangeRequestRepository requests;
    private final PrivilegedAccessChangeDecisionRepository decisions;
    private final WorkforcePersonRepository people;
    private final AccessSubjectRepository accessSubjects;

    public PlatformAccessRepository(PlatformGovernanceLockRepository governanceLock, PlatformRoleAssignmentRepository assignments,
                                    PrivilegedAccessChangeRequestRepository requests, PrivilegedAccessChangeDecisionRepository decisions,
                                    WorkforcePersonRepository people, AccessSubjectRepository accessSubjects) {
        this.governanceLock = governanceLock; this.assignments = assignments; this.requests = requests; this.decisions = decisions;
        this.people = people; this.accessSubjects = accessSubjects;
    }

    public void lockGovernance() {
        governanceLock.acquire();
    }

    public boolean effectiveAdministrator(String subject, Instant at) {
        return effectiveAdministrators(at).stream().anyMatch(subject::equals);
    }

    /** Explanation inputs only; {@link #effectiveAdministrator} remains the decision used by every endpoint and invariant. */
    public SubjectFacts subjectFacts(String subject, Instant at) {
        Optional<WorkforcePerson> person = people.findById(subject);
        boolean active = person.isPresent() && accessSubjects.findById(subject).map(AccessSubject::isActive).orElse(false);
        List<Assignment> current = assignments.findCurrentAndScheduledForSubject(subject, SYSTEM_ADMINISTRATOR, micros(at)).stream()
                .map(PlatformAccessRepository::assignment).toList();
        // The explanation joins the person with their access row; a person without one is reported as absent.
        boolean known = person.isPresent() && accessSubjects.existsById(subject);
        return new SubjectFacts(known, known ? person.get().getLifecycleStatus() : null, known && person.get().isMfaEnrolled(), active, current);
    }

    public boolean workforceSubject(String subject) {
        return people.existsById(subject);
    }

    public boolean governanceInitialized() {
        return assignments.existsByRoleKey(SYSTEM_ADMINISTRATOR);
    }

    public boolean overlappingAdministratorAssignment(String subject, Instant from, Instant to) {
        return to == null ? assignments.overlapsOpenEnded(subject, SYSTEM_ADMINISTRATOR, micros(from))
                : assignments.overlaps(subject, SYSTEM_ADMINISTRATOR, micros(from), micros(to));
    }

    public List<String> effectiveAdministrators(Instant at) {
        return assignments.findEffectiveHolders(SYSTEM_ADMINISTRATOR, micros(at));
    }

    /** Instants at which the set of effective administrators can change: future starts and current or future ends. */
    public List<Instant> administratorBoundaries(Instant now) {
        Set<Instant> boundaries = new LinkedHashSet<>(assignments.findFutureStarts(SYSTEM_ADMINISTRATOR, micros(now)));
        boundaries.addAll(assignments.findUpcomingEnds(SYSTEM_ADMINISTRATOR, micros(now)));
        return List.copyOf(boundaries);
    }

    public boolean hasIndefiniteEligibleAdministrator() {
        return assignments.hasIndefiniteEligibleHolder(SYSTEM_ADMINISTRATOR);
    }

    public Assignment insertAssignment(String subject, Instant from, Instant to, String actor, String reason, Instant now) {
        PlatformRoleAssignment saved = assignments.saveAndFlush(
                new PlatformRoleAssignment(UUID.randomUUID(), subject, SYSTEM_ADMINISTRATOR, from, to, actor, reason, now));
        return new Assignment(saved.getId(), subject, from, to, 0);
    }

    public Assignment removableAssignment(String subject, Instant removalAt) {
        List<PlatformRoleAssignment> rows = assignments.findEffectiveForSubject(subject, SYSTEM_ADMINISTRATOR, micros(removalAt));
        if (rows.size() != 1) throw new ApiException(409, "ADMIN_ASSIGNMENT_AMBIGUOUS", "Select a subject with exactly one effective administrator assignment");
        return assignment(rows.getFirst());
    }

    public void removeAssignment(UUID id, long revision, Instant removalAt, Instant now) {
        int changed = !removalAt.isAfter(now) ? assignments.revoke(id, revision, micros(now)) : assignments.scheduleEnd(id, revision, micros(removalAt));
        if (changed != 1) throw new ApiException(409, "STALE_ADMIN_ASSIGNMENT", "The administrator assignment changed; start a new request");
    }

    public ChangeRequest insertRequest(String type, String subject, Assignment assignment, Instant from, Instant to,
            String actor, String reason, Instant now, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        requests.saveAndFlush(new PrivilegedAccessChangeRequest(id, type, subject, assignment == null ? null : assignment.id(),
                assignment == null ? null : assignment.revision(), from, to, actor, reason, now, expiresAt));
        return new ChangeRequest(id, type, subject, assignment == null ? null : assignment.id(), assignment == null ? null : assignment.revision(),
                from, to, "PENDING", actor, expiresAt, 0);
    }

    public ChangeRequest requestForUpdate(UUID id) {
        return requests.lockById(id).map(PlatformAccessRepository::request)
                .orElseThrow(() -> new ApiException(404, "CHANGE_REQUEST_NOT_FOUND", "Privileged change request not found"));
    }

    public void decide(UUID id, long revision, String decision, String actor, String reason, Instant now) {
        if (requests.close(id, revision, decision) != 1)
            throw new ApiException(409, "STALE_CHANGE_REQUEST", "The privileged change request changed; reload and try again");
        decisions.saveAndFlush(new PrivilegedAccessChangeDecision(id, decision, actor, reason, now));
    }

    /** Current and scheduled System Administrator assignments, earliest first. */
    public List<Assignment> administratorAssignments(Instant at) {
        return assignments.findCurrentAndScheduled(SYSTEM_ADMINISTRATOR, micros(at)).stream().map(PlatformAccessRepository::assignment).toList();
    }

    /** Pending requests first, then the most recent decided ones (bounded). */
    public List<ChangeRequest> recentRequests(int limit) {
        return requests.findRecent(Limit.of(limit)).stream().map(PlatformAccessRepository::request).toList();
    }

    public void expire(UUID id, long revision) {
        requests.close(id, revision, "EXPIRED");
    }

    private static Assignment assignment(PlatformRoleAssignment a) {
        return new Assignment(a.getId(), a.getSubject(), a.getEffectiveFrom(), a.getEffectiveTo(), a.getRevision());
    }

    private static ChangeRequest request(PrivilegedAccessChangeRequest r) {
        return new ChangeRequest(r.getId(), r.getChangeType(), r.getSubject(), r.getAssignmentId(), r.getAssignmentRevision(),
                r.getEffectiveFrom(), r.getEffectiveTo(), r.getStatus(), r.getRequestedBy(), r.getExpiresAt(), r.getRevision());
    }

    public record Assignment(UUID id, String subject, Instant effectiveFrom, Instant effectiveTo, long revision) {}
    /** Current and scheduled (not yet ended) System Administrator assignments plus the lifecycle facts they depend on. */
    public record SubjectFacts(boolean workforcePerson, String lifecycleStatus, boolean mfaEnrolled,
                               boolean accessSubjectActive, List<Assignment> administratorAssignments) {}
    public record ChangeRequest(UUID id, String type, String subject, UUID assignmentId, Long assignmentRevision,
                                Instant effectiveFrom, Instant effectiveTo, String status, String requestedBy,
                                Instant expiresAt, long revision) {}
}
