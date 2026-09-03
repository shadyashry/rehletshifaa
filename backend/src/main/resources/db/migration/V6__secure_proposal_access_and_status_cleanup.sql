-- Secure pre-acceptance proposal access (link + OTP), account activation after acceptance,
-- and a safe cleanup of legacy/unused case-status values.
--
-- Legacy statuses were carried forward in V2's check constraint but are not produced by the
-- canonical server-side lifecycle. Any stored row still holding one is migrated to its
-- canonical equivalent before the constraint is tightened, so existing data is preserved.

UPDATE medical_cases SET status = 'RECEIVED' WHERE status IN ('NEW', 'CLAIM_PENDING');
UPDATE medical_cases SET status = 'INTAKE_REVIEW' WHERE status = 'COORDINATOR_REVIEW';
UPDATE medical_cases SET status = 'CLINICAL_RECOMMENDATION_READY' WHERE status = 'RECOMMENDATION_READY';
UPDATE medical_cases SET status = 'TRAVEL_COORDINATION' WHERE status = 'TREATMENT_COORDINATION';
-- PROPOSAL_READY was never released to patients on its own; PATIENT_DECISION is the canonical
-- "waiting for the patient" state.
UPDATE medical_cases SET status = 'PATIENT_DECISION' WHERE status = 'PROPOSAL_READY';

ALTER TABLE medical_cases DROP CONSTRAINT ck_case_status;
ALTER TABLE medical_cases ADD CONSTRAINT ck_case_status CHECK (status IN (
    'DRAFT','RECEIVED','INTAKE_REVIEW','INFORMATION_REQUIRED',
    'READY_FOR_CONSULTANT','CONSULTANT_ASSIGNMENT_PENDING','CONSULTANT_REVIEW',
    'CLINICAL_RECOMMENDATION_READY','PROPOSAL_PREPARATION','PROPOSAL_INTERNAL_APPROVAL',
    'PATIENT_DECISION','REVISION_REQUESTED','ACCEPTED','DECLINED','EXPIRED',
    'CLINICALLY_NOT_SUITABLE','TRAVEL_COORDINATION','ARRIVAL_CONFIRMED',
    'TREATMENT_IN_PROGRESS','DISCHARGED','FOLLOW_UP','CLOSED','CANCELLED'
));

-- One-time, expiring OTP challenges that gate viewing/deciding a released proposal through a
-- secure link. Only the hash of the code (and of the short-lived view grant) is stored.
CREATE TABLE proposal_access_challenges (
    id UUID PRIMARY KEY,
    share_token_id UUID NOT NULL REFERENCES proposal_share_tokens(id) ON DELETE CASCADE,
    proposal_version_id UUID NOT NULL REFERENCES proposal_versions(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    code_hash VARCHAR(128) NOT NULL,
    delivery_channel VARCHAR(20) NOT NULL,
    destination_hint VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    grant_hash VARCHAR(128),
    grant_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_proposal_access_attempts CHECK (attempts >= 0 AND max_attempts > 0)
);
CREATE INDEX idx_proposal_access_token ON proposal_access_challenges(share_token_id, created_at);
CREATE INDEX idx_proposal_access_grant ON proposal_access_challenges(grant_hash);

-- Post-acceptance account-activation invitations. Sent to the already-verified contact method
-- once a proposal is ACCEPTED; activating links the existing patient profile (and therefore all
-- of its cases) to the newly authenticated account. Idempotent per patient profile.
CREATE TABLE account_activations (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    delivery_channel VARCHAR(20) NOT NULL,
    destination_hint VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    activated_subject VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_account_activation_patient UNIQUE (patient_id)
);
CREATE INDEX idx_account_activation_token ON account_activations(token_hash);

-- Supports fast lookup of the active challenge for a case, and unread-message counting.
CREATE INDEX idx_claim_case_created ON case_claim_challenges(case_id, created_at);
CREATE INDEX idx_messages_unread ON case_messages(case_id, thread_type, read_at);
