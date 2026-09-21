package com.rehletshifaa.journey.infrastructure;

import com.rehletshifaa.journey.application.JourneyRuntimePort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import static com.rehletshifaa.shared.persistence.SqlValues.timestamp;

@Repository
public class JourneyDeploymentRepository {
    public record Stored(UUID versionId, String graphHash, String compilerVersion, String bpmnHash,
                         JourneyRuntimePort.Deployment engine) {}
    private final JdbcClient jdbc;
    private final Clock clock;
    public JourneyDeploymentRepository(JdbcClient jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }
    public Optional<Stored> find(UUID versionId) {
        return jdbc.sql("SELECT * FROM journey_deployments WHERE journey_version_id=?").param(versionId)
                .query((r,n) -> new Stored(versionId, r.getString("graph_hash"), r.getString("compiler_version"),
                        r.getString("bpmn_hash"), new JourneyRuntimePort.Deployment(r.getString("engine_deployment_ref"),
                        r.getString("engine_definition_ref")))).optional();
    }
    public void insert(String graphHash, JourneyRuntimePort.Artifact artifact, JourneyRuntimePort.Deployment deployment, String actor) {
        jdbc.sql("INSERT INTO journey_deployments(journey_version_id,graph_hash,compiler_version,bpmn_hash,bpmn_snapshot,engine_deployment_ref,engine_definition_ref,deployed_by,deployed_at) VALUES(?,?,?,?,?,?,?,?,?)")
                .params(artifact.versionId(), graphHash, artifact.compilerVersion(), artifact.hash(), artifact.bpmn(),
                        deployment.deploymentReference(), deployment.definitionReference(), actor, timestamp(clock.instant())).update();
    }
}
