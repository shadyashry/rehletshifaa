-- P1-13 session 1 (review 2026-10-14, A-05 and A-06): minors and their guardians, case-level incidents, reopening a closed case.
-- Pre-production clean cutover: new columns and tables state the final design, no backfill.

-- 1) A-05: the patient's age band is captured when the case is sent. NULL means "not stated" (the coordinator records it
--    in intake review); the minor bands (UNDER_12, AGE_12_17) require a GUARDIAN delegation with verified evidence.
ALTER TABLE medical_cases ADD COLUMN age_band VARCHAR(20);
ALTER TABLE medical_cases ADD CONSTRAINT ck_medical_cases_age_band CHECK (age_band IS NULL OR age_band IN ('UNDER_12', 'AGE_12_17', 'AGE_18_64', 'AGE_65_PLUS'));

-- 2) A-05: a delegation is either a REPRESENTATIVE (acts for an adult who authorised it) or a GUARDIAN (acts under a legal
--    basis, for a minor or an adult who cannot decide). A guardian names the legal basis, attaches an evidence document of
--    the case and a coordinator verifies it; the guardian consent text is its own consent type (GUARDIAN_AUTHORIZATION).
ALTER TABLE patient_representatives ADD COLUMN delegation_type VARCHAR(20) NOT NULL DEFAULT 'REPRESENTATIVE';
ALTER TABLE patient_representatives ADD COLUMN legal_basis VARCHAR(30);
ALTER TABLE patient_representatives ADD COLUMN evidence_document_id UUID REFERENCES medical_documents(id) ON DELETE RESTRICT;
ALTER TABLE patient_representatives ADD COLUMN evidence_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE patient_representatives ADD COLUMN evidence_verified_by VARCHAR(255);
ALTER TABLE patient_representatives ADD CONSTRAINT ck_patient_representatives_type CHECK (delegation_type IN ('REPRESENTATIVE', 'GUARDIAN'));
ALTER TABLE patient_representatives ADD CONSTRAINT ck_patient_representatives_basis CHECK (
    (delegation_type = 'GUARDIAN' AND legal_basis IS NOT NULL AND legal_basis IN ('PARENT', 'LEGAL_GUARDIAN', 'COURT_ORDER'))
    OR (delegation_type = 'REPRESENTATIVE' AND legal_basis IS NULL));
ALTER TABLE patient_representatives ADD CONSTRAINT ck_patient_representatives_evidence CHECK (
    (evidence_verified_at IS NULL AND evidence_verified_by IS NULL)
    OR (evidence_document_id IS NOT NULL AND evidence_verified_at IS NOT NULL AND evidence_verified_by IS NOT NULL));

-- 3) A-06: a case-level incident (complaint, dispute, adverse event, death), owned by a Care Coordination Manager and
--    visible to Compliance. The summary and the resolution note may hold clinical detail, so both are encrypted (same
--    converter as patient PII); audit and notifications carry the type and the case number only.
CREATE TABLE case_incidents (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    incident_type VARCHAR(20) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(20) NOT NULL,
    case_stage VARCHAR(40) NOT NULL,
    summary TEXT NOT NULL,
    raised_by VARCHAR(255) NOT NULL,
    raised_by_role VARCHAR(40) NOT NULL,
    raised_at TIMESTAMP WITH TIME ZONE NOT NULL,
    owner_subject VARCHAR(255),
    owner_assigned_at TIMESTAMP WITH TIME ZONE,
    resolution_code VARCHAR(30),
    resolution_note TEXT,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_case_incidents_type CHECK (incident_type IN ('COMPLAINT', 'DISPUTE', 'ADVERSE_EVENT', 'DEATH')),
    CONSTRAINT ck_case_incidents_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT ck_case_incidents_status CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED')),
    CONSTRAINT ck_case_incidents_source CHECK (source IN ('PATIENT', 'STAFF', 'SYSTEM')),
    CONSTRAINT ck_case_incidents_resolution CHECK (resolution_code IS NULL OR resolution_code IN ('NO_ACTION_NEEDED', 'EXPLAINED_TO_PATIENT',
        'CORRECTIVE_ACTION', 'REFERRED_TO_PROVIDER', 'REFERRED_TO_AUTHORITY', 'WITHDRAWN_BY_PATIENT')),
    CONSTRAINT ck_case_incidents_resolved CHECK ((status = 'RESOLVED') = (resolution_code IS NOT NULL AND resolution_note IS NOT NULL
        AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
    CONSTRAINT ck_case_incidents_death_critical CHECK (incident_type <> 'DEATH' OR severity = 'CRITICAL')
);
CREATE INDEX ix_case_incidents_case ON case_incidents(case_id, raised_at);
CREATE INDEX ix_case_incidents_status ON case_incidents(status, raised_at);
CREATE INDEX ix_case_incidents_owner ON case_incidents(owner_subject, status);

-- 4) A-06: a CLOSED case reopens into FOLLOW_UP with its Consultant. One append-only row per reopening says why; the note
--    and the optional incident link stay here, the status history carries the typed reason only.
CREATE TABLE case_reopenings (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    reason VARCHAR(40) NOT NULL,
    incident_id UUID REFERENCES case_incidents(id),
    note TEXT,
    reopened_by VARCHAR(255) NOT NULL,
    reopened_by_role VARCHAR(40) NOT NULL,
    reopened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_case_reopenings_reason CHECK (reason IN ('COMPLICATION_REPORTED', 'PATIENT_REQUEST', 'CLINICAL_FOLLOW_UP_NEEDED', 'INCIDENT_REVIEW'))
);
CREATE INDEX ix_case_reopenings_case ON case_reopenings(case_id, reopened_at);
