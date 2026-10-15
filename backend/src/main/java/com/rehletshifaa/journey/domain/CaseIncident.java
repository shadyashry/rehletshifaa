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
 * A case-level incident (review 2026-10-14, A-06; P1-13): something went wrong on, or after, a case that the platform must
 * record, route and resolve rather than leave in a chat thread. It is the one model every later phase writes to:
 * P1-16 raises an {@code ADVERSE_EVENT} when a Consultant records a complication, P1-18 when a follow-up outcome reports one,
 * P1-19 a concern raised on My Care about a hospital agreement.
 *
 * <p><b>Types.</b> {@code COMPLAINT} (a concern about the service), {@code DISPUTE} (a disagreement about money or scope),
 * {@code ADVERSE_EVENT} (a complication or unexpected clinical event), {@code DEATH} (always CRITICAL, staff only).
 * <b>Lifecycle.</b> {@code OPEN} (raised, owner assigned) to {@code UNDER_REVIEW} (the owner took it) to {@code RESOLVED}
 * (a typed resolution and a note). A resolved incident is final; a new concern is a new incident.
 * <b>Ownership.</b> The owner is always a Care Coordination Manager, never the case's coordinator: a complaint about the
 * coordinator must not land on their desk. <b>Visibility.</b> Managers and Compliance read every incident; the case team
 * sees none of it through this model.
 *
 * <p>The summary and the resolution note may hold clinical detail (fever on day three, wound reopened), so both are stored
 * encrypted like patient PII and never copied into audit or notifications.
 */
@Entity
@Table(name = "case_incidents")
public class CaseIncident extends AssignedIdEntity {
    public enum Type { COMPLAINT, DISPUTE, ADVERSE_EVENT, DEATH }
    public enum Severity { LOW, MEDIUM, HIGH, CRITICAL }
    public enum Status { OPEN, UNDER_REVIEW, RESOLVED }
    public enum Source { PATIENT, STAFF, SYSTEM }
    public enum Resolution { NO_ACTION_NEEDED, EXPLAINED_TO_PATIENT, CORRECTIVE_ACTION, REFERRED_TO_PROVIDER, REFERRED_TO_AUTHORITY, WITHDRAWN_BY_PATIENT }

    /** Who raised it and in which case stage; one value object keeps the constructor short. */
    public record Origin(Source source, String stage, String raisedBy, String raisedByRole) {}

    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "incident_type", nullable = false, length = 20) private String incidentType;
    @Column(nullable = false, length = 10) private String severity;
    @Column(nullable = false, length = 20) private String status;
    @Column(nullable = false, length = 20) private String source;
    @Column(name = "case_stage", nullable = false, length = 40) private String caseStage;
    @Convert(converter = EncryptedStringConverter.class) @Column(nullable = false, columnDefinition = "text") private String summary;
    @Column(name = "raised_by", nullable = false) private String raisedBy;
    @Column(name = "raised_by_role", nullable = false, length = 40) private String raisedByRole;
    @Column(name = "raised_at", nullable = false) private Instant raisedAt;
    @Column(name = "owner_subject") private String ownerSubject;
    @Column(name = "owner_assigned_at") private Instant ownerAssignedAt;
    @Column(name = "resolution_code", length = 30) private String resolutionCode;
    @Convert(converter = EncryptedStringConverter.class) @Column(name = "resolution_note", columnDefinition = "text") private String resolutionNote;
    @Column(name = "resolved_by") private String resolvedBy;
    @Column(name = "resolved_at") private Instant resolvedAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(nullable = false) private long version;

    protected CaseIncident() {}

    public CaseIncident(UUID caseId, Type type, Severity severity, String summary, Origin origin, Instant at) {
        super(UUID.randomUUID());
        if (type == Type.DEATH && severity != Severity.CRITICAL) throw new IllegalArgumentException("A death is always CRITICAL");
        this.caseId = caseId; this.incidentType = type.name(); this.severity = severity.name(); this.status = Status.OPEN.name();
        this.source = origin.source().name(); this.caseStage = origin.stage(); this.summary = summary;
        this.raisedBy = origin.raisedBy(); this.raisedByRole = origin.raisedByRole(); this.raisedAt = micros(at); this.updatedAt = micros(at);
    }

    /** The manager who answers for it now; reassigning an unresolved incident is allowed, a resolved one is final. */
    public void assignTo(String subject, Instant at) {
        requireUnresolved();
        ownerSubject = subject; ownerAssignedAt = micros(at); touch(at);
    }

    /** The owner took it up. */
    public void startReview(Instant at) {
        requireUnresolved();
        status = Status.UNDER_REVIEW.name(); touch(at);
    }

    public void changeSeverity(Severity to, Instant at) {
        requireUnresolved();
        if (getType() == Type.DEATH && to != Severity.CRITICAL) throw new IllegalArgumentException("A death is always CRITICAL");
        severity = to.name(); touch(at);
    }

    public void resolve(Resolution how, String note, String by, Instant at) {
        requireUnresolved();
        status = Status.RESOLVED.name(); resolutionCode = how.name(); resolutionNote = note; resolvedBy = by; resolvedAt = micros(at); touch(at);
    }

    private void requireUnresolved() { if (getStatus() == Status.RESOLVED) throw new IllegalStateException("The incident is resolved"); }
    private void touch(Instant at) { updatedAt = micros(at); version++; }

    public UUID getCaseId() { return caseId; }
    public Type getType() { return Type.valueOf(incidentType); }
    public Severity getSeverity() { return Severity.valueOf(severity); }
    public Status getStatus() { return Status.valueOf(status); }
    public Source getSource() { return Source.valueOf(source); }
    public String getCaseStage() { return caseStage; }
    public String getSummary() { return summary; }
    public String getRaisedBy() { return raisedBy; }
    public String getRaisedByRole() { return raisedByRole; }
    public Instant getRaisedAt() { return raisedAt; }
    public String getOwnerSubject() { return ownerSubject; }
    public Instant getOwnerAssignedAt() { return ownerAssignedAt; }
    public Resolution getResolution() { return resolutionCode == null ? null : Resolution.valueOf(resolutionCode); }
    public String getResolutionNote() { return resolutionNote; }
    public String getResolvedBy() { return resolvedBy; }
    public Instant getResolvedAt() { return resolvedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }
}
