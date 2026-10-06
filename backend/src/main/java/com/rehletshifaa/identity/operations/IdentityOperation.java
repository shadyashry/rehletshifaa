package com.rehletshifaa.identity.operations;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A durable identity-provider command (outbox row): recorded in the business transaction, executed after commit by
 * leased, retried workers. State changes go through {@link IdentityOperationRepository}'s guarded updates so two
 * workers can never both own an attempt.
 */
@Entity
@Table(name = "identity_operations")
public class IdentityOperation extends AssignedIdEntity {
    @Column(name = "idempotency_key", nullable = false, unique = true) private String idempotencyKey;
    @Column(name = "target_subject") private String targetSubject;
    @Column(name = "target_type", length = 40) private String targetType;
    @Column(name = "target_id") private UUID targetId;
    @Column(name = "payload_encrypted", columnDefinition = "text") private String payloadEncrypted;
    @Column(name = "result_subject") private String resultSubject;
    @Column(name = "operation_type", nullable = false, length = 40) private String operationType;
    @Column(nullable = false, length = 20) private String status;
    @Column(nullable = false) private int attempts;
    @Column(name = "max_attempts", nullable = false) private int maxAttempts;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(name = "lease_expires_at") private Instant leaseExpiresAt;
    @Column(name = "last_error_code", length = 80) private String lastErrorCode;
    @Column(name = "correlation_id", nullable = false, length = 100) private String correlationId;
    @Column(name = "requested_by", nullable = false) private String requestedBy;
    @Column(nullable = false, length = 500) private String reason;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "abandoned_at") private Instant abandonedAt;
    @Column(name = "abandoned_by") private String abandonedBy;
    @Column(name = "abandon_reason", length = 500) private String abandonReason;
    @Column(nullable = false) private long revision;

    protected IdentityOperation() {}

    IdentityOperation(UUID id, String idempotencyKey, String targetSubject, String operationType, int maxAttempts, String correlationId,
                      String requestedBy, String reason, String targetType, UUID targetId, String payloadEncrypted, Instant now) {
        super(id);
        this.idempotencyKey = idempotencyKey; this.targetSubject = targetSubject; this.operationType = operationType;
        this.status = "PENDING"; this.maxAttempts = maxAttempts; this.nextAttemptAt = micros(now); this.correlationId = correlationId;
        this.requestedBy = requestedBy; this.reason = reason; this.createdAt = micros(now); this.updatedAt = micros(now);
        this.targetType = targetType; this.targetId = targetId; this.payloadEncrypted = payloadEncrypted;
    }

    public String getIdempotencyKey() { return idempotencyKey; }
    public String getTargetSubject() { return targetSubject; }
    public String getTargetType() { return targetType; }
    public UUID getTargetId() { return targetId; }
    public String getPayloadEncrypted() { return payloadEncrypted; }
    public String getOperationType() { return operationType; }
    public String getStatus() { return status; }
    public int getAttempts() { return attempts; }
    public int getMaxAttempts() { return maxAttempts; }
    public Instant getNextAttemptAt() { return nextAttemptAt; }
    public String getLastErrorCode() { return lastErrorCode; }
    public String getCorrelationId() { return correlationId; }
    public String getRequestedBy() { return requestedBy; }
    public String getReason() { return reason; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public Instant getAbandonedAt() { return abandonedAt; }
    public String getAbandonedBy() { return abandonedBy; }
    public String getAbandonReason() { return abandonReason; }
    public long getRevision() { return revision; }
}
