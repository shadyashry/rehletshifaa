-- Phase 7C: structured, evaluation-only legacy-vs-Journey comparison evidence for real
-- production-admitted cases. One result belongs to one immutable Journey stage visit.
CREATE TABLE journey_live_shadow_comparisons (
    id UUID PRIMARY KEY,
    projection_id UUID NOT NULL UNIQUE REFERENCES journey_stage_projections(id),
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    journey_version_id UUID NOT NULL REFERENCES journey_versions(id),
    policy_revision VARCHAR(64) NOT NULL,
    result VARCHAR(24) NOT NULL CHECK (result IN ('MATCH','ACCEPTABLE_DIFFERENCE','MISMATCH','NOT_COMPARABLE')),
    category VARCHAR(40),
    legacy_outcome VARCHAR(1000) NOT NULL,
    journey_outcome VARCHAR(1000) NOT NULL,
    explanation VARCHAR(1000) NOT NULL,
    compared_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_journey_live_shadow_result ON journey_live_shadow_comparisons(result, category);
CREATE INDEX idx_journey_live_shadow_version_revision ON journey_live_shadow_comparisons(journey_version_id, policy_revision);
