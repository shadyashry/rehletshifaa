-- Synthetic engine verification only. No production case or WorkItem is bound by this migration.
CREATE TABLE journey_shadow_runs (
    id UUID PRIMARY KEY,
    journey_version_id UUID NOT NULL REFERENCES journey_deployments(journey_version_id),
    engine_instance_ref VARCHAR(255) NOT NULL UNIQUE,
    created_by VARCHAR(255) NOT NULL,
    command_key VARCHAR(80) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(created_by,command_key)
);
CREATE TABLE journey_shadow_commands (
    run_id UUID NOT NULL REFERENCES journey_shadow_runs(id),
    actor_subject VARCHAR(255) NOT NULL,
    command_key VARCHAR(80) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    result_snapshot TEXT NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY(run_id,actor_subject,command_key)
);
