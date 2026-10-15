package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * One follow-up contact (P1-18; architecture §4.6): the first from the follow-up plan, the rest as the Consultant adds them. Held
 * ({@code DONE}) or missed ({@code MISSED}) with a ledger row, or cancelled; the note may hold clinical detail and is encrypted.
 * The patient is reminded once, the day before.
 */
@Entity
@Table(name = "follow_up_contacts")
public class FollowUpContact extends AssignedIdEntity {
    public enum Origin { PLAN, ADDED }
    public enum Status { SCHEDULED, DONE, MISSED, CANCELLED }

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "follow_up_plan_id", nullable = false) private UUID followUpPlanId;
    @Column(nullable = false, length = 10) private String origin;
    @Column(name = "due_at", nullable = false) private Instant dueAt;
    @Column(nullable = false, length = 20) private String mode;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "reminder_sent_at") private Instant reminderSentAt;
    @Column(name = "recorded_by") private String recordedBy;
    @Column(name = "recorded_at") private Instant recordedAt;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String note;
    @Column(name = "evidence_id") private UUID evidenceId;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(nullable = false) private long version;

    protected FollowUpContact() {}

    public FollowUpContact(UUID caseId, UUID followUpPlanId, Origin origin, Instant dueAt, String mode, String createdBy, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.followUpPlanId = followUpPlanId; this.origin = origin.name(); this.dueAt = micros(dueAt); this.mode = mode;
        this.status = Status.SCHEDULED.name(); this.createdBy = createdBy; this.createdAt = micros(at);
    }

    /** The Consultant held it or the patient missed it: once, with the ledger row. */
    public void record(Status outcome, String note, UUID evidenceId, String subject, Instant at) {
        if (outcome != Status.DONE && outcome != Status.MISSED) throw new IllegalArgumentException("A contact is recorded as held or missed");
        requireScheduled();
        status = outcome.name(); this.note = note; this.evidenceId = evidenceId; recordedBy = subject; recordedAt = micros(at);
    }

    public void cancel(String note, String subject, Instant at) {
        requireScheduled();
        status = Status.CANCELLED.name(); this.note = note; recordedBy = subject; recordedAt = micros(at);
    }

    public void reminded(Instant at) { reminderSentAt = micros(at); }

    private void requireScheduled() { if (getStatus() != Status.SCHEDULED) throw new IllegalStateException("The contact is no longer scheduled"); }

    public UUID getCaseId() { return caseId; }
    public UUID getFollowUpPlanId() { return followUpPlanId; }
    public Origin getOrigin() { return Origin.valueOf(origin); }
    public Instant getDueAt() { return dueAt; }
    public String getMode() { return mode; }
    public Status getStatus() { return Status.valueOf(status); }
    public Instant getReminderSentAt() { return reminderSentAt; }
    public String getRecordedBy() { return recordedBy; }
    public Instant getRecordedAt() { return recordedAt; }
    public String getNote() { return note; }
    public UUID getEvidenceId() { return evidenceId; }
    public Instant getCreatedAt() { return createdAt; }
}
