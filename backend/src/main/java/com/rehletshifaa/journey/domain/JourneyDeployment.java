package com.rehletshifaa.journey.domain;

import com.rehletshifaa.shared.persistence.PersistableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

/** The runtime deployment of one journey version: the compiled BPMN and the engine references (one per version). */
@Entity
@Immutable
@Table(name = "journey_deployments")
public class JourneyDeployment extends PersistableEntity<UUID> {
    @Id @Column(name = "journey_version_id") private UUID journeyVersionId;
    @Column(name = "graph_hash", nullable = false, length = 64) private String graphHash;
    @Column(name = "compiler_version", nullable = false, length = 80) private String compilerVersion;
    @Column(name = "bpmn_hash", nullable = false, length = 64) private String bpmnHash;
    @Column(name = "bpmn_snapshot", nullable = false, columnDefinition = "text") private String bpmnSnapshot;
    @Column(name = "engine_deployment_ref", nullable = false, unique = true) private String engineDeploymentRef;
    @Column(name = "engine_definition_ref", nullable = false, unique = true) private String engineDefinitionRef;
    @Column(name = "deployed_by", nullable = false) private String deployedBy;
    @Column(name = "deployed_at", nullable = false) private Instant deployedAt;

    protected JourneyDeployment() {}

    /** The compiled artifact and where the engine holds it. */
    public record Artifact(String compilerVersion, String bpmnHash, String bpmnSnapshot, String engineDeploymentRef, String engineDefinitionRef) {}

    public JourneyDeployment(UUID journeyVersionId, String graphHash, Artifact artifact, String deployedBy, Instant now) {
        this.journeyVersionId = journeyVersionId; this.graphHash = graphHash; this.compilerVersion = artifact.compilerVersion();
        this.bpmnHash = artifact.bpmnHash(); this.bpmnSnapshot = artifact.bpmnSnapshot(); this.engineDeploymentRef = artifact.engineDeploymentRef();
        this.engineDefinitionRef = artifact.engineDefinitionRef(); this.deployedBy = deployedBy; this.deployedAt = micros(now);
    }

    @Override public UUID getId() { return journeyVersionId; }
    public String getGraphHash() { return graphHash; }
    public String getCompilerVersion() { return compilerVersion; }
    public String getBpmnHash() { return bpmnHash; }
    public String getEngineDeploymentRef() { return engineDeploymentRef; }
    public String getEngineDefinitionRef() { return engineDefinitionRef; }
}
