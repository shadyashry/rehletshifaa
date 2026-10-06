package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/**
 * A numbered version of a journey: its canonical graph snapshot (JSON) and lifecycle. {@code revision} is the
 * optimistic token; edits and transitions are guarded updates in {@code JourneyVersionRepository}.
 */
@Entity
@Table(name = "journey_versions")
public class JourneyVersion extends AssignedIdEntity {
    @Column(name = "definition_id", nullable = false) private UUID definitionId;
    @Column(name = "version_number", nullable = false) private int versionNumber;
    @Column(nullable = false, length = 30) private String status;
    @Column(nullable = false) private long revision;
    @Column(name = "created_by", nullable = false) private String createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "graph_snapshot", nullable = false, columnDefinition = "text") private String graphSnapshot;
    @Column(name = "graph_hash", nullable = false, length = 64) private String graphHash;
    @Column(name = "validation_summary", columnDefinition = "text") private String validationSummary;
    @Column(name = "simulation_summary", columnDefinition = "text") private String simulationSummary;
    @Column(name = "published_at") private Instant publishedAt;
    @Column(name = "retired_at") private Instant retiredAt;

    protected JourneyVersion() {}

    /** A new draft with its canonical graph. */
    public JourneyVersion(UUID id, UUID definitionId, int versionNumber, String createdBy, String graphSnapshot, String graphHash, Instant now) {
        super(id);
        this.definitionId = definitionId; this.versionNumber = versionNumber; this.status = "DRAFT"; this.createdBy = createdBy;
        this.createdAt = micros(now); this.graphSnapshot = graphSnapshot; this.graphHash = graphHash;
    }

    public UUID getDefinitionId() { return definitionId; }
    public int getVersionNumber() { return versionNumber; }
    public String getStatus() { return status; }
    public long getRevision() { return revision; }
    public String getCreatedBy() { return createdBy; }
    public String getGraphSnapshot() { return graphSnapshot; }
    public String getGraphHash() { return graphHash; }
    public String getValidationSummary() { return validationSummary; }
    public String getSimulationSummary() { return simulationSummary; }
    public Instant getPublishedAt() { return publishedAt; }
    public Instant getRetiredAt() { return retiredAt; }
}
