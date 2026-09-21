-- Application metadata only. Flowable manages its own engine schema.
CREATE TABLE journey_deployments (
    journey_version_id UUID PRIMARY KEY REFERENCES journey_versions(id),
    graph_hash VARCHAR(64) NOT NULL,
    compiler_version VARCHAR(80) NOT NULL,
    bpmn_hash VARCHAR(64) NOT NULL,
    bpmn_snapshot TEXT NOT NULL,
    engine_deployment_ref VARCHAR(255) NOT NULL UNIQUE,
    engine_definition_ref VARCHAR(255) NOT NULL UNIQUE,
    deployed_by VARCHAR(255) NOT NULL,
    deployed_at TIMESTAMP WITH TIME ZONE NOT NULL
);
