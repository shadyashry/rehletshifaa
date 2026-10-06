package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** A synthetic (shadow) run of a journey version, idempotent per (creator, command key); {@code revision} serializes its steps. */
@Entity
@Table(name = "journey_shadow_runs")
public class JourneyShadowRun extends AssignedIdEntity {
    @Column(name = "journey_version_id", nullable = false) private UUID journeyVersionId;
    @Column(name = "engine_instance_ref", nullable = false, unique = true) private String engineInstanceRef;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "command_key", nullable = false, length = 80) private String commandKey;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(nullable = false) private long revision;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected JourneyShadowRun() {}

    public JourneyShadowRun(UUID id, UUID journeyVersionId, String engineInstanceRef, String createdBy, String commandKey, String requestHash,
                            Instant now) {
        super(id);
        this.journeyVersionId = journeyVersionId; this.engineInstanceRef = engineInstanceRef; this.createdBy = createdBy;
        this.commandKey = commandKey; this.requestHash = requestHash; this.createdAt = micros(now);
    }

    public UUID getJourneyVersionId() { return journeyVersionId; }
    public String getEngineInstanceRef() { return engineInstanceRef; }
    public String getRequestHash() { return requestHash; }
    public long getRevision() { return revision; }
}
