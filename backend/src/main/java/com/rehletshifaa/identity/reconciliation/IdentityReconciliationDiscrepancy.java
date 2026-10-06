package com.rehletshifaa.identity.reconciliation;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A difference between the workforce record and the identity provider found by one run. Append-only. */
@Entity
@Immutable
@Table(name = "identity_reconciliation_discrepancies")
public class IdentityReconciliationDiscrepancy extends AssignedIdEntity {
    @Column(name = "run_id", nullable = false) private UUID runId;
    @Column(nullable = false) private String subject;
    @Column(name = "discrepancy_type", nullable = false, length = 50) private String discrepancyType;
    @Column(name = "database_state", length = 80) private String databaseState;
    @Column(name = "identity_state", length = 80) private String identityState;
    @Column(name = "detected_at", nullable = false) private Instant detectedAt;

    protected IdentityReconciliationDiscrepancy() {}

    IdentityReconciliationDiscrepancy(UUID runId, String subject, String type, String databaseState, String identityState, Instant at) {
        super(UUID.randomUUID());
        this.runId = runId; this.subject = subject; this.discrepancyType = type; this.databaseState = databaseState;
        this.identityState = identityState; this.detectedAt = micros(at);
    }

    public UUID getRunId() { return runId; }
    public String getSubject() { return subject; }
    public String getDiscrepancyType() { return discrepancyType; }
    public String getDatabaseState() { return databaseState; }
    public String getIdentityState() { return identityState; }
    public Instant getDetectedAt() { return detectedAt; }
}
