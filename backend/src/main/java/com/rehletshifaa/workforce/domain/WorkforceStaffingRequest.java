package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** STF-11: a function manager's staffing request; a System Administrator executes or rejects it. */
@Entity
@Table(name = "workforce_staffing_requests")
public class WorkforceStaffingRequest extends AssignedIdEntity {
    @Column(name = "function_key", nullable = false, length = 50) private String functionKey;
    @Column(name = "request_type", nullable = false, length = 30) private String requestType;
    @Column(length = 255) private String subject;
    @Column(nullable = false, length = 2000) private String details;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "requested_by", nullable = false, length = 255) private String requestedBy;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "decided_by", length = 255) private String decidedBy;
    @Column(name = "decided_at") private Instant decidedAt;
    @Column(name = "decision_reason", length = 1000) private String decisionReason;
    @Column(name = "execution_reference", length = 255) private String executionReference;
    @Column(nullable = false) private long revision;

    protected WorkforceStaffingRequest() {}

    public WorkforceStaffingRequest(UUID id, String functionKey, String requestType, String subject, String details,
                                    String requestedBy, Instant requestedAt) {
        super(id);
        this.functionKey = functionKey; this.requestType = requestType; this.subject = subject; this.details = details;
        this.status = "SUBMITTED"; this.requestedBy = requestedBy; this.requestedAt = micros(requestedAt);
    }

    public String getFunctionKey() { return functionKey; }
    public String getRequestType() { return requestType; }
    public String getSubject() { return subject; }
    public String getDetails() { return details; }
    public String getStatus() { return status; }
    public String getRequestedBy() { return requestedBy; }
    public Instant getRequestedAt() { return requestedAt; }
    public String getDecidedBy() { return decidedBy; }
    public String getDecisionReason() { return decisionReason; }
    public String getExecutionReference() { return executionReference; }
    public long getRevision() { return revision; }
}
