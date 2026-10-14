package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The transaction reference a patient entered for their bank transfer of the coordination deposit (DEP-3). Finance
 * verifies it against the bank: CONFIRMED records the amount received, REJECTED returns the step to the patient with a
 * reason. The deposit never settles without one.
 */
@Entity
@Table(name = "deposit_transfer_reports")
public class DepositTransferReport extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "deposit_id", nullable = false) private UUID depositId;
    @Column(nullable = false, length = 20) private String method;
    @Column(name = "transfer_reference", nullable = false, length = 64) private String transferReference;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "submitted_by", nullable = false, length = 255) private String submittedBy;
    @Column(name = "submitted_at", nullable = false) private Instant submittedAt;
    @Column(name = "decided_by", length = 255) private String decidedBy;
    @Column(name = "decided_at") private Instant decidedAt;
    @Column(name = "decision_reason", length = 500) private String decisionReason;
    @Column(nullable = false) private long version;
    @Column(name = "agent_name", length = 120) private String agentName;

    protected DepositTransferReport() {}

    /** A bank-transfer reference just submitted for Finance to verify. */
    public DepositTransferReport(UUID id, UUID caseId, UUID depositId, String transferReference, String submittedBy, Instant now) {
        this(id, caseId, depositId, "BANK_TRANSFER", null, transferReference, submittedBy, now);
    }

    /**
     * A proof of payment just submitted for Finance to verify: a bank reference ({@code BANK_TRANSFER}, no agent) or the
     * receipt number of cash paid through a named agent ({@code AGENT_CASH}, P0-4). The CHECK constraint ties the two.
     */
    public DepositTransferReport(UUID id, UUID caseId, UUID depositId, String method, String agentName, String transferReference,
                                 String submittedBy, Instant now) {
        super(id);
        this.caseId = caseId; this.depositId = depositId; this.method = method; this.agentName = agentName; this.transferReference = transferReference;
        this.status = "SUBMITTED"; this.submittedBy = submittedBy; this.submittedAt = micros(now);
    }
}
