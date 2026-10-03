-- Section 1 platform-scope access governance: System Administrator assignments under maker/checker (SOD-01/03/06)
-- and the singleton governance lock serializing administrator and lifecycle changes (INV-03).

CREATE TABLE platform_access_roles (
    role_key VARCHAR(80) PRIMARY KEY,
    display_name VARCHAR(160) NOT NULL,
    privileged BOOLEAN NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

INSERT INTO platform_access_roles(role_key,display_name,privileged,active,created_at)
VALUES ('SYSTEM_ADMINISTRATOR','System Administrator',TRUE,TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00');

CREATE TABLE platform_role_assignments (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    role_key VARCHAR(80) NOT NULL REFERENCES platform_access_roles(role_key),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    assigned_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_platform_assignment_status CHECK (status IN ('ACTIVE','REVOKED')),
    CONSTRAINT ck_platform_assignment_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX ix_platform_assignment_subject ON platform_role_assignments(subject,role_key,status);

-- The singleton row is locked before administrator assignment or lifecycle mutations.
CREATE TABLE platform_governance_lock (
    id INTEGER PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_platform_governance_lock_singleton CHECK (id=1)
);
INSERT INTO platform_governance_lock(id,revision) VALUES(1,0);

CREATE TABLE privileged_access_change_requests (
    id UUID PRIMARY KEY,
    change_type VARCHAR(20) NOT NULL,
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    assignment_id UUID REFERENCES platform_role_assignments(id),
    assignment_revision BIGINT,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    request_reason VARCHAR(1000) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_privileged_change_type CHECK (change_type IN ('APPOINT','REMOVE')),
    CONSTRAINT ck_privileged_change_status CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
    CONSTRAINT ck_privileged_change_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT ck_privileged_change_expiry CHECK (expires_at > requested_at)
);

CREATE TABLE privileged_access_change_decisions (
    request_id UUID PRIMARY KEY REFERENCES privileged_access_change_requests(id),
    decision VARCHAR(20) NOT NULL,
    decided_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_privileged_decision CHECK (decision IN ('APPROVED','REJECTED'))
);
