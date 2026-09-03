-- Close workflow-integrity gaps discovered during end-to-end review.

ALTER TABLE proposal_share_tokens ADD COLUMN revoked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE proposal_share_tokens ADD CONSTRAINT uq_proposal_share_token_hash UNIQUE (token_hash);

-- A proposal version can have exactly one irreversible patient decision.
ALTER TABLE proposal_decisions ADD CONSTRAINT uq_proposal_decision_version UNIQUE (proposal_version_id);

-- Patient-facing actions are explicit; internal task text is never selected for patients.
ALTER TABLE case_tasks ADD COLUMN visibility_scope VARCHAR(30) NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE case_tasks ADD COLUMN started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE case_tasks ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE case_tasks ADD COLUMN cancellation_reason VARCHAR(500);
ALTER TABLE case_tasks ADD CONSTRAINT ck_task_visibility CHECK (visibility_scope IN ('INTERNAL','PATIENT_ACTION'));
UPDATE case_tasks SET visibility_scope='PATIENT_ACTION' WHERE owner_role='PATIENT';
CREATE INDEX idx_tasks_queue ON case_tasks(owner_role, owner_subject, status, priority, due_at);

-- Read state is per user, not global to a message row.
CREATE TABLE case_message_reads (
    message_id UUID NOT NULL REFERENCES case_messages(id) ON DELETE CASCADE,
    reader_subject VARCHAR(255) NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (message_id, reader_subject)
);
CREATE INDEX idx_message_reads_reader ON case_message_reads(reader_subject, read_at);

-- Purpose-scoped, expiring links for the pre-account patient journey.
CREATE TABLE case_access_links (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    purpose VARCHAR(40) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_case_access_purpose CHECK (purpose IN ('STATUS','INFORMATION_RESPONSE'))
);
CREATE INDEX idx_case_access_case_purpose ON case_access_links(case_id, purpose, expires_at);

CREATE TABLE case_access_challenges (
    id UUID PRIMARY KEY,
    link_id UUID NOT NULL REFERENCES case_access_links(id) ON DELETE CASCADE,
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
    CONSTRAINT ck_case_access_attempts CHECK (attempts >= 0 AND max_attempts > 0)
);
CREATE INDEX idx_case_access_challenge_link ON case_access_challenges(link_id, created_at);
CREATE INDEX idx_case_access_challenge_grant ON case_access_challenges(grant_hash);

-- PROPOSAL_READY represented an internally ready proposal, not proof that the patient was
-- contacted. Repair V6's broad mapping unless a released/viewed/decided version exists.
UPDATE medical_cases c
SET status='PROPOSAL_INTERNAL_APPROVAL'
WHERE c.status='PATIENT_DECISION'
  AND NOT EXISTS (
      SELECT 1 FROM proposals p
      JOIN proposal_versions pv ON pv.proposal_id=p.id
      WHERE p.case_id=c.id
        AND pv.status IN ('RELEASED','VIEWED','ACCEPTED','DECLINED','REVISION_REQUESTED','EXPIRED')
  );

