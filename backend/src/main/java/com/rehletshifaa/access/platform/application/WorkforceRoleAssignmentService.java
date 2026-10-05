package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.WorkforceRoleAssignmentStore;
import com.rehletshifaa.access.platform.infrastructure.WorkforceRoleAssignmentStore.RoleAssignment;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * WF-02/WF-10: System Administrators maintain workforce business-role assignments. Grants are effective-dated,
 * reasoned, audited and conflict-checked (SOD-04) under the platform governance lock; nobody changes their own
 * roles (SOD-01); removal is blocked while it would orphan a team or direct reports (WF-12).
 * {@code SYSTEM_ADMINISTRATOR} is not grantable here — it keeps its maker/checker path.
 */
@Service
public class WorkforceRoleAssignmentService {
    private static final Duration RECENT_AUTHENTICATION = Duration.ofMinutes(10);
    private static final Set<String> GRANTABLE_LIFECYCLES = Set.of("INVITED", "ACTIVE");
    private final WorkforceRoleAssignmentStore store;
    private final PlatformAccessRepository access;
    private final Authority authority;
    private final GovernanceAuditLog audit;
    private final Clock clock;

    public WorkforceRoleAssignmentService(WorkforceRoleAssignmentStore store, PlatformAccessRepository access,
            Authority authority, GovernanceAuditLog audit, Clock clock) {
        this.store = store;
        this.access = access;
        this.authority = authority;

        this.audit = audit;
        this.clock = clock;
    }

    public record Grant(String subject, String role, Instant effectiveFrom, Instant effectiveTo, String reason) {}
    public record Revoke(long revision, Instant effectiveAt, String reason) {}

    @Transactional(readOnly = true)
    public List<RoleAssignment> forSubject(String subject) {
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return store.forSubject(text(subject, 255, "Choose a workforce person"));
    }

    @Transactional
    public RoleAssignment grant(Grant command) {
        Instant now = clock.instant();
        access.lockGovernance();
        String actor = requireAdministrator(now);
        String subject = text(command.subject(), 255, "Choose a workforce person");
        String role = text(command.role(), 80, "Choose a role");
        String reason = text(command.reason(), 1000, "Give a reason for this role change");
        Instant from = micros(command.effectiveFrom());
        Instant to = micros(command.effectiveTo());
        if (from == null || (to != null && !to.isAfter(from)))
            throw new ApiException(400, "INVALID_EFFECTIVE_PERIOD", "Choose a valid effective period");
        if (actor.equals(subject)) selfChange();
        if (PlatformAccessRepository.SYSTEM_ADMINISTRATOR.equals(role))
            throw new ApiException(400, "ADMINISTRATOR_CHANGE_REQUIRED", "Appoint System Administrators through an administrator change request");
        String lifecycle = store.lifecycle(subject)
                .orElseThrow(() -> new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "Workforce person not found"));
        if (!GRANTABLE_LIFECYCLES.contains(lifecycle))
            throw new ApiException(409, "WORKFORCE_LIFECYCLE_NOT_GRANTABLE", "Roles can only be granted to invited or active people");
        if (store.activeRoleFunction(role).isEmpty())
            throw new ApiException(400, "UNKNOWN_ROLE", "Choose a role from the workforce catalogue");
        if (store.consultantIdentity(subject))
            throw new ApiException(409, "ROLE_CONFLICT", "A Consultant identity cannot hold an internal workforce role");
        if (store.overlapping(subject, role, from, to))
            throw new ApiException(409, "OVERLAPPING_ROLE_ASSIGNMENT", "An overlapping assignment of this role already exists");
        store.conflict(subject, role, from, to).ifPresent(rule -> {
            throw new ApiException(409, "ROLE_CONFLICT", rule);
        });
        RoleAssignment assignment = store.insert(subject, role, from, to, actor, reason, now);
        audit.record(actor, assignment.id().toString(), "WORKFORCE_ROLE_GRANTED", "SUCCESS",
                "subject=" + subject + "; role=" + role + "; from=" + from + "; to=" + to, reason);
        return assignment;
    }

    @Transactional
    public RoleAssignment revoke(UUID id, Revoke command) {
        Instant now = clock.instant();
        access.lockGovernance();
        String actor = requireAdministrator(now);
        String reason = text(command.reason(), 1000, "Give a reason for this role change");
        RoleAssignment assignment = store.forUpdate(id);
        if (!"ACTIVE".equals(assignment.status()) || assignment.revision() != command.revision())
            throw new ApiException(409, "STALE_ROLE_ASSIGNMENT", "The role assignment changed; reload and try again");
        if (actor.equals(assignment.subject())) selfChange();
        Instant requested = micros(command.effectiveAt());
        Instant removalAt = requested == null || requested.isBefore(now) ? now : requested;
        if (!store.retainsFunction(assignment.subject(), assignment.function(), assignment.id(), removalAt)) {
            if ("CONSULTANT_OPERATIONS".equals(assignment.function()) && store.ownsConsultant(assignment.subject()))
                throw new ApiException(409, "CONSULTANT_OWNERSHIP_REASSIGNMENT_REQUIRED", "Reassign every owned Consultant before removing this role");
            if (store.onlyLeadOfStaffedTeam(assignment.subject(), assignment.function(), removalAt))
                throw new ApiException(409, "ONLY_TEAM_LEAD", "Designate another lead for this person's team before removing the role");
            if (store.hasDirectReports(assignment.subject(), assignment.function()))
                throw new ApiException(409, "DIRECT_REPORTS_WITHOUT_MANAGER", "Re-parent this person's direct reports before removing the role");
        }
        store.revoke(assignment, removalAt, actor, reason, now);
        audit.record(actor, assignment.id().toString(), "WORKFORCE_ROLE_REVOKED", "SUCCESS",
                "subject=" + assignment.subject() + "; role=" + assignment.role() + "; at=" + removalAt, reason);
        return store.forUpdate(id);
    }

    private String requireAdministrator(Instant now) {
        var actor = com.rehletshifaa.authority.application.Principal.current();
        if (actor.authenticatedAt() == null || actor.authenticatedAt().isBefore(now.minus(RECENT_AUTHENTICATION))
                || actor.authenticatedAt().isAfter(now.plusSeconds(60)))
            throw new ApiException(401, "REAUTHENTICATION_REQUIRED", "Sign in again before changing role assignments");
        authority.require(Permission.WORKFORCE_ADMINISTER);
        return actor.subject();
    }

    /** Stored timestamps have microsecond precision; normalising keeps adjacent periods from overlapping. */
    private static Instant micros(Instant value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.MICROS);
    }

    private static void selfChange() {
        throw new ApiException(409, "SELF_ROLE_CHANGE", "You cannot change your own role assignments");
    }

    private static String text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
        return value.trim();
    }
}
