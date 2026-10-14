package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.crypto.EncryptedStringConverter;
import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * Why a case left its journey (append-only, one row per exit). The status history says that the case moved;
 * this says why, in a typed way the portal and reports can word without parsing free text. The note may carry
 * clinical detail ("deteriorated on day two"), so it is stored encrypted like patient PII.
 */
@Entity
@Immutable
@Table(name = "case_exit_reasons")
public class CaseExitReason extends AssignedIdEntity {
    /** The typed reasons; the CHECK constraint on the table mirrors this list. */
    public enum Reason {
        // a coordinator's typed cancellation (also the patient's own withdrawal, recorded by them)
        PATIENT_WITHDREW, HOSPITAL_REFUSED, MEDICAL_CONTRAINDICATION, PATIENT_DECEASED, NO_SHOW,
        // the deposit reminder cycle ended unpaid (ACCEPTED -> EXPIRED)
        DEPOSIT_UNPAID,
        // the Consultant recorded that no follow-up is needed (DISCHARGED -> CLOSED)
        NO_FOLLOW_UP_NEEDED,
        // P1-6: the patient left an information request unanswered for 30 days (INFORMATION_REQUIRED -> CANCELLED)
        INFORMATION_NOT_PROVIDED
    }

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "from_status", nullable = false, length = 40) private String fromStatus;
    @Column(name = "to_status", nullable = false, length = 40) private String toStatus;
    @Column(nullable = false, length = 40) private String reason;
    @Convert(converter = EncryptedStringConverter.class) @Column(length = 2000) private String note;
    @Column(name = "recorded_by", nullable = false) private String recordedBy;
    @Column(name = "recorded_by_role", nullable = false, length = 40) private String recordedByRole;
    @Column(name = "recorded_at", nullable = false) private Instant recordedAt;

    protected CaseExitReason() {}

    public CaseExitReason(UUID caseId, String fromStatus, String toStatus, Reason reason, String note,
                          String recordedBy, String recordedByRole, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.fromStatus = fromStatus; this.toStatus = toStatus; this.reason = reason.name();
        this.note = note; this.recordedBy = recordedBy; this.recordedByRole = recordedByRole; this.recordedAt = micros(at);
    }

    public UUID getCaseId() { return caseId; }
    public String getFromStatus() { return fromStatus; }
    public String getToStatus() { return toStatus; }
    public Reason getReason() { return Reason.valueOf(reason); }
    public String getNote() { return note; }
    public String getRecordedBy() { return recordedBy; }
    public String getRecordedByRole() { return recordedByRole; }
    public Instant getRecordedAt() { return recordedAt; }
}
