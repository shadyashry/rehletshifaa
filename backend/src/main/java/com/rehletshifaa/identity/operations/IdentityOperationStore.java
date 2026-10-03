package com.rehletshifaa.identity.operations;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Service
public class IdentityOperationStore {
    static final long LEASE_SECONDS = 120;
    private static final long MAX_BACKOFF_SECONDS = 3600;
    private final JdbcClient jdbc;
    private final Clock clock;

    public IdentityOperationStore(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public List<Operation> claim(int batchSize) {
        Instant now = clock.instant();
        jdbc.sql("UPDATE identity_operations SET status='DEAD',last_error_code=COALESCE(last_error_code,'UNKNOWN_OUTCOME')," +
                        "updated_at=?,revision=revision+1 WHERE status='RUNNING' AND lease_expires_at<=? AND attempts>=max_attempts")
                .params(timestamp(now), timestamp(now)).update();
        List<Operation> due = jdbc.sql("SELECT id,idempotency_key,target_subject,operation_type,attempts,max_attempts,target_type,target_id,payload_encrypted FROM identity_operations " +
                        "WHERE abandoned_at IS NULL AND attempts<max_attempts AND next_attempt_at<=? " +
                        "AND (status IN ('PENDING','RETRYING') OR (status='RUNNING' AND lease_expires_at<=?)) " +
                        "ORDER BY created_at LIMIT " + batchSize + " FOR UPDATE SKIP LOCKED")
                .params(timestamp(now), timestamp(now)).query(this::map).list();
        Instant lease = now.plusSeconds(LEASE_SECONDS);
        for (Operation operation : due)
            jdbc.sql("UPDATE identity_operations SET status='RUNNING',attempts=attempts+1,lease_expires_at=?," +
                            "next_attempt_at=?,updated_at=?,revision=revision+1 WHERE id=?")
                    .params(timestamp(lease), timestamp(lease), timestamp(now), operation.id()).update();
        return due.stream().map(operation -> operation.claimed(lease)).toList();
    }

    @Transactional
    public boolean succeeded(Operation operation) { return succeeded(operation, null); }

    @Transactional
    public boolean succeeded(Operation operation, String resultSubject) {
        Instant now = clock.instant();
        return jdbc.sql("UPDATE identity_operations SET status='SUCCEEDED',completed_at=?,lease_expires_at=NULL,result_subject=COALESCE(?,result_subject)," +
                        "last_error_code=NULL,updated_at=?,revision=revision+1 WHERE id=? AND status='RUNNING' AND attempts=?")
                .params(timestamp(now), resultSubject, timestamp(now), operation.id(), operation.attempt()).update() == 1;
    }

    @Transactional
    public boolean failed(Operation operation, String code) {
        Instant now = clock.instant();
        boolean dead = operation.attempt() >= operation.maxAttempts();
        long delay = Math.min(MAX_BACKOFF_SECONDS, 30L * (1L << Math.min(operation.attempt(), 6)));
        return jdbc.sql("UPDATE identity_operations SET status=?,next_attempt_at=?,lease_expires_at=NULL,last_error_code=?," +
                        "updated_at=?,revision=revision+1 WHERE id=? AND status='RUNNING' AND attempts=?")
                .params(dead ? "DEAD" : "RETRYING", timestamp(now.plusSeconds(delay)), bounded(code), timestamp(now),
                        operation.id(), operation.attempt()).update() == 1;
    }

    @Transactional
    public boolean release(Operation operation) {
        Instant now = clock.instant();
        return jdbc.sql("UPDATE identity_operations SET status='RETRYING',attempts=attempts-1,next_attempt_at=?," +
                        "lease_expires_at=NULL,updated_at=?,revision=revision+1 WHERE id=? AND status='RUNNING' AND attempts=?")
                .params(timestamp(now), timestamp(now), operation.id(), operation.attempt()).update() == 1;
    }

    private Operation map(ResultSet rs, int row) throws SQLException {
        return new Operation(rs.getObject("id", UUID.class), rs.getString("idempotency_key"), rs.getString("target_subject"),
                IdentityOperationRequested.Type.valueOf(rs.getString("operation_type")), rs.getInt("attempts") + 1,
                rs.getInt("max_attempts"), null, rs.getString("target_type"), rs.getObject("target_id", UUID.class),
                rs.getString("payload_encrypted"));
    }

    private static String bounded(String value) {
        if (value == null || value.isBlank()) return "IDENTITY_PROVIDER_ERROR";
        String normalized = value.replaceAll("[^A-Za-z0-9_.-]", "_");
        return normalized.length() <= 80 ? normalized : normalized.substring(0, 80);
    }

    public record Operation(UUID id, String idempotencyKey, String subject, IdentityOperationRequested.Type type, int attempt,
                            int maxAttempts, Instant leaseExpiresAt, String targetType, UUID targetId, String payloadEncrypted) {
        Operation claimed(Instant lease) { return new Operation(id, idempotencyKey, subject, type, attempt, maxAttempts, lease,
                targetType, targetId, payloadEncrypted); }
    }
}
