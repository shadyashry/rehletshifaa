package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** SUP-03: an MFA reset requested by support and decided by an independent administrator. */
@Entity
@Table(name = "mfa_reset_requests")
public class MfaResetRequest extends AssignedIdEntity {
    @Column(nullable = false) private String subject;
    @Column(name = "requested_by", nullable = false) private String requestedBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "decided_by") private String decidedBy;
    @Column(name = "decided_at") private Instant decidedAt;
    @Column(name = "decision_reason", length = 1000) private String decisionReason;
    @Column(nullable = false) private long revision;

    protected MfaResetRequest() {}

    public MfaResetRequest(UUID id, String subject, String requestedBy, String reason, Instant requestedAt, Instant expiresAt) {
        super(id);
        this.subject = subject; this.requestedBy = requestedBy; this.reason = reason; this.status = "PENDING";
        this.requestedAt = micros(requestedAt); this.expiresAt = micros(expiresAt);
    }

    public String getSubject() { return subject; }
    public String getRequestedBy() { return requestedBy; }
    public String getReason() { return reason; }
    public String getStatus() { return status; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public String getDecidedBy() { return decidedBy; }
    public long getRevision() { return revision; }
}
