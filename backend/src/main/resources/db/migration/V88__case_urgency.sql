-- Review 2026-10-14, A-02 (P0-3): a coordinator-set clinical urgency on the case. ROUTINE until a coordinator says
-- otherwise; PRIORITY and URGENT need a reason. URGENT raises the case's work to HIGH (one derivation,
-- StaffWorkService.derivePriority), alerts the coordinator's leads and breaks routing ties towards an on-duty, lightly
-- loaded coordinator. The current level lives on the case; every change is kept beside it with its reason, which may
-- hold clinical detail and is therefore stored encrypted (same converter as patient PII). Pre-production clean
-- cutover: existing cases simply start ROUTINE.
ALTER TABLE medical_cases ADD COLUMN urgency VARCHAR(20) DEFAULT 'ROUTINE' NOT NULL;
ALTER TABLE medical_cases ADD CONSTRAINT ck_medical_cases_urgency CHECK (urgency IN ('ROUTINE', 'PRIORITY', 'URGENT'));

CREATE TABLE case_urgency_changes (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    from_urgency VARCHAR(20) NOT NULL,
    to_urgency VARCHAR(20) NOT NULL,
    reason VARCHAR(2000) NOT NULL,
    stage VARCHAR(40) NOT NULL,
    set_by VARCHAR(255) NOT NULL,
    set_by_role VARCHAR(40) NOT NULL,
    set_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_case_urgency_changes_from CHECK (from_urgency IN ('ROUTINE', 'PRIORITY', 'URGENT')),
    CONSTRAINT ck_case_urgency_changes_to CHECK (to_urgency IN ('ROUTINE', 'PRIORITY', 'URGENT'))
);
CREATE INDEX ix_case_urgency_changes_case ON case_urgency_changes(case_id, set_at);
