-- Section 1 workforce model (WF-01..WF-12): people, business roles, functions, teams, leads and reporting lines.
-- Pre-production clean model: database role assignments are the business authority for internal staff.

CREATE TABLE workforce_functions (
    function_key VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE workforce_role_catalogue (
    role_key VARCHAR(80) PRIMARY KEY,
    display_name VARCHAR(160) NOT NULL,
    function_key VARCHAR(50) NOT NULL REFERENCES workforce_functions(function_key),
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE workforce_people (
    subject VARCHAR(255) PRIMARY KEY REFERENCES access_subjects(subject),
    display_name_encrypted TEXT NOT NULL,
    email_encrypted TEXT,
    email_hash VARCHAR(64) UNIQUE,
    locale VARCHAR(5) NOT NULL DEFAULT 'en',
    activated_at TIMESTAMP WITH TIME ZONE,
    last_sign_in_at TIMESTAMP WITH TIME ZONE,
    offboarding_started_at TIMESTAMP WITH TIME ZONE,
    offboarded_at TIMESTAMP WITH TIME ZONE,
    lifecycle_reason VARCHAR(500),
    lifecycle_changed_at TIMESTAMP WITH TIME ZONE,
    lifecycle_status VARCHAR(30) NOT NULL,
    mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    phishing_resistant_mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_lifecycle CHECK (lifecycle_status IN
        ('INVITED','ACTIVE','SIGNIN_DISABLED','OFFBOARDING','OFFBOARDED','CANCELLED','EXPIRED'))
);

CREATE TABLE workforce_role_assignments (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    role_key VARCHAR(80) NOT NULL REFERENCES workforce_role_catalogue(role_key),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(40) NOT NULL,
    assigned_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_by VARCHAR(255),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason VARCHAR(1000),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_assignment_status CHECK (status IN ('ACTIVE','REVOKED')),
    CONSTRAINT ck_workforce_assignment_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    -- SYSTEM_ADMINISTRATOR is platform-scoped and maker/checker governed (platform_role_assignments).
    CONSTRAINT ck_workforce_assignment_not_admin CHECK (role_key <> 'SYSTEM_ADMINISTRATOR'),
    CONSTRAINT ck_workforce_assignment_source CHECK (source IN ('GRANT','INVITATION'))
);
CREATE INDEX ix_workforce_assignment_subject ON workforce_role_assignments(subject, status);

-- SOD-04 launch conflict set for role combinations; unordered pairs are stored in both directions.
-- Per-version (journey maker/checker) and per-Consultant (SOD-05) conflicts are decision-time checks.
CREATE TABLE workforce_role_conflicts (
    role_key VARCHAR(80) NOT NULL REFERENCES workforce_role_catalogue(role_key),
    conflicting_role_key VARCHAR(80) NOT NULL REFERENCES workforce_role_catalogue(role_key),
    rule_reason VARCHAR(300) NOT NULL,
    PRIMARY KEY (role_key, conflicting_role_key),
    CONSTRAINT ck_workforce_conflict_distinct CHECK (role_key <> conflicting_role_key)
);

CREATE TABLE workforce_teams (
    id UUID PRIMARY KEY,
    function_key VARCHAR(50) NOT NULL REFERENCES workforce_functions(function_key),
    name VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_team_status CHECK (status IN ('ACTIVE','RETIRED')),
    CONSTRAINT uq_workforce_team_name UNIQUE (function_key, name)
);

CREATE TABLE workforce_team_memberships (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES workforce_teams(id),
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_membership_status CHECK (status IN ('ACTIVE','ENDED')),
    CONSTRAINT ck_workforce_membership_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT uq_workforce_membership_start UNIQUE (team_id, subject, effective_from)
);
CREATE INDEX ix_workforce_membership_subject ON workforce_team_memberships(subject, status);

CREATE TABLE workforce_lead_designations (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES workforce_teams(id),
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_lead_status CHECK (status IN ('ACTIVE','ENDED')),
    CONSTRAINT ck_workforce_lead_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT uq_workforce_lead_start UNIQUE (team_id, subject, effective_from)
);
CREATE INDEX ix_workforce_lead_subject ON workforce_lead_designations(subject, status);

CREATE TABLE workforce_reporting_lines (
    id UUID PRIMARY KEY,
    function_key VARCHAR(50) NOT NULL REFERENCES workforce_functions(function_key),
    staff_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    manager_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_reporting_not_self CHECK (staff_subject <> manager_subject),
    CONSTRAINT ck_workforce_reporting_status CHECK (status IN ('ACTIVE','ENDED')),
    CONSTRAINT ck_workforce_reporting_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT uq_workforce_reporting_start UNIQUE (function_key, staff_subject, effective_from)
);

-- H2-safe current pointer: at most one current direct manager per person and function (INV-27).
CREATE TABLE workforce_current_managers (
    function_key VARCHAR(50) NOT NULL REFERENCES workforce_functions(function_key),
    staff_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    manager_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    reporting_line_id UUID NOT NULL UNIQUE REFERENCES workforce_reporting_lines(id),
    PRIMARY KEY (function_key, staff_subject),
    CONSTRAINT ck_workforce_current_manager_not_self CHECK (staff_subject <> manager_subject)
);
CREATE INDEX ix_workforce_current_manager ON workforce_current_managers(function_key, manager_subject);

INSERT INTO workforce_functions VALUES
    ('PLATFORM_ADMINISTRATION','Platform Administration',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CONSULTANT_OPERATIONS','Consultant Operations',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CREDENTIALING','Credentialing',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CARE_COORDINATION','Care Coordination',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('OPERATIONS','Travel and Fulfilment Operations',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('FINANCE','Commercial and Finance',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CARE_JOURNEY','Care Journey Governance',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('COMPLIANCE','Compliance and Audit',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('SUPPORT','Account Support',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('PATIENT_IDENTITY','Patient Identity Review',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00');

INSERT INTO workforce_role_catalogue VALUES
    ('SYSTEM_ADMINISTRATOR','System Administrator','PLATFORM_ADMINISTRATION',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CONSULTANT_OPERATIONS_MANAGER','Consultant Operations Manager','CONSULTANT_OPERATIONS',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CREDENTIAL_VERIFIER','Credential Verification Officer','CREDENTIALING',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('CARE_COORDINATION_MANAGER','Care Coordination Manager','CARE_COORDINATION',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('COORDINATOR','Care Coordinator','CARE_COORDINATION',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('OPERATIONS','Operations Specialist','OPERATIONS',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('FINANCE','Finance Officer','FINANCE',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('JOURNEY_MANAGER','Care Journey Manager','CARE_JOURNEY',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('JOURNEY_APPROVER','Care Journey Approver','CARE_JOURNEY',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('COMPLIANCE_AUDITOR','Compliance and Audit Reviewer','COMPLIANCE',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('SUPPORT_AGENT','Support Officer','SUPPORT',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00'),
    ('PATIENT_IDENTITY_REVIEWER','Patient Identity Reviewer','PATIENT_IDENTITY',TRUE,TIMESTAMP WITH TIME ZONE '2026-09-26 00:00:00+00');

INSERT INTO workforce_role_conflicts(role_key,conflicting_role_key,rule_reason)
SELECT 'COMPLIANCE_AUDITOR',r.role_key,'Compliance & Audit Reviewer is read-only and cannot hold a mutating role'
FROM workforce_role_catalogue r WHERE r.role_key <> 'COMPLIANCE_AUDITOR';
INSERT INTO workforce_role_conflicts(role_key,conflicting_role_key,rule_reason)
SELECT r.role_key,'COMPLIANCE_AUDITOR','Compliance & Audit Reviewer is read-only and cannot hold a mutating role'
FROM workforce_role_catalogue r WHERE r.role_key <> 'COMPLIANCE_AUDITOR';
INSERT INTO workforce_role_conflicts(role_key,conflicting_role_key,rule_reason) VALUES
    ('SUPPORT_AGENT','SYSTEM_ADMINISTRATOR','Support Officer cannot also be System Administrator'),
    ('SYSTEM_ADMINISTRATOR','SUPPORT_AGENT','Support Officer cannot also be System Administrator');

-- STF-01/02: an invitation exists before the identity does. It is single-use, bound to one email, expires, and
-- grants nothing: its roles become assignments of an INVITED person that are only effective once ACTIVE.
CREATE TABLE workforce_invitations (
    id UUID PRIMARY KEY,
    display_name_encrypted TEXT NOT NULL,
    email_encrypted TEXT NOT NULL,
    email_hash VARCHAR(64) NOT NULL,
    locale VARCHAR(5) NOT NULL,
    status VARCHAR(20) NOT NULL,
    subject VARCHAR(255),
    invited_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_invitation_status CHECK (status IN ('QUEUED','SENT','ACCEPTED','CANCELLED','EXPIRED')),
    CONSTRAINT ck_workforce_invitation_expiry CHECK (expires_at > created_at)
);
CREATE INDEX ix_workforce_invitation_email ON workforce_invitations(email_hash, status);
CREATE INDEX ix_workforce_invitation_subject ON workforce_invitations(subject);

CREATE TABLE workforce_invitation_roles (
    invitation_id UUID NOT NULL REFERENCES workforce_invitations(id),
    role_key VARCHAR(80) NOT NULL REFERENCES workforce_role_catalogue(role_key),
    PRIMARY KEY (invitation_id, role_key),
    CONSTRAINT ck_workforce_invitation_role_not_admin CHECK (role_key <> 'SYSTEM_ADMINISTRATOR')
);

-- STF-11: function managers request staffing changes; System Administrators execute or reject them.
CREATE TABLE workforce_staffing_requests (
    id UUID PRIMARY KEY,
    function_key VARCHAR(50) NOT NULL REFERENCES workforce_functions(function_key),
    request_type VARCHAR(30) NOT NULL,
    subject VARCHAR(255),
    details VARCHAR(2000) NOT NULL,
    status VARCHAR(20) NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_by VARCHAR(255),
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_reason VARCHAR(1000),
    execution_reference VARCHAR(255),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_staffing_request_type CHECK (request_type IN ('NEW_HIRE','JOB_CHANGE','TEAM_MOVE','REMOVAL')),
    CONSTRAINT ck_staffing_request_status CHECK (status IN ('SUBMITTED','EXECUTED','REJECTED','WITHDRAWN'))
);
