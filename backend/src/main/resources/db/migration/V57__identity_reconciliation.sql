-- Section 1 identity reconciliation evidence (IDO-06).

CREATE TABLE identity_reconciliation_runs (
    id UUID PRIMARY KEY,
    trigger_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    checked_count INTEGER NOT NULL DEFAULT 0,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT ck_identity_reconciliation_trigger CHECK (trigger_type IN ('MANUAL','SCHEDULED','POST_RESTORE')),
    CONSTRAINT ck_identity_reconciliation_status CHECK (status IN ('RUNNING','PASSED','DISCREPANCIES','FAILED'))
);

CREATE TABLE identity_reconciliation_discrepancies (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES identity_reconciliation_runs(id),
    subject VARCHAR(255) NOT NULL,
    discrepancy_type VARCHAR(50) NOT NULL,
    database_state VARCHAR(80),
    identity_state VARCHAR(80),
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_identity_discrepancy_type CHECK (discrepancy_type IN
        ('IDENTITY_NOT_FOUND','DATABASE_ACTIVE_IDENTITY_DISABLED','DATABASE_INACTIVE_IDENTITY_ENABLED',
         'MFA_NOT_ENROLLED','PHISHING_RESISTANT_MFA_NOT_ENROLLED','ZERO_EFFECTIVE_SYSTEM_ADMINISTRATORS'))
);
CREATE INDEX ix_identity_reconciliation_subject ON identity_reconciliation_discrepancies(subject,detected_at);
