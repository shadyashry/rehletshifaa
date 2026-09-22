-- Phase 7B: immutable admission evidence, one row per newly submitted case evaluated while the
-- production-intake master switch is on. Written once in the submission transaction, never updated:
-- it records which authority (LEGACY or JOURNEY) the case entered with and why, under which cutover
-- policy revision. Cases submitted while the master switch is off have no row (legacy, unevaluated).
CREATE TABLE journey_case_admissions (
    case_id UUID PRIMARY KEY REFERENCES medical_cases(id),
    decision VARCHAR(10) NOT NULL CHECK (decision IN ('LEGACY','JOURNEY')),
    reason VARCHAR(40) NOT NULL,
    policy_id VARCHAR(60),
    policy_revision VARCHAR(64) NOT NULL,
    journey_version_id UUID REFERENCES journey_versions(id),
    care_category VARCHAR(60),
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CHECK ((decision = 'JOURNEY' AND journey_version_id IS NOT NULL AND policy_id IS NOT NULL)
        OR (decision = 'LEGACY' AND journey_version_id IS NULL))
);
CREATE INDEX idx_journey_case_admissions_decision ON journey_case_admissions(decision, reason);
