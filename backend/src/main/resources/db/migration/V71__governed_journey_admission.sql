-- QA-10: runtime Journey admission is business policy, changed without restart and independently approved.

CREATE TABLE journey_admission_policy_revisions (
    id UUID PRIMARY KEY,
    journey_version_id UUID NOT NULL REFERENCES journey_versions(id),
    eligibility_scope VARCHAR(30) NOT NULL,
    care_categories VARCHAR(1000),
    state VARCHAR(30) NOT NULL,
    prepared_by VARCHAR(255) NOT NULL,
    preparation_reason VARCHAR(500) NOT NULL,
    prepared_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_by VARCHAR(255),
    approval_reason VARCHAR(500),
    approved_at TIMESTAMP WITH TIME ZONE,
    paused_by VARCHAR(255),
    pause_reason VARCHAR(500),
    paused_at TIMESTAMP WITH TIME ZONE,
    revision BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_journey_admission_scope CHECK (eligibility_scope IN ('ALL_NEW_CASES','CARE_CATEGORY')),
    CONSTRAINT ck_journey_admission_state CHECK (state IN ('PENDING_APPROVAL','ACTIVE','PAUSED','REJECTED','SUPERSEDED'))
);
CREATE INDEX ix_journey_admission_policy_state ON journey_admission_policy_revisions(state, prepared_at);

CREATE TABLE journey_admission_policy_current (
    singleton_id INTEGER PRIMARY KEY,
    policy_revision_id UUID NOT NULL UNIQUE REFERENCES journey_admission_policy_revisions(id),
    CONSTRAINT ck_journey_admission_current_singleton CHECK (singleton_id = 1)
);
