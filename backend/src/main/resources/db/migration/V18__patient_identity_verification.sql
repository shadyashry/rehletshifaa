-- Legal identity verification, kept strictly separate from contact verification and account
-- activation. Only masked or encrypted minimum-necessary identity data is stored; raw biometric
-- content and complete identity documents are NEVER stored here. A clean provider abstraction
-- (IdentityVerificationPort) sits in front of this; the only local implementations are a
-- profile-restricted test simulator and authorized manual review.
CREATE TABLE patient_identity_verifications (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
    onboarding_id UUID REFERENCES patient_onboardings(id) ON DELETE SET NULL,
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('PATIENT','REPRESENTATIVE')),
    representative_id UUID REFERENCES patient_representatives(id) ON DELETE SET NULL,
    representative_relationship VARCHAR(80),
    assurance_level VARCHAR(20),
    method VARCHAR(40),
    provider VARCHAR(60),
    provider_reference VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','PENDING','MANUAL_REVIEW','VERIFIED','REJECTED','EXPIRED')),
    legal_name_encrypted TEXT,
    date_of_birth_encrypted TEXT,
    nationality VARCHAR(80),
    document_type VARCHAR(40),
    issuing_country VARCHAR(80),
    document_reference_masked VARCHAR(60),
    requested_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(120),
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_identity_patient ON patient_identity_verifications(patient_id);
CREATE INDEX idx_identity_onboarding ON patient_identity_verifications(onboarding_id);
