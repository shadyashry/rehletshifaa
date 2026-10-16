-- P1-7 session 1 (review E-03, design §7.13 "abandoned draft: scheduled clean-up after about 7 days, files included, audited").
-- Pre-production clean cutover: new tables state the final design, no backfill. The plan's "V91" name was stale; V104 is the next free.

-- 1) The retention policy per record class. Every table the platform keeps belongs to exactly one class (RecordCatalogue in the
--    retention module, guarded by a test over every entity). A class with days is purged that long after its anchor by a purge
--    handler; a class without days is kept (its term waits for counsel, or it holds no personal data). legal_hold suspends every
--    purge of the class. LEGAL_RECORD (the evidence ledger, statements, money, consent, audit, the purge log itself) is never purged:
--    the schema refuses days or a lifted hold on it. Policies change by migration only, reviewed like code (the RolePolicy rule).
CREATE TABLE retention_policies (
    record_class VARCHAR(40) PRIMARY KEY,
    retention_days INTEGER,
    anchor VARCHAR(30) NOT NULL,
    legal_hold BOOLEAN NOT NULL,
    basis VARCHAR(300) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_retention_policies_days CHECK (retention_days IS NULL OR retention_days > 0),
    CONSTRAINT ck_retention_policies_anchor CHECK (anchor IN ('CREATED', 'PROCESSED', 'CLOSED', 'EXPIRED', 'CASE_CLOSED', 'RELATIONSHIP_ENDED', 'NONE')),
    CONSTRAINT ck_retention_policies_legal CHECK (record_class <> 'LEGAL_RECORD' OR (retention_days IS NULL AND legal_hold = TRUE))
);

INSERT INTO retention_policies (record_class, retention_days, anchor, legal_hold, basis, updated_at) VALUES
    ('DRAFT_INTAKE', 7, 'CREATED', FALSE, 'Design 7.13 [Decided]: an abandoned draft and its files are removed after about 7 days, audited', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('TRANSPORT_LOG', 30, 'PROCESSED', FALSE, 'P1-7: the WhatsApp inbound queue (plaintext sender digits) is a transport copy; the case or conversation holds the content', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('INTAKE_CONVERSATION', 90, 'CLOSED', FALSE, 'P1-7: the reply address of a WhatsApp conversation is kept 90 days after it closes; purge handler not built yet', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('ACCESS_SECRET', 90, 'EXPIRED', FALSE, 'P1-7: links, codes and challenges hold no use after expiry; purge handler not built yet', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('PERSONAL_IDENTITY', NULL, 'CASE_CLOSED', FALSE, 'Kept with the person''s records; pseudonymised on an erasure request; term with counsel (PDPL)', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('CLINICAL_RECORD', NULL, 'CASE_CLOSED', FALSE, 'The medical record of a sent case; term with counsel (medical-record law and PDPL)', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('CASE_OPERATIONS', NULL, 'CASE_CLOSED', FALSE, 'Work, routing and runtime state that follow the case; kept as long as the clinical record', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('WORKFORCE_RECORD', NULL, 'RELATIONSHIP_ENDED', FALSE, 'Staff, Consultant and clinic records; term with counsel (employment and credentialing)', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('LEGAL_RECORD', NULL, 'NONE', TRUE, 'Evidence ledger, statements, money, consent, decisions, audit and the purge log: never purged', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('CONFIGURATION', NULL, 'NONE', FALSE, 'Reference data and policies: no personal data', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00'),
    ('SYSTEM_STATE', NULL, 'NONE', FALSE, 'Locks, leases and pointers: no personal data', TIMESTAMP WITH TIME ZONE '2026-10-16 00:00:00+00');

-- 2) The purge log: one row per purge (a draft, a batch of transport rows, an erased person), written with its audit row in the same
--    transaction. It is itself a LEGAL_RECORD. No foreign key to the subject: the log outlives what it describes. The request
--    reference of an erasure (where the person asked) is encrypted; the log holds no other personal data.
CREATE TABLE retention_purges (
    id UUID PRIMARY KEY,
    record_class VARCHAR(40) NOT NULL REFERENCES retention_policies(record_class),
    subject_type VARCHAR(30) NOT NULL,
    subject_id UUID,
    cause VARCHAR(20) NOT NULL,
    policy_days INTEGER,
    rows_affected INTEGER NOT NULL,
    files_deleted INTEGER NOT NULL,
    bytes_deleted BIGINT NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    request_reference VARCHAR(600),
    purged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_retention_purges_subject CHECK (subject_type IN ('DRAFT_CASE', 'TRANSPORT_BATCH', 'PATIENT')),
    CONSTRAINT ck_retention_purges_cause CHECK (cause IN ('SCHEDULE', 'ERASURE_REQUEST')),
    CONSTRAINT ck_retention_purges_class CHECK (record_class <> 'LEGAL_RECORD'),
    CONSTRAINT ck_retention_purges_counts CHECK (rows_affected >= 0 AND files_deleted >= 0 AND bytes_deleted >= 0),
    CONSTRAINT ck_retention_purges_erasure CHECK ((cause = 'ERASURE_REQUEST') = (subject_type = 'PATIENT') AND (subject_type = 'TRANSPORT_BATCH' OR subject_id IS NOT NULL))
);
CREATE INDEX ix_retention_purges_purged ON retention_purges(purged_at);
CREATE INDEX ix_retention_purges_subject ON retention_purges(subject_id);

-- 3) A purged draft stays as a contentless tombstone: audit_events and consent_records (LEGAL_RECORD) reference the case and its
--    patient with ON DELETE RESTRICT, so the rows they point at stay and everything personal on them goes.
ALTER TABLE medical_cases ADD COLUMN purged_at TIMESTAMP WITH TIME ZONE;

-- 4) An erased person keeps their row as a pseudonym (cases, ledger, statements and audit still point at it).
ALTER TABLE patient_profiles ADD COLUMN erased_at TIMESTAMP WITH TIME ZONE;

-- 5) Erasure removes the person's sign-in account from the identity provider (name and email live there too).
ALTER TABLE identity_operations DROP CONSTRAINT ck_identity_operation_type;
ALTER TABLE identity_operations DROP CONSTRAINT ck_identity_operation_target;
ALTER TABLE identity_operations ADD CONSTRAINT ck_identity_operation_type CHECK (operation_type IN
    ('CREATE_STAFF','CREATE_PRACTITIONER','RESOLVE_PRACTICE_MANAGER','RESEND_INVITE','ENABLE_USER','DISABLE_USER_AND_LOGOUT','RESET_PASSWORD','RESET_MFA','DELETE_USER'));
ALTER TABLE identity_operations ADD CONSTRAINT ck_identity_operation_target CHECK (
    (operation_type IN ('CREATE_STAFF','CREATE_PRACTITIONER','RESOLVE_PRACTICE_MANAGER') AND target_type IS NOT NULL AND target_id IS NOT NULL AND payload_encrypted IS NOT NULL)
    OR (operation_type IN ('RESEND_INVITE','ENABLE_USER','DISABLE_USER_AND_LOGOUT','RESET_PASSWORD','RESET_MFA','DELETE_USER') AND target_subject IS NOT NULL));
