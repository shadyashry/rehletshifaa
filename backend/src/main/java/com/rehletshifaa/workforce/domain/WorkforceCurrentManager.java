package com.rehletshifaa.workforce.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.UUID;

/** INV-27 current pointer: at most one current direct manager per person and function. */
@Entity
@IdClass(WorkforceCurrentManager.Key.class)
@Table(name = "workforce_current_managers")
public class WorkforceCurrentManager extends PersistableEntity<WorkforceCurrentManager.Key> {
    @Id @Column(name = "function_key", length = 50) private String functionKey;
    @Id @Column(name = "staff_subject", length = 255) private String staffSubject;
    @Column(name = "manager_subject", nullable = false, length = 255) private String managerSubject;
    @Column(name = "reporting_line_id", nullable = false, unique = true) private UUID reportingLineId;

    /** Composite key; component names match the {@code @Id} attributes. */
    public record Key(String functionKey, String staffSubject) implements Serializable {}

    protected WorkforceCurrentManager() {}

    public WorkforceCurrentManager(String functionKey, String staffSubject, String managerSubject, UUID reportingLineId) {
        this.functionKey = functionKey; this.staffSubject = staffSubject; this.managerSubject = managerSubject; this.reportingLineId = reportingLineId;
    }

    @Override public Key getId() { return new Key(functionKey, staffSubject); }
    public String getFunctionKey() { return functionKey; }
    public String getStaffSubject() { return staffSubject; }
    public String getManagerSubject() { return managerSubject; }
    public UUID getReportingLineId() { return reportingLineId; }
}
