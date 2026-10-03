-- Section 1 access hygiene: account support (SUP-01..04), privileged MFA reset (SUP-03 / SOD-03), access
-- recertification (IAM-15), dormancy (IAM-16) and the service-account registry (IAM-17).

-- SUP-02: the documented identity-verification checklist Support completed before triggering a reset email.
CREATE TABLE support_identity_checks (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    performed_by VARCHAR(255) NOT NULL,
    checklist VARCHAR(1000) NOT NULL,
    action VARCHAR(30) NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_support_check_action CHECK (action IN ('PASSWORD_RESET_EMAIL','INVITATION_RESEND','MFA_RESET_REQUEST'))
);

-- SUP-03: MFA reset for a workforce identity is a privileged change request approved by a System Administrator.
CREATE TABLE mfa_reset_requests (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    requested_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status VARCHAR(20) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_by VARCHAR(255),
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_reason VARCHAR(1000),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_mfa_reset_status CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
    CONSTRAINT ck_mfa_reset_expiry CHECK (expires_at > requested_at)
);

-- IAM-15: privileged access is recertified quarterly, all other workforce access semi-annually.
CREATE TABLE access_recertification_campaigns (
    id UUID PRIMARY KEY,
    scope VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_by VARCHAR(255) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_recert_scope CHECK (scope IN ('PRIVILEGED','STANDARD')),
    CONSTRAINT ck_recert_status CHECK (status IN ('OPEN','CLOSED')),
    CONSTRAINT ck_recert_due CHECK (due_at > started_at)
);

CREATE TABLE access_recertification_items (
    id UUID PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES access_recertification_campaigns(id),
    subject VARCHAR(255) NOT NULL,
    item_type VARCHAR(20) NOT NULL,
    assignment_id UUID NOT NULL,
    role_key VARCHAR(80) NOT NULL,
    decision VARCHAR(20) NOT NULL,
    decided_by VARCHAR(255),
    decided_at TIMESTAMP WITH TIME ZONE,
    reason VARCHAR(1000),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_recert_item_type CHECK (item_type IN ('WORKFORCE_ROLE','PLATFORM_ROLE')),
    CONSTRAINT ck_recert_decision CHECK (decision IN ('PENDING','CERTIFIED','REVOKED','ESCALATED')),
    CONSTRAINT uq_recert_item UNIQUE (campaign_id, assignment_id)
);
CREATE INDEX ix_recert_items_campaign ON access_recertification_items(campaign_id, decision);

-- IAM-17: non-human clients: owner, purpose, scopes, secret rotation. They never hold interactive sign-in or a role.
CREATE TABLE service_accounts (
    client_id VARCHAR(120) PRIMARY KEY,
    owner_subject VARCHAR(255) NOT NULL,
    purpose VARCHAR(500) NOT NULL,
    scopes VARCHAR(1000) NOT NULL,
    secret_rotated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL,
    registered_by VARCHAR(255) NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_service_account_status CHECK (status IN ('ACTIVE','RETIRED'))
);
