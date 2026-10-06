package com.rehletshifaa.identity.reconciliation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Singleton (id=1): after a database restore, workforce sign-in stays blocked until a POST_RESTORE reconciliation
 * passes. States READY → BLOCKED → CLEARED; a new restore id re-blocks.
 */
@Entity
@Table(name = "identity_restore_gate")
public class IdentityRestoreGate {
    static final int ID = 1;

    @Id private Integer id;
    @Column(name = "restore_id") private String restoreId;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "activated_at") private Instant activatedAt;
    @Column(name = "cleared_at") private Instant clearedAt;
    @Column(name = "cleared_by_run_id") private UUID clearedByRunId;
    @Column(nullable = false) private long revision;

    protected IdentityRestoreGate() {}

    void block(String newRestoreId, Instant at) {
        restoreId = newRestoreId; status = "BLOCKED"; activatedAt = micros(at); clearedAt = null; clearedByRunId = null; revision++;
    }

    /** Clears a blocked gate; a gate that is not blocked is left as it is. */
    boolean clear(UUID runId, Instant at) {
        if (!"BLOCKED".equals(status)) return false;
        status = "CLEARED"; clearedAt = micros(at); clearedByRunId = runId; revision++;
        return true;
    }

    public String getRestoreId() { return restoreId; }
    public String getStatus() { return status; }
    public Instant getActivatedAt() { return activatedAt; }
    public Instant getClearedAt() { return clearedAt; }
    public UUID getClearedByRunId() { return clearedByRunId; }
    public long getRevision() { return revision; }
}
