package com.rehletshifaa.facility.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The facility's packages are suspended pending review (P1-19, design §7.5): an unapproved extra on its final invoices twice in a
 * calendar quarter. While open, the facility's packages release no proposal line without a Finance check and are not offered in
 * the directory; care already reserved goes on. A Finance Manager lifts it after the review, with a note. At most one is open per
 * facility (kept under the facility's row lock).
 */
@Entity
@Table(name = "facility_package_suspensions")
public class FacilityPackageSuspension extends AssignedIdEntity {
    public static final String REPEATED_UNAPPROVED_EXTRAS = "REPEATED_UNAPPROVED_EXTRAS";

    @Column(name = "facility_id", nullable = false) private UUID facilityId;
    @Column(nullable = false, length = 40) private String reason;
    @Column(name = "trigger_case_id") private UUID triggerCaseId;
    @Column(nullable = false, length = 7) private String quarter;
    @Column(nullable = false) private int occurrences;
    @Column(name = "suspended_at", nullable = false) private Instant suspendedAt;
    @Column(name = "lifted_by") private String liftedBy;
    @Column(name = "lifted_at") private Instant liftedAt;
    @Column(name = "lift_note", length = 2000) private String liftNote;
    @Column(nullable = false) private long version;

    protected FacilityPackageSuspension() {}

    public FacilityPackageSuspension(UUID facilityId, UUID triggerCaseId, String quarter, int occurrences, Instant now) {
        super(UUID.randomUUID());
        this.facilityId = facilityId; this.reason = REPEATED_UNAPPROVED_EXTRAS; this.triggerCaseId = triggerCaseId; this.quarter = quarter;
        this.occurrences = occurrences; this.suspendedAt = micros(now);
    }

    public boolean isOpen() { return liftedAt == null; }

    public void lift(String by, String note, Instant at) {
        if (!isOpen()) throw new IllegalStateException("Already lifted");
        liftedBy = by; liftNote = note; liftedAt = micros(at); version++;
    }

    public UUID getFacilityId() { return facilityId; }
    public String getReason() { return reason; }
    public UUID getTriggerCaseId() { return triggerCaseId; }
    public String getQuarter() { return quarter; }
    public int getOccurrences() { return occurrences; }
    public Instant getSuspendedAt() { return suspendedAt; }
    public String getLiftedBy() { return liftedBy; }
    public Instant getLiftedAt() { return liftedAt; }
    public String getLiftNote() { return liftNote; }
}
