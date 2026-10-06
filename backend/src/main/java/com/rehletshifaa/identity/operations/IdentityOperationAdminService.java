package com.rehletshifaa.identity.operations;

import com.rehletshifaa.shared.audit.AuditTrail;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class IdentityOperationAdminService {
    private final AuditTrail auditTrail;
    private static final int LIST_LIMIT = 500;
    private final IdentityOperationRepository operations;
    private final Authority authority;
    private final Clock clock;

    public IdentityOperationAdminService(IdentityOperationRepository operations, Authority authority, Clock clock, AuditTrail auditTrail) { this.auditTrail = auditTrail;
        this.operations = operations;
        this.authority = authority;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<View> list(String status) {
        authority.require(Permission.IDENTITY_OPERATIONS_READ);
        if (status != null && !List.of("PENDING", "RUNNING", "RETRYING", "SUCCEEDED", "DEAD").contains(status))
            throw new ApiException(400, "IDENTITY_OPERATION_STATUS_INVALID", "Choose a valid identity operation status");
        // Newest first and bounded: succeeded operations accumulate forever and the console needs recent ones.
        return (status == null ? operations.findNewest(Limit.of(LIST_LIMIT)) : operations.findNewestByStatus(status, Limit.of(LIST_LIMIT)))
                .stream().map(IdentityOperationAdminService::view).toList();
    }

    @Transactional
    public View retry(UUID id, Change command) {
        var actor = authority.require(Permission.IDENTITY_OPERATIONS_MANAGE);
        String reason = reason(command);
        Instant now = clock.instant();
        int changed = operations.retry(id, command.expectedRevision(), micros(now));
        if (changed != 1) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Reload the identity operation and try again");
        audit(actor, id, "IDENTITY_OPERATION_RETRIED", reason);
        return get(id);
    }

    @Transactional
    public View abandon(UUID id, Change command) {
        var actor = authority.require(Permission.IDENTITY_OPERATIONS_MANAGE);
        String reason = reason(command);
        Instant now = clock.instant();
        int changed = operations.abandon(id, command.expectedRevision(), actor.subject(), reason, micros(now));
        if (changed != 1) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Reload the identity operation and try again");
        audit(actor, id, "IDENTITY_OPERATION_ABANDONED", reason);
        return get(id);
    }

    private View get(UUID id) {
        return operations.findById(id).map(IdentityOperationAdminService::view)
                .orElseThrow(() -> new ApiException(404, "IDENTITY_OPERATION_NOT_FOUND", "Identity operation was not found"));
    }

    private static View view(IdentityOperation o) {
        return new View(o.getId(), o.getTargetSubject(), o.getOperationType(), o.getStatus(), o.getAttempts(), o.getMaxAttempts(),
                o.getNextAttemptAt(), o.getLastErrorCode(), o.getCorrelationId(), o.getRequestedBy(), o.getReason(), o.getCreatedAt(),
                o.getUpdatedAt(), o.getCompletedAt(), o.getAbandonedAt(), o.getAbandonedBy(), o.getAbandonReason(), o.getRevision());
    }

    private void audit(Principal actor, UUID id, String event, String reason) {
        auditTrail.event(event).actor(actor.subject(), "SYSTEM_ADMINISTRATOR").entity("IdentityOperation", id).action(event.endsWith("RETRIED") ? "RETRY" : "ABANDON").reason(reason).record();
    }

    private static String reason(Change command) {
        if (command == null || command.reason() == null || command.reason().isBlank())
            throw new ApiException(400, "REASON_REQUIRED", "A reason is required");
        String reason = command.reason().trim();
        if (reason.length() > 500) throw new ApiException(400, "REASON_TOO_LONG", "The reason is too long");
        return reason;
    }

    public record Change(long expectedRevision, String reason) {}
    public record View(UUID id, String targetSubject, String operationType, String status, int attempts, int maxAttempts,
                       Instant nextAttemptAt, String lastErrorCode, String correlationId, String requestedBy, String reason,
                       Instant createdAt, Instant updatedAt, Instant completedAt, Instant abandonedAt, String abandonedBy,
                       String abandonReason, long revision) {}
}
