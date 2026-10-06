package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The application-owned correlation of a case with its journey runtime instance (one per case). */
@Entity
@Table(name = "journey_case_bindings")
public class JourneyCaseBinding extends PersistableEntity<UUID> {
    @Id @Column(name = "case_id") private UUID caseId;
    @Column(name = "journey_version_id", nullable = false) private UUID journeyVersionId;
    @Column(name = "admission_mode", nullable = false, length = 30) private String admissionMode;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "command_key", nullable = false, length = 80) private String commandKey;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(name = "engine_instance_ref", unique = true) private String engineInstanceRef;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected JourneyCaseBinding() {}

    public JourneyCaseBinding(UUID caseId, UUID journeyVersionId, String admissionMode, String createdBy, String commandKey, String requestHash,
                              Instant now) {
        this.caseId = caseId; this.journeyVersionId = journeyVersionId; this.admissionMode = admissionMode; this.createdBy = createdBy;
        this.commandKey = commandKey; this.requestHash = requestHash; this.createdAt = micros(now);
    }

    @Override public UUID getId() { return caseId; }
    public UUID getJourneyVersionId() { return journeyVersionId; }
    public String getAdmissionMode() { return admissionMode; }
    public String getCreatedBy() { return createdBy; }
    public String getRequestHash() { return requestHash; }
    public String getEngineInstanceRef() { return engineInstanceRef; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
