package com.rehletshifaa.clinic.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** An open (or cancelled) consultation slot in a virtual clinic schedule. {@code version} is managed explicitly. */
@Entity
@Table(name = "consultation_slots")
public class ConsultationSlot extends AssignedIdEntity {
    @Column(name = "practitioner_id", nullable = false) private UUID practitionerId;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;
    @Column(name = "consultation_mode", nullable = false, length = 20) private String consultationMode;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "admin_note", length = 500) private String adminNote;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_by", nullable = false) private String updatedBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected ConsultationSlot() {}

    public ConsultationSlot(UUID practitionerId, Instant startsAt, Instant endsAt, String mode, String note, String by, Instant now) {
        super(UUID.randomUUID());
        this.practitionerId = practitionerId; this.startsAt = micros(startsAt); this.endsAt = micros(endsAt);
        this.consultationMode = mode; this.status = "OPEN"; this.adminNote = note;
        this.createdBy = by; this.createdAt = micros(now); this.updatedBy = by; this.updatedAt = micros(now);
    }

    /** Only an open slot at the version the caller saw may change. */
    public boolean isOpenAt(long expectedVersion) { return "OPEN".equals(status) && version == expectedVersion; }

    public void reschedule(Instant startsAt, Instant endsAt, String mode, String note, String by, Instant now) {
        this.startsAt = micros(startsAt); this.endsAt = micros(endsAt); this.consultationMode = mode; this.adminNote = note;
        touch(by, now);
    }

    public void cancel(String by, Instant now) {
        status = "CANCELLED";
        touch(by, now);
    }

    private void touch(String by, Instant now) { updatedBy = by; updatedAt = micros(now); version++; }

    public UUID getPractitionerId() { return practitionerId; }
    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public String getConsultationMode() { return consultationMode; }
    public String getStatus() { return status; }
    public String getAdminNote() { return adminNote; }
    public long getVersion() { return version; }
}
