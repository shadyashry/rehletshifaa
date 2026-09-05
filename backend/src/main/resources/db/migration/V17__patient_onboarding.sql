-- Patient conversion / onboarding sub-workflow. Onboarding state lives in its OWN table and is
-- NEVER folded into medical_cases.status. A record is created idempotently when a preliminary
-- estimate is ACKNOWLEDGED. Contact verification and account activation are tracked separately and
-- neither is legal identity verification. The unique constraint makes creation idempotent for the
-- (patient, case, acknowledged-proposal) relationship.
CREATE TABLE patient_onboardings (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    proposal_version_id UUID REFERENCES proposal_versions(id) ON DELETE SET NULL,
    state VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED' CHECK (state IN ('NOT_STARTED','IN_PROGRESS','CONTACT_VERIFICATION_REQUIRED','IDENTITY_VERIFICATION_REQUIRED','IDENTITY_REVIEW','CONSENT_REQUIRED','DEPOSIT_REQUIRED','COMPLETED','EXPIRED','CANCELLED','LEGACY_EXEMPT')),
    subject_type VARCHAR(20) CHECK (subject_type IN ('PATIENT','GUARDIAN','REPRESENTATIVE','PAYER')),
    started_at TIMESTAMP WITH TIME ZONE,
    contact_verified_at TIMESTAMP WITH TIME ZONE,
    identity_verified_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_onboarding_patient_case_proposal UNIQUE (patient_id, case_id, proposal_version_id)
);
CREATE INDEX idx_onboarding_patient ON patient_onboardings(patient_id);
CREATE INDEX idx_onboarding_case ON patient_onboardings(case_id);
