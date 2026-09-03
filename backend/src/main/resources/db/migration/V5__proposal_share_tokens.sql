-- Tokenized, no-login patient links for reviewing and signing a released proposal.
-- The raw token is delivered to the patient (WhatsApp/email); only its hash is stored.

CREATE TABLE proposal_share_tokens (
    id UUID PRIMARY KEY,
    proposal_version_id UUID NOT NULL REFERENCES proposal_versions(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    signed_name VARCHAR(160),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_proposal_token_hash ON proposal_share_tokens(token_hash);
