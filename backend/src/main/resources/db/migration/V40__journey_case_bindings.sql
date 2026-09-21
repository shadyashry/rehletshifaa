-- Explicit verification admission only; no existing case is adopted or rewritten.
-- Version references reuse the immutable deployment metadata introduced by V38.
CREATE TABLE journey_case_bindings (
    case_id UUID PRIMARY KEY REFERENCES medical_cases(id),
    journey_version_id UUID NOT NULL REFERENCES journey_deployments(journey_version_id),
    admission_mode VARCHAR(30) NOT NULL CHECK (admission_mode = 'VERIFICATION'),
    created_by VARCHAR(255) NOT NULL,
    command_key VARCHAR(80) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    engine_instance_ref VARCHAR(255) UNIQUE,
    started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(created_by, command_key),
    CHECK ((engine_instance_ref IS NULL AND started_at IS NULL)
        OR (engine_instance_ref IS NOT NULL AND started_at IS NOT NULL))
);
CREATE INDEX idx_journey_case_version ON journey_case_bindings(journey_version_id);
