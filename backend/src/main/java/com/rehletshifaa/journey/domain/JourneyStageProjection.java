package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** One runtime visit to a human journey stage, projected into a case task; unique by engine task reference. */
@Entity
@Table(name = "journey_stage_projections")
public class JourneyStageProjection extends AssignedIdEntity {
    @Column(name = "case_id", nullable = false) private UUID caseId;
    @Column(name = "journey_version_id", nullable = false) private UUID journeyVersionId;
    @Column(name = "node_key", nullable = false, length = 80) private String nodeKey;
    @Column(name = "actor_type", nullable = false, length = 30) private String actorType;
    @Column(name = "stage_type", nullable = false, length = 30) private String stageType;
    @Column(name = "case_task_id", nullable = false, unique = true) private UUID caseTaskId;
    @Column(nullable = false, length = 20) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "advanced_at") private Instant advancedAt;
    @Column(name = "engine_task_reference", unique = true, length = 64) private String engineTaskReference;

    protected JourneyStageProjection() {}

    /** The stage of a journey version that was visited. */
    public record Stage(UUID journeyVersionId, String nodeKey, String actorType, String stageType) {}

    public JourneyStageProjection(UUID id, UUID caseId, Stage stage, UUID caseTaskId, String engineTaskReference, Instant now) {
        super(id);
        this.caseId = caseId; this.journeyVersionId = stage.journeyVersionId(); this.nodeKey = stage.nodeKey(); this.actorType = stage.actorType();
        this.stageType = stage.stageType(); this.caseTaskId = caseTaskId; this.status = "OPEN"; this.engineTaskReference = engineTaskReference;
        this.createdAt = micros(now);
    }

    public UUID getCaseId() { return caseId; }
    public UUID getJourneyVersionId() { return journeyVersionId; }
    public String getNodeKey() { return nodeKey; }
    public String getActorType() { return actorType; }
    public String getStageType() { return stageType; }
    public UUID getCaseTaskId() { return caseTaskId; }
    public String getStatus() { return status; }
    public String getEngineTaskReference() { return engineTaskReference; }
}
