-- Care coordination routing on the workforce model. Routing is platform-wide: routing teams are workforce teams of
-- the CARE_COORDINATION function (membership lives in workforce_team_memberships), capacity belongs to the person,
-- preferences belong to the Consultant. There is no provider organization and no shadow/adoption mode.
-- Replaces V36's provider-organization routing model outright (pre-production: nothing to carry over).

DROP TABLE coordination_decisions;
DROP TABLE coordination_case_routing;
DROP TABLE consultant_routing_preferences;
DROP TABLE coordination_policy_versions;
DROP TABLE coordinator_capacity;
DROP TABLE coordinator_memberships;
ALTER TABLE case_tasks DROP COLUMN coordination_team_id;
ALTER TABLE case_tasks DROP COLUMN coordination_queue_reason;
ALTER TABLE case_tasks DROP COLUMN coordination_queued_at;
DROP TABLE coordinator_teams;

-- What a care-coordination team takes: care areas and languages it serves, and where its work overflows.
CREATE TABLE coordination_team_profiles (
    team_id UUID PRIMARY KEY REFERENCES workforce_teams(id),
    care_areas VARCHAR(1000) NOT NULL,
    languages VARCHAR(500) NOT NULL,
    fallback_team_id UUID REFERENCES workforce_teams(id),
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_coordination_team_fallback CHECK (fallback_team_id IS NULL OR fallback_team_id <> team_id)
);

-- How much coordination work a Coordinator takes, and whether they are on duty.
CREATE TABLE coordinator_capacity (
    subject VARCHAR(255) PRIMARY KEY REFERENCES workforce_people(subject),
    maximum INTEGER NOT NULL,
    on_duty BOOLEAN NOT NULL,
    languages VARCHAR(500) NOT NULL,
    care_areas VARCHAR(1000) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_coordinator_capacity_maximum CHECK (maximum BETWEEN 0 AND 10000)
);

-- Versioned, non-overlapping routing policy (weights, team pools, queue deadline).
CREATE TABLE coordination_policy_versions (
    id UUID PRIMARY KEY,
    version_number INTEGER NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    configuration TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_coordination_policy_version UNIQUE (version_number),
    CONSTRAINT ck_coordination_policy_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- A Consultant's preferred Coordinator or team, versioned.
CREATE TABLE consultant_routing_preferences (
    id UUID PRIMARY KEY,
    consultant_id UUID NOT NULL REFERENCES practitioner_profiles(id),
    version_number INTEGER NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    coordinator_subject VARCHAR(255) REFERENCES workforce_people(subject),
    team_id UUID REFERENCES workforce_teams(id),
    fallback_team_id UUID REFERENCES workforce_teams(id),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_consultant_routing_version UNIQUE (consultant_id, version_number),
    CONSTRAINT ck_consultant_routing_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Every routing decision, with its evidence; the per-case count is the routing revision for expected-version commands.
CREATE TABLE coordination_decisions (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    actor_subject VARCHAR(255) NOT NULL,
    command_key VARCHAR(150) NOT NULL,
    request_data TEXT NOT NULL,
    policy_id UUID NOT NULL REFERENCES coordination_policy_versions(id),
    result_data TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_coordination_decision_command UNIQUE (case_id, actor_subject, command_key)
);
CREATE INDEX ix_coordination_decisions_case ON coordination_decisions(case_id, created_at);

-- One row serializes routing decisions so capacity is never over-committed by concurrent assignments.
CREATE TABLE coordination_routing_lock (id INTEGER PRIMARY KEY, CONSTRAINT ck_coordination_routing_lock CHECK (id = 1));
INSERT INTO coordination_routing_lock(id) VALUES (1);

-- The coordination queue is the open, unowned COORDINATION_ROUTING work item of a case.
ALTER TABLE case_tasks ADD COLUMN coordination_team_id UUID REFERENCES workforce_teams(id);
ALTER TABLE case_tasks ADD COLUMN coordination_queue_reason VARCHAR(100);
ALTER TABLE case_tasks ADD COLUMN coordination_queued_at TIMESTAMP WITH TIME ZONE;
