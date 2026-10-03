-- Section 1 Platform Account Owner relationship: controlled bootstrap and ordinary transfer (GOV-01, INV-01/02).
-- OD-02 owner recovery is intentionally not implemented.

CREATE TABLE platform_account_owner_relationships (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL REFERENCES access_subjects(subject),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_platform_owner_status CHECK (status IN ('ACTIVE','ENDED')),
    CONSTRAINT ck_platform_owner_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Singleton pointer makes exactly one current owner representable after bootstrap while preserving history.
CREATE TABLE platform_account_owner_current (
    id INTEGER PRIMARY KEY,
    relationship_id UUID NOT NULL UNIQUE REFERENCES platform_account_owner_relationships(id),
    CONSTRAINT ck_platform_owner_current_singleton CHECK (id=1)
);

CREATE TABLE platform_governance_bootstrap (
    id INTEGER PRIMARY KEY,
    completed_at TIMESTAMP WITH TIME ZONE,
    owner_subject VARCHAR(255),
    first_administrator_subject VARCHAR(255),
    second_administrator_subject VARCHAR(255),
    CONSTRAINT ck_platform_governance_bootstrap_singleton CHECK (id=1),
    CONSTRAINT ck_platform_governance_bootstrap_complete CHECK
        ((completed_at IS NULL AND owner_subject IS NULL AND first_administrator_subject IS NULL AND second_administrator_subject IS NULL)
         OR (completed_at IS NOT NULL AND owner_subject IS NOT NULL AND first_administrator_subject IS NOT NULL AND second_administrator_subject IS NOT NULL)),
    CONSTRAINT ck_platform_governance_bootstrap_distinct CHECK
        (completed_at IS NULL OR (owner_subject<>first_administrator_subject AND owner_subject<>second_administrator_subject
         AND first_administrator_subject<>second_administrator_subject))
);
INSERT INTO platform_governance_bootstrap(id) VALUES(1);

CREATE TABLE platform_owner_transfer_requests (
    id UUID PRIMARY KEY,
    current_owner_subject VARCHAR(255) NOT NULL,
    incoming_owner_subject VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL,
    initiated_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    initiated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_owner_transfer_distinct CHECK (current_owner_subject<>incoming_owner_subject),
    CONSTRAINT ck_owner_transfer_status CHECK (status IN ('PENDING_ACCEPTANCE','PENDING_VERIFICATION','COMPLETED','REJECTED','EXPIRED')),
    CONSTRAINT ck_owner_transfer_expiry CHECK (expires_at>initiated_at)
);

CREATE TABLE platform_owner_transfer_acceptances (
    request_id UUID PRIMARY KEY REFERENCES platform_owner_transfer_requests(id),
    accepted_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    phishing_resistant_authentication BOOLEAN NOT NULL,
    CONSTRAINT ck_owner_transfer_acceptance_phishing_resistant CHECK (phishing_resistant_authentication=TRUE)
);

CREATE TABLE platform_owner_transfer_verifications (
    request_id UUID PRIMARY KEY REFERENCES platform_owner_transfer_requests(id),
    verified_by VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL
);
