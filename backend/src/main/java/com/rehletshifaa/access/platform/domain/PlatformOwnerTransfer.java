package com.rehletshifaa.access.platform.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A three-party Platform Account Owner transfer: initiated by the owner, accepted by the successor, verified independently. */
@Entity
@Table(name = "platform_owner_transfer_requests")
public class PlatformOwnerTransfer extends AssignedIdEntity {
    @Column(name = "current_owner_subject", nullable = false) private String currentOwnerSubject;
    @Column(name = "incoming_owner_subject", nullable = false) private String incomingOwnerSubject;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "initiated_by", nullable = false) private String initiatedBy;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(name = "initiated_at", nullable = false) private Instant initiatedAt;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(nullable = false) private long revision;

    protected PlatformOwnerTransfer() {}

    public PlatformOwnerTransfer(UUID id, String currentOwner, String incomingOwner, String initiatedBy, String reason, Instant now, Instant expiresAt) {
        super(id);
        this.currentOwnerSubject = currentOwner; this.incomingOwnerSubject = incomingOwner; this.status = "PENDING_ACCEPTANCE";
        this.initiatedBy = initiatedBy; this.reason = reason; this.initiatedAt = micros(now); this.expiresAt = micros(expiresAt);
    }

    public String getCurrentOwnerSubject() { return currentOwnerSubject; }
    public String getIncomingOwnerSubject() { return incomingOwnerSubject; }
    public String getStatus() { return status; }
    public String getInitiatedBy() { return initiatedBy; }
    public String getReason() { return reason; }
    public Instant getInitiatedAt() { return initiatedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public long getRevision() { return revision; }
}
