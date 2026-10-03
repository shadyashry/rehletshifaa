-- Practice Manager consent and identity lifecycle (PM-01..PM-10, INV-15/16).
-- Invitations and consent are application records. Keycloak remains credentials/session authority only.

ALTER TABLE practitioner_profiles ADD COLUMN consultant_lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE practitioner_profiles ADD CONSTRAINT ck_consultant_lifecycle_status CHECK
    (consultant_lifecycle_status IN ('ACTIVE','RESTRICTED','SUSPENDED','OFFBOARDING','OFFBOARDED'));

ALTER TABLE practice_managers DROP CONSTRAINT ck_practice_manager_status;
ALTER TABLE practice_managers ADD COLUMN accepted_invitation_id UUID;
ALTER TABLE practice_managers ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE practice_managers ADD COLUMN accepted_by_subject VARCHAR(255);
ALTER TABLE practice_managers ADD COLUMN accepted_mfa_acr VARCHAR(40);
ALTER TABLE practice_managers ADD COLUMN suspended_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE practice_managers ADD COLUMN suspension_reason VARCHAR(500);
ALTER TABLE practice_managers ADD COLUMN revocation_reason VARCHAR(500);
ALTER TABLE practice_managers ADD CONSTRAINT ck_practice_manager_status CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED'));

CREATE TABLE practice_manager_invitations (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES virtual_clinics(practitioner_id) ON DELETE CASCADE,
    delegation_id UUID REFERENCES practice_managers(id) ON DELETE RESTRICT,
    invitation_kind VARCHAR(30) NOT NULL,
    display_name_encrypted TEXT NOT NULL,
    email_encrypted TEXT NOT NULL,
    email_hash VARCHAR(64) NOT NULL,
    locale VARCHAR(5) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL,
    identity_resolution_status VARCHAR(30) NOT NULL,
    resolved_subject VARCHAR(255),
    can_manage_schedule BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_profile BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_services BOOLEAN NOT NULL DEFAULT FALSE,
    invited_by VARCHAR(255) NOT NULL,
    invited_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    accepted_by_subject VARCHAR(255),
    accepted_mfa_acr VARCHAR(40),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by VARCHAR(255),
    expired_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_pm_invitation_kind CHECK (invitation_kind IN ('INITIAL','PERMISSION_CHANGE','REINSTATEMENT')),
    CONSTRAINT ck_pm_invitation_status CHECK (status IN ('INVITED','ACCEPTED','EXPIRED','CANCELLED')),
    CONSTRAINT ck_pm_identity_resolution CHECK (identity_resolution_status IN ('PENDING','READY','REVIEW_REQUIRED')),
    CONSTRAINT ck_pm_invitation_resolution CHECK (
        (identity_resolution_status='READY' AND resolved_subject IS NOT NULL)
        OR (identity_resolution_status<>'READY')),
    CONSTRAINT ck_pm_invitation_terminal CHECK (
        (status='ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_subject IS NOT NULL AND accepted_mfa_acr IS NOT NULL)
        OR (status<>'ACCEPTED'))
);
CREATE INDEX ix_pm_invitations_email ON practice_manager_invitations(email_hash,status);
CREATE INDEX ix_pm_invitations_subject ON practice_manager_invitations(resolved_subject,status);
CREATE INDEX ix_pm_invitations_expiry ON practice_manager_invitations(status,expires_at);

ALTER TABLE practice_managers ADD CONSTRAINT fk_practice_manager_accepted_invitation
    FOREIGN KEY (accepted_invitation_id) REFERENCES practice_manager_invitations(id) ON DELETE RESTRICT;

CREATE TABLE practice_manager_delegation_history (
    id UUID PRIMARY KEY,
    delegation_id UUID NOT NULL REFERENCES practice_managers(id) ON DELETE RESTRICT,
    invitation_id UUID REFERENCES practice_manager_invitations(id) ON DELETE RESTRICT,
    practitioner_id UUID NOT NULL REFERENCES virtual_clinics(practitioner_id) ON DELETE RESTRICT,
    event_type VARCHAR(40) NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    effective_subject VARCHAR(255),
    can_manage_schedule BOOLEAN NOT NULL,
    can_manage_profile BOOLEAN NOT NULL,
    can_manage_services BOOLEAN NOT NULL,
    reason VARCHAR(500),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_pm_history_event CHECK (event_type IN
        ('ACCEPTED','PERMISSIONS_NARROWED','PERMISSIONS_ACCEPTED','SUSPENDED','RESUMED','REVOKED'))
);
CREATE INDEX ix_pm_history_delegation ON practice_manager_delegation_history(delegation_id,occurred_at);

ALTER TABLE identity_operations DROP CONSTRAINT ck_identity_operation_type;
ALTER TABLE identity_operations DROP CONSTRAINT ck_identity_operation_target;
ALTER TABLE identity_operations ADD CONSTRAINT ck_identity_operation_type CHECK (operation_type IN
    ('CREATE_STAFF','CREATE_PRACTITIONER','RESOLVE_PRACTICE_MANAGER','RESEND_INVITE','ENABLE_USER','DISABLE_USER_AND_LOGOUT','RESET_PASSWORD','RESET_MFA'));
ALTER TABLE identity_operations ADD CONSTRAINT ck_identity_operation_target CHECK (
    (operation_type IN ('CREATE_STAFF','CREATE_PRACTITIONER','RESOLVE_PRACTICE_MANAGER') AND target_type IS NOT NULL AND target_id IS NOT NULL AND payload_encrypted IS NOT NULL)
    OR (operation_type IN ('RESEND_INVITE','ENABLE_USER','DISABLE_USER_AND_LOGOUT','RESET_PASSWORD','RESET_MFA') AND target_subject IS NOT NULL));
