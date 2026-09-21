-- Durable provenance and idempotency for projecting Journey runtime human stages into the existing
-- case_tasks-backed WorkItem/PatientAction model. One row per (case, node); the unique constraint is
-- the actual concurrency backstop, not the case-binding row lock alone. stage_type includes NOTIFICATION
-- (completable the same way as STAFF_TASK, once a registered handler exists — see technical-decisions.md
-- §21) alongside STAFF_TASK/PATIENT_ACTION.
CREATE TABLE journey_stage_projections (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES journey_case_bindings(case_id),
    journey_version_id UUID NOT NULL,
    node_key VARCHAR(80) NOT NULL,
    actor_type VARCHAR(30) NOT NULL,
    stage_type VARCHAR(30) NOT NULL,
    case_task_id UUID NOT NULL REFERENCES case_tasks(id),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    advanced_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(case_id, node_key),
    UNIQUE(case_task_id)
);
ALTER TABLE journey_stage_projections ADD CONSTRAINT ck_journey_stage_projection_type CHECK (stage_type IN ('STAFF_TASK','PATIENT_ACTION','NOTIFICATION'));
CREATE INDEX idx_journey_stage_projection_case ON journey_stage_projections(case_id);
