package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A direct-manager relationship in one function (WF-05); history is kept, the current one is pointed to. */
@Entity
@Table(name = "workforce_reporting_lines")
public class WorkforceReportingLine extends AssignedIdEntity {
    @Column(name = "function_key", nullable = false, length = 50) private String functionKey;
    @Column(name = "staff_subject", nullable = false, length = 255) private String staffSubject;
    @Column(name = "manager_subject", nullable = false, length = 255) private String managerSubject;
    @Column(name = "effective_from", nullable = false) private Instant effectiveFrom;
    @Column(name = "effective_to") private Instant effectiveTo;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_by", nullable = false, length = 255) private String createdBy;
    @Column(nullable = false, length = 500) private String reason;
    @Column(nullable = false) private long revision;

    protected WorkforceReportingLine() {}

    public WorkforceReportingLine(UUID id, String functionKey, String staffSubject, String managerSubject, Instant effectiveFrom,
                                  String createdBy, String reason) {
        super(id);
        this.functionKey = functionKey; this.staffSubject = staffSubject; this.managerSubject = managerSubject;
        this.effectiveFrom = micros(effectiveFrom); this.status = "ACTIVE"; this.createdBy = createdBy; this.reason = reason;
    }

    public String getManagerSubject() { return managerSubject; }
    public Instant getEffectiveFrom() { return effectiveFrom; }
    public String getStatus() { return status; }
    public long getRevision() { return revision; }
}
