package com.rehletshifaa.access.platform.application;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.domain.Permission;

import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository;
import com.rehletshifaa.access.platform.infrastructure.PlatformAccessRepository.ChangeRequest;
import com.rehletshifaa.access.platform.infrastructure.WorkforceRoleAssignmentStore;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
public class PlatformAccessGovernanceService {
    private static final Duration RECENT_AUTHENTICATION = Duration.ofMinutes(10);
    private static final Duration REQUEST_LIFETIME = Duration.ofHours(72);
    private final PlatformAccessRepository repository;
    private final Authority authority;
    private final WorkforceRoleAssignmentStore roles;
    private final GovernanceAuditLog audit;
    private final Clock clock;

    public PlatformAccessGovernanceService(PlatformAccessRepository repository, Authority authority, WorkforceRoleAssignmentStore roles,             GovernanceAuditLog audit, Clock clock) {
        this.repository = repository;
        this.authority = authority;
        this.roles = roles;

        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public record Overview(java.util.List<PlatformAccessRepository.Assignment> administrators, java.util.List<ChangeRequest> requests) {}

    /** Who administers the platform now (and is scheduled to), and the two-person change requests. */
    public Overview overview() {
        authority.require(Permission.ACCESS_GOVERN);
        return new Overview(repository.administratorAssignments(clock.instant()), repository.recentRequests(50));
    }

    public ChangeRequest request(AdministratorChange command) {
        Instant now = clock.instant();
        repository.lockGovernance();
        var actor = requireAdministrator(now);
        text(command.subject(), 255, "Choose a workforce person");
        text(command.reason(), 1000, "Give a reason for this privileged change");
        if (actor.subject().equals(command.subject()))
            throw new ApiException(409, "SELF_PRIVILEGED_CHANGE", "You cannot grant or revoke your own privileged access");
        if (!repository.workforceSubject(command.subject()))
            throw new ApiException(404, "WORKFORCE_PERSON_NOT_FOUND", "Workforce person not found");
        if (command.type() == null || command.effectiveFrom() == null)
            throw new ApiException(400, "INVALID_ADMINISTRATOR_CHANGE", "Choose an action and effective date");
        if (command.effectiveTo() != null && !command.effectiveTo().isAfter(command.effectiveFrom()))
            throw new ApiException(400, "INVALID_EFFECTIVE_PERIOD", "Choose a valid effective period");

        PlatformAccessRepository.Assignment assignment = null;
        if (command.type() == ChangeType.APPOINT) {
            if (repository.overlappingAdministratorAssignment(command.subject(), command.effectiveFrom(), command.effectiveTo()))
                throw new ApiException(409, "OVERLAPPING_ADMIN_ASSIGNMENT", "An overlapping administrator assignment already exists");
            roleConflict(command.subject(), command.effectiveFrom(), command.effectiveTo());
        } else {
            if (command.effectiveTo() != null)
                throw new ApiException(400, "INVALID_ADMINISTRATOR_CHANGE", "Removal does not accept an end date");
            assignment = repository.removableAssignment(command.subject(), command.effectiveFrom());
        }
        ChangeRequest request = repository.insertRequest(command.type().name(), command.subject(), assignment,
                command.effectiveFrom(), command.effectiveTo(), actor.subject(), command.reason(), now, now.plus(REQUEST_LIFETIME));
        audit.record(actor.subject(), request.id().toString(), "PRIVILEGED_ACCESS_CHANGE_REQUESTED", "SUCCESS",
                command.type() + "; subject=" + command.subject() + "; " + command.reason());
        return request;
    }

    @Transactional
    public ChangeRequest approve(UUID requestId, Decision command) {
        Instant now = clock.instant();
        repository.lockGovernance();
        var actor = requireAdministrator(now);
        text(command.reason(), 1000, "Give a reason for this decision");
        ChangeRequest request = repository.requestForUpdate(requestId);
        pending(request, command.revision(), now);
        checker(request, actor.subject());

        if (request.type().equals(ChangeType.APPOINT.name())) {
            if (repository.overlappingAdministratorAssignment(request.subject(), request.effectiveFrom(), request.effectiveTo()))
                throw new ApiException(409, "OVERLAPPING_ADMIN_ASSIGNMENT", "An overlapping administrator assignment already exists");
            roleConflict(request.subject(), request.effectiveFrom(), request.effectiveTo());
            repository.insertAssignment(request.subject(), request.effectiveFrom(), request.effectiveTo(), actor.subject(),
                    requestReason(request, command.reason()), now);
        } else {
            repository.removeAssignment(request.assignmentId(), request.assignmentRevision(), request.effectiveFrom(), now);
        }
        assertInvariant(now);
        repository.decide(request.id(), request.revision(), "APPROVED", actor.subject(), command.reason(), now);
        audit.record(actor.subject(), request.id().toString(), "PRIVILEGED_ACCESS_CHANGE_APPROVED", "SUCCESS",
                request.type() + "; subject=" + request.subject() + "; " + command.reason());
        return repository.requestForUpdate(requestId);
    }

    @Transactional
    public ChangeRequest reject(UUID requestId, Decision command) {
        Instant now = clock.instant();
        repository.lockGovernance();
        var actor = requireAdministrator(now);
        text(command.reason(), 1000, "Give a reason for this decision");
        ChangeRequest request = repository.requestForUpdate(requestId);
        pending(request, command.revision(), now);
        checker(request, actor.subject());
        repository.decide(request.id(), request.revision(), "REJECTED", actor.subject(), command.reason(), now);
        audit.record(actor.subject(), request.id().toString(), "PRIVILEGED_ACCESS_CHANGE_REJECTED", "SUCCESS", command.reason());
        return repository.requestForUpdate(requestId);
    }

    /** Acquire before changing workforce/access-subject lifecycle; the caller's transaction retains the lock. */
    public void lockLifecycleGovernance() { repository.lockGovernance(); }

    /** Call after the lifecycle mutation, in the same transaction as {@link #lockLifecycleGovernance()}. */
    public void assertAdministratorInvariant() {
        // Compatibility mode: legacy authority continues to operate until the first target assignment is provisioned.
        if (repository.governanceInitialized()) assertInvariant(clock.instant());
    }

    private com.rehletshifaa.authority.application.Principal requireAdministrator(Instant now) {
        var actor = com.rehletshifaa.authority.application.Principal.current();
        if (actor.authenticatedAt() == null || actor.authenticatedAt().isBefore(now.minus(RECENT_AUTHENTICATION))
                || actor.authenticatedAt().isAfter(now.plusSeconds(60)))
            throw new ApiException(401, "REAUTHENTICATION_REQUIRED", "Sign in again before changing administrator access");
        authority.require(Permission.ACCESS_GOVERN);
        return actor;
    }

    /** SOD-04, evaluated when requested and again at decision time. */
    private void roleConflict(String subject, Instant from, Instant to) {
        roles.conflict(subject, PlatformAccessRepository.SYSTEM_ADMINISTRATOR, from, to).ifPresent(rule -> {
            throw new ApiException(409, "ROLE_CONFLICT", rule);
        });
    }

    private void checker(ChangeRequest request, String approver) {
        if (request.requestedBy().equals(approver))
            throw new ApiException(409, "MAKER_CHECKER_REQUIRED", "Another System Administrator must decide this request");
        if (request.subject().equals(approver))
            throw new ApiException(409, "SELF_PRIVILEGED_CHANGE", "You cannot approve your own privileged access change");
    }

    private void pending(ChangeRequest request, long revision, Instant now) {
        if (!request.status().equals("PENDING") || request.revision() != revision)
            throw new ApiException(409, "STALE_CHANGE_REQUEST", "The privileged change request changed; reload and try again");
        if (!request.expiresAt().isAfter(now)) {
            repository.expire(request.id(), request.revision());
            throw new ApiException(409, "CHANGE_REQUEST_EXPIRED", "The privileged change request expired");
        }
    }

    private void assertInvariant(Instant now) {
        if (repository.effectiveAdministrators(now).isEmpty()) lastAdministrator();
        for (Instant boundary : repository.administratorBoundaries(now))
            if (repository.effectiveAdministrators(boundary).isEmpty()) lastAdministrator();
        if (!repository.hasIndefiniteEligibleAdministrator()) lastAdministrator();
    }

    private static void lastAdministrator() {
        throw new ApiException(409, "LAST_EFFECTIVE_SYSTEM_ADMINISTRATOR", "The change would leave the platform without an effective System Administrator");
    }

    private static String requestReason(ChangeRequest request, String approvalReason) {
        return "Approved request " + request.id() + ": " + approvalReason;
    }

    private static void text(String value, int max, String message) {
        if (value == null || value.isBlank() || value.length() > max) throw new ApiException(400, "INVALID_REQUEST", message);
    }

    public enum ChangeType { APPOINT, REMOVE }
    public record AdministratorChange(ChangeType type, String subject, Instant effectiveFrom, Instant effectiveTo, String reason) {}
    public record Decision(long revision, String reason) {}
}
