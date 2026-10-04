-- Section 1 durable after-commit identity mutations (IDO-01..IDO-07). PostgreSQL is authoritative for business
-- lifecycle; Keycloak is updated asynchronously without holding a business transaction across a network call.
CREATE TABLE identity_operations (
    id UUID PRIMARY KEY,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    target_subject VARCHAR(255),
    target_type VARCHAR(40),
    target_id UUID,
    payload_encrypted TEXT,
    result_subject VARCHAR(255),
    operation_type VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 8,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    last_error_code VARCHAR(80),
    correlation_id VARCHAR(100) NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    abandoned_at TIMESTAMP WITH TIME ZONE,
    abandoned_by VARCHAR(255),
    abandon_reason VARCHAR(500),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_identity_operation_type CHECK (operation_type IN
        ('CREATE_STAFF','CREATE_PRACTITIONER','RESEND_INVITE','ENABLE_USER','DISABLE_USER_AND_LOGOUT','RESET_PASSWORD','RESET_MFA')),
    CONSTRAINT ck_identity_operation_target CHECK (
        (operation_type IN ('CREATE_STAFF','CREATE_PRACTITIONER') AND target_type IS NOT NULL AND target_id IS NOT NULL AND payload_encrypted IS NOT NULL)
        OR (operation_type IN ('RESEND_INVITE','ENABLE_USER','DISABLE_USER_AND_LOGOUT','RESET_PASSWORD','RESET_MFA') AND target_subject IS NOT NULL)),
    CONSTRAINT ck_identity_operation_status CHECK (status IN ('PENDING','RUNNING','RETRYING','SUCCEEDED','DEAD')),
    CONSTRAINT ck_identity_operation_attempts CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts),
    CONSTRAINT ck_identity_operation_abandon CHECK (
        (abandoned_at IS NULL AND abandoned_by IS NULL AND abandon_reason IS NULL)
        OR (abandoned_at IS NOT NULL AND abandoned_by IS NOT NULL AND abandon_reason IS NOT NULL AND status='DEAD'))
);
CREATE INDEX ix_identity_operations_due ON identity_operations(status,next_attempt_at);
CREATE INDEX ix_identity_operations_subject ON identity_operations(target_subject,created_at);
