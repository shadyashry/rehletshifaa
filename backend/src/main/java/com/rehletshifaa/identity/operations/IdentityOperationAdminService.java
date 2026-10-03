package com.rehletshifaa.identity.operations;

import com.rehletshifaa.authority.application.Authority;
import com.rehletshifaa.authority.application.Principal;
import com.rehletshifaa.authority.domain.Permission;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class IdentityOperationAdminService {
    private final JdbcClient jdbc;
    private final Authority authority;
    private final Clock clock;

    public IdentityOperationAdminService(JdbcClient jdbc, Authority authority, Clock clock) {
        this.jdbc = jdbc;
        this.authority = authority;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<View> list(String status) {
        authority.require(Permission.IDENTITY_OPERATIONS_READ);
        if (status != null && !List.of("PENDING", "RUNNING", "RETRYING", "SUCCEEDED", "DEAD").contains(status))
            throw new ApiException(400, "IDENTITY_OPERATION_STATUS_INVALID", "Choose a valid identity operation status");
        String sql = "SELECT id,target_subject,operation_type,status,attempts,max_attempts,next_attempt_at,last_error_code," +
                "correlation_id,requested_by,reason,created_at,updated_at,completed_at,abandoned_at,abandoned_by,abandon_reason,revision " +
                "FROM identity_operations" + (status == null ? "" : " WHERE status=?") + " ORDER BY created_at DESC";
        var query = jdbc.sql(sql);
        if (status != null) query.param(status);
        return query.query(this::view).list();
    }

    @Transactional
    public View retry(UUID id, Change command) {
        var actor = authority.require(Permission.IDENTITY_OPERATIONS_MANAGE);
        String reason = reason(command);
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE identity_operations SET status='PENDING',attempts=0,next_attempt_at=?,lease_expires_at=NULL," +
                        "last_error_code=NULL,abandoned_at=NULL,abandoned_by=NULL,abandon_reason=NULL,updated_at=?,revision=revision+1 " +
                        "WHERE id=? AND status='DEAD' AND revision=?")
                .params(timestamp(now), timestamp(now), id, command.expectedRevision()).update();
        if (changed != 1) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Reload the identity operation and try again");
        audit(actor, id, "IDENTITY_OPERATION_RETRIED", reason);
        return get(id);
    }

    @Transactional
    public View abandon(UUID id, Change command) {
        var actor = authority.require(Permission.IDENTITY_OPERATIONS_MANAGE);
        String reason = reason(command);
        Instant now = clock.instant();
        int changed = jdbc.sql("UPDATE identity_operations SET status='DEAD',abandoned_at=?,abandoned_by=?,abandon_reason=?," +
                        "lease_expires_at=NULL,updated_at=?,revision=revision+1 WHERE id=? AND status IN ('PENDING','RETRYING','DEAD') " +
                        "AND abandoned_at IS NULL AND revision=?")
                .params(timestamp(now), actor.subject(), reason, timestamp(now), id, command.expectedRevision()).update();
        if (changed != 1) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Reload the identity operation and try again");
        audit(actor, id, "IDENTITY_OPERATION_ABANDONED", reason);
        return get(id);
    }

    private View get(UUID id) {
        return jdbc.sql("SELECT id,target_subject,operation_type,status,attempts,max_attempts,next_attempt_at,last_error_code," +
                        "correlation_id,requested_by,reason,created_at,updated_at,completed_at,abandoned_at,abandoned_by,abandon_reason,revision " +
                        "FROM identity_operations WHERE id=?")
                .param(id).query(this::view).optional()
                .orElseThrow(() -> new ApiException(404, "IDENTITY_OPERATION_NOT_FOUND", "Identity operation was not found"));
    }

    private View view(ResultSet rs, int row) throws SQLException {
        return new View(rs.getObject("id", UUID.class), rs.getString("target_subject"), rs.getString("operation_type"),
                rs.getString("status"), rs.getInt("attempts"), rs.getInt("max_attempts"), instant(rs, "next_attempt_at"),
                rs.getString("last_error_code"), rs.getString("correlation_id"), rs.getString("requested_by"),
                rs.getString("reason"), instant(rs, "created_at"), instant(rs, "updated_at"), instant(rs, "completed_at"),
                instant(rs, "abandoned_at"), rs.getString("abandoned_by"), rs.getString("abandon_reason"), rs.getLong("revision"));
    }

    private void audit(Principal actor, UUID id, String event, String reason) {
        jdbc.sql("INSERT INTO audit_events(id,event_type,actor_subject,actor_role,entity_type,entity_id,action,outcome,reason,occurred_at) " +
                        "VALUES(?,?,?,?,?,?,?,?,?,?)")
                .params(UUID.randomUUID(), event, actor.subject(), "SYSTEM_ADMINISTRATOR", "IdentityOperation", id.toString(),
                        event.endsWith("RETRIED") ? "RETRY" : "ABANDON", "SUCCESS", reason, timestamp(clock.instant())).update();
    }

    private static String reason(Change command) {
        if (command == null || command.reason() == null || command.reason().isBlank())
            throw new ApiException(400, "REASON_REQUIRED", "A reason is required");
        String reason = command.reason().trim();
        if (reason.length() > 500) throw new ApiException(400, "REASON_TOO_LONG", "The reason is too long");
        return reason;
    }

    private static Instant instant(ResultSet rs, String name) throws SQLException {
        var value = rs.getTimestamp(name);
        return value == null ? null : value.toInstant();
    }

    public record Change(long expectedRevision, String reason) {}
    public record View(UUID id, String targetSubject, String operationType, String status, int attempts, int maxAttempts,
                       Instant nextAttemptAt, String lastErrorCode, String correlationId, String requestedBy, String reason,
                       Instant createdAt, Instant updatedAt, Instant completedAt, Instant abandonedAt, String abandonedBy,
                       String abandonReason, long revision) {}
}
