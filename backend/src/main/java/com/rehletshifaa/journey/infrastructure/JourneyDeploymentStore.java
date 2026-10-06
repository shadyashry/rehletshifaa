package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.application.JourneyRuntimePort;
import com.rehletshifaa.journey.domain.JourneyDeployment;
import org.springframework.stereotype.Repository;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

@Repository
public class JourneyDeploymentStore {
    public record Stored(UUID versionId, String graphHash, String compilerVersion, String bpmnHash,
                         JourneyRuntimePort.Deployment engine) {}
    private final JourneyDeploymentRepository deployments;
    private final Clock clock;
    public JourneyDeploymentStore(JourneyDeploymentRepository deployments, Clock clock) { this.deployments = deployments; this.clock = clock; }
    public Optional<Stored> find(UUID versionId) {
        return deployments.findById(versionId).map(d -> new Stored(versionId, d.getGraphHash(), d.getCompilerVersion(), d.getBpmnHash(),
                new JourneyRuntimePort.Deployment(d.getEngineDeploymentRef(), d.getEngineDefinitionRef())));
    }
    public void insert(String graphHash, JourneyRuntimePort.Artifact artifact, JourneyRuntimePort.Deployment deployment, String actor) {
        deployments.saveAndFlush(new JourneyDeployment(artifact.versionId(), graphHash, new JourneyDeployment.Artifact(artifact.compilerVersion(),
                artifact.hash(), artifact.bpmn(), deployment.deploymentReference(), deployment.definitionReference()), actor, clock.instant()));
    }
}
