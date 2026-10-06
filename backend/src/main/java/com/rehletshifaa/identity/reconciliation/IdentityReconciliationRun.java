package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One reconciliation of workforce records against the identity provider. */
@Entity
@Table(name = "identity_reconciliation_runs")
public class IdentityReconciliationRun extends AssignedIdEntity {
    @Column(name = "trigger_type", nullable = false, length = 20) private String triggerType;
    @Column(nullable = false, length = 30) private String status;
    @Column(name = "requested_by", nullable = false) private String requestedBy;
    @Column(nullable = false, length = 500) private String reason;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "checked_count", nullable = false) private int checkedCount;
    @Column(name = "discrepancy_count", nullable = false) private int discrepancyCount;

    protected IdentityReconciliationRun() {}

    IdentityReconciliationRun(String triggerType, String requestedBy, String reason, Instant startedAt) {
        super(UUID.randomUUID());
        this.triggerType = triggerType; this.status = "RUNNING"; this.requestedBy = requestedBy; this.reason = reason;
        this.startedAt = micros(startedAt);
    }

    /** Only a RUNNING run can finish, and only once. */
    boolean finish(String outcome, int checked, int discrepancies, Instant at) {
        if (!"RUNNING".equals(status)) return false;
        status = outcome; completedAt = micros(at); checkedCount = checked; discrepancyCount = discrepancies;
        return true;
    }

    public String getTriggerType() { return triggerType; }
    public String getStatus() { return status; }
    public String getRequestedBy() { return requestedBy; }
    public String getReason() { return reason; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public int getCheckedCount() { return checkedCount; }
    public int getDiscrepancyCount() { return discrepancyCount; }
}
