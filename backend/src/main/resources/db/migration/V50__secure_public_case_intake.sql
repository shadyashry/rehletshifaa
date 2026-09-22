CREATE TABLE case_intake_grants (
    case_id UUID PRIMARY KEY REFERENCES medical_cases(id) ON DELETE CASCADE,
    grant_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_case_intake_grants_expiry ON case_intake_grants(expires_at);
