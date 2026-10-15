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
 * Why a CLOSED case came back into FOLLOW_UP (P1-13, A-06; append-only, one row per reopening). The status history says
 * that the case moved and carries the typed reason; the note may hold clinical detail, so it is stored encrypted here only.
 * A reopening names the incident that caused it when there is one.
 */
@Entity
@Immutable
@Table(name = "case_reopenings")
public class CaseReopening extends AssignedIdEntity {
    /** The typed reasons; the CHECK constraint on the table mirrors this list. */
    public enum Reason { COMPLICATION_REPORTED, PATIENT_REQUEST, CLINICAL_FOLLOW_UP_NEEDED, INCIDENT_REVIEW }

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(nullable = false, length = 40) private String reason;
    @Column(name = "incident_id") private UUID incidentId;
    @Convert(converter = EncryptedStringConverter.class) @Column(columnDefinition = "text") private String note;
    @Column(name = "reopened_by", nullable = false) private String reopenedBy;
    @Column(name = "reopened_by_role", nullable = false, length = 40) private String reopenedByRole;
    @Column(name = "reopened_at", nullable = false) private Instant reopenedAt;

    protected CaseReopening() {}

    public CaseReopening(UUID caseId, Reason reason, UUID incidentId, String note, String reopenedBy, String reopenedByRole, Instant at) {
        super(UUID.randomUUID());
        this.caseId = caseId; this.reason = reason.name(); this.incidentId = incidentId; this.note = note;
        this.reopenedBy = reopenedBy; this.reopenedByRole = reopenedByRole; this.reopenedAt = micros(at);
    }

    public UUID getCaseId() { return caseId; }
    public Reason getReason() { return Reason.valueOf(reason); }
    public UUID getIncidentId() { return incidentId; }
    public String getNote() { return note; }
    public String getReopenedBy() { return reopenedBy; }
    public String getReopenedByRole() { return reopenedByRole; }
    public Instant getReopenedAt() { return reopenedAt; }
}
