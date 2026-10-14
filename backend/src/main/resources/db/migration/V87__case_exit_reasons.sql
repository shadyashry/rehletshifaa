-- Review 2026-10-14, A-01/V6 (P0-2): a case can now leave ACCEPTED, ARRIVAL_CONFIRMED, TREATMENT_IN_PROGRESS,
-- DISCHARGED and FOLLOW_UP. Every such exit carries a typed reason, kept here beside the status history so a
-- cancelled or expired case says why: a coordinator's typed cancellation, the patient's own withdrawal, a deposit
-- reminder cycle that ended unpaid, or a Consultant's "no follow-up needed". Pre-production clean cutover: new table,
-- no shim. The note may hold clinical detail, so it is stored encrypted (same converter as patient PII).
CREATE TABLE case_exit_reasons (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    from_status VARCHAR(40) NOT NULL,
    to_status VARCHAR(40) NOT NULL,
    reason VARCHAR(40) NOT NULL,
    note VARCHAR(2000),
    recorded_by VARCHAR(255) NOT NULL,
    recorded_by_role VARCHAR(40) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_case_exit_reasons_reason CHECK (reason IN ('PATIENT_WITHDREW', 'HOSPITAL_REFUSED', 'MEDICAL_CONTRAINDICATION',
        'PATIENT_DECEASED', 'NO_SHOW', 'DEPOSIT_UNPAID', 'NO_FOLLOW_UP_NEEDED')),
    CONSTRAINT ck_case_exit_reasons_target CHECK (to_status IN ('CANCELLED', 'EXPIRED', 'CLOSED'))
);
CREATE INDEX ix_case_exit_reasons_case ON case_exit_reasons(case_id, recorded_at);
