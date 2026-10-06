package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.authority.infrastructure.PlatformRoleAssignmentRepository;
import com.rehletshifaa.directory.infrastructure.ConsultantCurrentOwnerRepository;
import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.domain.WorkforceRoleAssignment;
import com.rehletshifaa.workforce.domain.WorkforceRoleConflict;
import com.rehletshifaa.workforce.infrastructure.AssignmentWithFunction;
import com.rehletshifaa.workforce.infrastructure.WorkforceCatalogueRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceCurrentManagerRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceLeadDesignationRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforcePersonRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleAssignmentRepository;
import com.rehletshifaa.workforce.infrastructure.WorkforceRoleConflictRepository;

import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** WF-02 business-role assignments. Callers hold the platform governance lock for every mutation. */
@Repository
public class WorkforceRoleAssignmentStore {
    private final ConsultantCurrentOwnerRepository currentOwners;
    private final PractitionerProfileRepository practitioners;
    private final WorkforceRoleAssignmentRepository workforceAssignments;
    private final PlatformRoleAssignmentRepository platformAssignments;
    private final WorkforceRoleConflictRepository conflicts;
    private final WorkforceCatalogueRepository catalogue;
    private final WorkforcePersonRepository people;
    private final WorkforceLeadDesignationRepository leads;
    private final WorkforceCurrentManagerRepository currentManagers;

    public WorkforceRoleAssignmentStore(WorkforceRoleAssignmentRepository workforceAssignments,
                                        PlatformRoleAssignmentRepository platformAssignments, WorkforceRoleConflictRepository conflicts,
                                        WorkforceCatalogueRepository catalogue, WorkforcePersonRepository people,
                                        WorkforceLeadDesignationRepository leads, WorkforceCurrentManagerRepository currentManagers, PractitionerProfileRepository practitioners,
                                        ConsultantCurrentOwnerRepository currentOwners) {
        this.currentOwners = currentOwners; this.practitioners = practitioners; this.workforceAssignments = workforceAssignments; this.platformAssignments = platformAssignments;
        this.conflicts = conflicts; this.catalogue = catalogue; this.people = people; this.leads = leads; this.currentManagers = currentManagers;
    }

    public record RoleAssignment(UUID id, String subject, String role, String function, Instant effectiveFrom,
                                 Instant effectiveTo, String status, String source, String assignedBy, String reason,
                                 long revision) {}

    public List<RoleAssignment> forSubject(String subject) {
        return workforceAssignments.findWithFunctionForSubject(subject).stream().map(WorkforceRoleAssignmentStore::view).toList();
    }

    public RoleAssignment forUpdate(UUID id) {
        workforceAssignments.lockById(id).orElseThrow(() -> new ApiException(404, "ROLE_ASSIGNMENT_NOT_FOUND", "Role assignment not found"));
        return workforceAssignments.findWithFunction(id).map(WorkforceRoleAssignmentStore::view)
                .orElseThrow(() -> new ApiException(404, "ROLE_ASSIGNMENT_NOT_FOUND", "Role assignment not found"));
    }

    public Optional<String> lifecycle(String subject) {
        return people.findById(subject).map(p -> p.getLifecycleStatus());
    }

    public Optional<String> activeRoleFunction(String role) {
        return catalogue.findActiveRoleFunction(role);
    }

    /** SOD-04: Consultant identities cannot hold an internal workforce role. */
    public boolean consultantIdentity(String subject) {
        return practitioners.existsByExternalSubject(subject);
    }

    public boolean overlapping(String subject, String role, Instant from, Instant to) {
        return to == null ? workforceAssignments.overlapsOpenEnded(subject, role, micros(from))
                : workforceAssignments.overlaps(subject, role, micros(from), micros(to));
    }

    /**
     * SOD-04 conflict rules against every overlapping active assignment, including the platform-scope
     * {@code SYSTEM_ADMINISTRATOR} assignment. Returns the first violated rule reason, in conflicting-role order.
     */
    public Optional<String> conflict(String subject, String role, Instant from, Instant to) {
        for (WorkforceRoleConflict rule : conflicts.findByRoleKeyOrderByConflictingRoleKey(role)) {
            String held = rule.getConflictingRoleKey();
            boolean overlapping = to == null
                    ? workforceAssignments.overlapsOpenEnded(subject, held, micros(from)) || platformAssignments.overlapsOpenEnded(subject, held, micros(from))
                    : workforceAssignments.overlaps(subject, held, micros(from), micros(to)) || platformAssignments.overlaps(subject, held, micros(from), micros(to));
            if (overlapping) return Optional.of(rule.getRuleReason());
        }
        return Optional.empty();
    }

    /** Current or scheduled (not ended) active assignment of the role, from any source. */
    public boolean holds(String subject, String role, Instant at) {
        return workforceAssignments.holdsNowOrLater(subject, role, micros(at));
    }

    /** SOD-04 pair rule between two roles, independent of any assignment. */
    public Optional<String> pairConflict(String role, String other) {
        return conflicts.findByRoleKeyAndConflictingRoleKey(role, other).map(WorkforceRoleConflict::getRuleReason);
    }

    /** True when another assignment in the same function stays effective at {@code at}. */
    public boolean retainsFunction(String subject, String function, UUID excluded, Instant at) {
        return workforceAssignments.retainsFunction(subject, function, excluded, micros(at));
    }

    /** WF-12: the subject is the only current lead of an active team in the function that has other members. */
    public boolean onlyLeadOfStaffedTeam(String subject, String function, Instant at) {
        return leads.onlyLeadOfStaffedTeam(subject, function, micros(at));
    }

    /** WF-12: current direct reports in the function (each has exactly one current manager per function). */
    public boolean hasDirectReports(String subject, String function) {
        return currentManagers.existsByFunctionKeyAndManagerSubject(function, subject);
    }

    /** SOD-05: an Operations owner must be reassigned before their qualifying role is removed. */
    public boolean ownsConsultant(String subject) {
        return currentOwners.existsByOwnerSubject(subject);
    }

    public RoleAssignment insert(String subject, String role, Instant from, Instant to, String actor, String reason, Instant now) {
        return insert(subject, role, from, to, "GRANT", actor, reason, now);
    }

    public RoleAssignment insert(String subject, String role, Instant from, Instant to, String source, String actor, String reason, Instant now) {
        UUID id = UUID.randomUUID();
        workforceAssignments.saveAndFlush(new WorkforceRoleAssignment(id, subject, role, from, to, source, actor, reason, now));
        return forUpdate(id);
    }

    public void revoke(RoleAssignment assignment, Instant removalAt, String actor, String reason, Instant now) {
        int changed = !removalAt.isAfter(now)
                ? workforceAssignments.revoke(assignment.id(), assignment.revision(), actor, micros(now), reason)
                : workforceAssignments.scheduleRemoval(assignment.id(), assignment.revision(), actor, micros(removalAt), reason);
        if (changed != 1) throw new ApiException(409, "STALE_ROLE_ASSIGNMENT", "The role assignment changed; reload and try again");
    }

    private static RoleAssignment view(AssignmentWithFunction row) {
        WorkforceRoleAssignment a = row.assignment();
        return new RoleAssignment(a.getId(), a.getSubject(), a.getRoleKey(), row.functionKey(), a.getEffectiveFrom(), a.getEffectiveTo(),
                a.getStatus(), a.getSource(), a.getAssignedBy(), a.getReason(), a.getRevision());
    }
}
