-- Target owner/admin control plane: operator commissioning, owner approval evidence and unavailable-owner recovery.

ALTER TABLE privileged_access_change_decisions ADD COLUMN approver_type VARCHAR(40);

CREATE TABLE platform_governance_commissioning (
    id UUID PRIMARY KEY,
    status VARCHAR(40) NOT NULL,
    deployment_operator VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(160) NOT NULL UNIQUE,
    manifest_hash VARCHAR(64) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    blocked_reason VARCHAR(1000),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_governance_commissioning_status CHECK (status IN
        ('INVITATIONS_SENT','OWNER_ACCEPTED','ADMINISTRATORS_ACCEPTED','READY','COMPLETED','CANCELLED','BLOCKED_REVIEW')),
    CONSTRAINT ck_governance_commissioning_expiry CHECK (expires_at>created_at)
);

CREATE TABLE platform_governance_commissioning_participants (
    id UUID PRIMARY KEY,
    commissioning_id UUID NOT NULL REFERENCES platform_governance_commissioning(id),
    participant_type VARCHAR(30) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    display_name_encrypted TEXT,
    email_encrypted TEXT,
    email_hash VARCHAR(64),
    locale VARCHAR(5) NOT NULL DEFAULT 'en',
    status VARCHAR(20) NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    phishing_resistant_authentication BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_commissioning_participant_type CHECK (participant_type IN ('OWNER','ADMINISTRATOR')),
    CONSTRAINT ck_commissioning_participant_status CHECK (status IN ('INVITED','ACCEPTED')),
    CONSTRAINT uq_commissioning_participant_subject UNIQUE (commissioning_id,subject)
);
CREATE INDEX ix_commissioning_participant_subject ON platform_governance_commissioning_participants(subject,status);

CREATE TABLE platform_governance_commissioning_decisions (
    id UUID PRIMARY KEY,
    commissioning_id UUID NOT NULL REFERENCES platform_governance_commissioning(id),
    actor_subject VARCHAR(255) NOT NULL,
    decision_type VARCHAR(40) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    authentication_assurance VARCHAR(40) NOT NULL,
    decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_commissioning_decision_type CHECK (decision_type IN ('OWNER_ACCEPTANCE','ADMINISTRATOR_ACCEPTANCE')),
    CONSTRAINT uq_commissioning_decision_actor UNIQUE (commissioning_id,actor_subject,decision_type)
);

CREATE TABLE platform_owner_recovery_requests (
    id UUID PRIMARY KEY,
    current_owner_subject VARCHAR(255) NOT NULL,
    incoming_owner_subject VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    initiated_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    evidence_reference VARCHAR(500) NOT NULL,
    incident_reference VARCHAR(200) NOT NULL,
    initiated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cooling_off_until TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_owner_recovery_distinct CHECK (current_owner_subject<>incoming_owner_subject),
    CONSTRAINT ck_owner_recovery_status CHECK (status IN
        ('PENDING_SECOND_ADMIN','PENDING_OPERATOR_VERIFICATION','PENDING_SUCCESSOR_ACCEPTANCE','COOLING_OFF','COMPLETED','REJECTED','EXPIRED')),
    CONSTRAINT ck_owner_recovery_expiry CHECK (expires_at>initiated_at)
);

CREATE TABLE platform_owner_recovery_evidence (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES platform_owner_recovery_requests(id),
    evidence_type VARCHAR(40) NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    evidence_reference VARCHAR(500),
    phishing_resistant_authentication BOOLEAN NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_owner_recovery_evidence_type CHECK (evidence_type IN
        ('SECOND_ADMIN_CONFIRMATION','OPERATOR_VERIFICATION','SUCCESSOR_ACCEPTANCE','COOLING_OFF_WAIVER')),
    CONSTRAINT uq_owner_recovery_evidence UNIQUE (request_id,evidence_type)
);
CREATE INDEX ix_owner_recovery_status ON platform_owner_recovery_requests(status,expires_at);
