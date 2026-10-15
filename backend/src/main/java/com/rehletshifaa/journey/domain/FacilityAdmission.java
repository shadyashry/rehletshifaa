package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * The case's reservation with the hospital (architecture §4.2; P1-15). One per case: Operations reserves the facility and the
 * planned admission date in treatment coordination and may move either while the patient is not admitted. The letter, the
 * price check, the balance and the admission number are evidence rows ({@link CaseEvidence}); the money split lives on the
 * voucher ({@link AdmissionVoucher}).
 *
 * <p><b>Status.</b> {@code RESERVED} (asked of the hospital) to {@code CONFIRMED} (a voucher was issued against it) to
 * {@code ADMITTED} (the hospital's admission number is on file); {@code CANCELLED} when the case leaves the journey.
 */
@Entity
@Table(name = "facility_admissions")
public class FacilityAdmission extends AssignedIdEntity {
    public enum Status { RESERVED, CONFIRMED, ADMITTED, CANCELLED }

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "facility_id", nullable = false) private UUID facilityId;
    @Column(name = "planned_admission_at", nullable = false) private Instant plannedAdmissionAt;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected FacilityAdmission() {}

    public FacilityAdmission(UUID caseId, UUID facilityId, Instant plannedAdmissionAt, String by, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.facilityId = facilityId; this.plannedAdmissionAt = micros(plannedAdmissionAt);
        this.status = Status.RESERVED.name(); this.createdBy = by; this.createdAt = micros(at); this.updatedBy = by; this.updatedAt = micros(at);
    }

    /** A new facility or date: the reservation starts over (a voucher already issued is superseded by the caller). */
    public void reserve(UUID facilityId, Instant plannedAdmissionAt, String by, Instant at) {
        if (getStatus() == Status.ADMITTED) throw new IllegalStateException("The patient is already admitted");
        this.facilityId = facilityId; this.plannedAdmissionAt = micros(plannedAdmissionAt); this.status = Status.RESERVED.name(); touch(by, at);
    }

    public void confirm(String by, Instant at) {
        if (getStatus() == Status.RESERVED) { status = Status.CONFIRMED.name(); touch(by, at); }
    }

    public void admit(String by, Instant at) { status = Status.ADMITTED.name(); touch(by, at); }

    public void cancel(String by, Instant at) { status = Status.CANCELLED.name(); touch(by, at); }

    private void touch(String by, Instant at) { updatedBy = by; updatedAt = micros(at); version++; }

    public UUID getCaseId() { return caseId; }
    public UUID getFacilityId() { return facilityId; }
    public Instant getPlannedAdmissionAt() { return plannedAdmissionAt; }
    public Status getStatus() { return Status.valueOf(status); }
    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }
}
