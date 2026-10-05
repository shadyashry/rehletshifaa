-- Workforce identity review is distinct from patient operational identity verification.
ALTER TABLE workforce_invitations DROP CONSTRAINT ck_workforce_invitation_status;
ALTER TABLE workforce_invitations ADD CONSTRAINT ck_workforce_invitation_status CHECK
    (status IN ('QUEUED','SENT','ACCEPTED','CANCELLED','EXPIRED','PENDING_REVIEW','AWAITING_ACCEPTANCE','REJECTED'));
ALTER TABLE workforce_invitations ADD COLUMN identity_adopted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE workforce_identity_reviews (
    id UUID PRIMARY KEY,
    invitation_id UUID NOT NULL UNIQUE REFERENCES workforce_invitations(id),
    status VARCHAR(30) NOT NULL,
    resolved_subject VARCHAR(255),
    reviewed_by VARCHAR(255),
    review_reason VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workforce_identity_review_status CHECK
        (status IN ('PENDING_REVIEW','AWAITING_ACCEPTANCE','RESOLVED','REJECTED'))
);
CREATE INDEX ix_workforce_identity_review_queue ON workforce_identity_reviews(status,created_at);
CREATE INDEX ix_workforce_identity_review_holder ON workforce_identity_reviews(resolved_subject,status);
CREATE TABLE workforce_identity_review_history (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES workforce_identity_reviews(id),
    status VARCHAR(30) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL,
    CONSTRAINT uq_workforce_identity_review_history UNIQUE(review_id,revision)
);
