package com.rehletshifaa.identity.operations;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class IdentityOperationStore {
    static final long LEASE_SECONDS = 120;
    private static final long MAX_BACKOFF_SECONDS = 3600;
    private final IdentityOperationRepository operations;
    private final Clock clock;

    public IdentityOperationStore(IdentityOperationRepository operations, Clock clock) {
        this.operations = operations;
        this.clock = clock;
    }

    /** Leases up to {@code batchSize} due operations; rows another worker holds are skipped, not waited for. */
    @Transactional
    public List<Operation> claim(int batchSize) {
        Instant now = micros(clock.instant());
        operations.expireExhaustedLeases(now);
        List<Operation> due = operations.lockDue(now, Limit.of(batchSize)).stream().map(IdentityOperationStore::operation).toList();
        Instant lease = now.plusSeconds(LEASE_SECONDS);
        for (Operation operation : due) operations.claim(operation.id(), lease, now);
        return due.stream().map(operation -> operation.claimed(lease)).toList();
    }

    @Transactional
    public boolean succeeded(Operation operation) { return succeeded(operation, null); }

    @Transactional
    public boolean succeeded(Operation operation, String resultSubject) {
        return operations.succeed(operation.id(), operation.attempt(), resultSubject, micros(clock.instant())) == 1;
    }

    @Transactional
    public boolean failed(Operation operation, String code) {
        Instant now = micros(clock.instant());
        boolean dead = operation.attempt() >= operation.maxAttempts();
        long delay = Math.min(MAX_BACKOFF_SECONDS, 30L * (1L << Math.min(operation.attempt(), 6)));
        return operations.fail(operation.id(), operation.attempt(), dead ? "DEAD" : "RETRYING", now.plusSeconds(delay), bounded(code), now) == 1;
    }

    @Transactional
    public boolean release(Operation operation) {
        return operations.release(operation.id(), operation.attempt(), micros(clock.instant())) == 1;
    }

    /** The attempt number of a claimed row is the stored count plus the one being started. */
    private static Operation operation(IdentityOperation o) {
        return new Operation(o.getId(), o.getIdempotencyKey(), o.getTargetSubject(), IdentityOperationRequested.Type.valueOf(o.getOperationType()),
                o.getAttempts() + 1, o.getMaxAttempts(), null, o.getTargetType(), o.getTargetId(), o.getPayloadEncrypted());
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
