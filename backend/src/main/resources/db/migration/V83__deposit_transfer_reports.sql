-- DEP-3 (owner decision 2026-10-13): the coordination deposit never settles on staff word alone. The patient pays by bank
-- transfer and enters the transaction reference their bank gave them; Finance verifies it against the bank and confirms
-- the amount received or rejects it with a reason. One row per reference the patient submits, kept for audit.
CREATE TABLE deposit_transfer_reports (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    deposit_id UUID NOT NULL REFERENCES deposits(id) ON DELETE RESTRICT,
    method VARCHAR(20) NOT NULL,
    transfer_reference VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_by VARCHAR(255),
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_reason VARCHAR(500),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_transfer_report_method CHECK (method IN ('BANK_TRANSFER')),
    CONSTRAINT ck_transfer_report_status CHECK (status IN ('SUBMITTED', 'CONFIRMED', 'REJECTED')),
    CONSTRAINT ck_transfer_report_decision CHECK ((status = 'SUBMITTED') = (decided_at IS NULL))
);
CREATE INDEX idx_transfer_reports_deposit ON deposit_transfer_reports(deposit_id, submitted_at);
CREATE INDEX idx_transfer_reports_case ON deposit_transfer_reports(case_id);

-- When the deposit became the patient's to pay (profile done, no reference pending): the reminder cycle counts from it.
ALTER TABLE deposits ADD COLUMN payable_at TIMESTAMP WITH TIME ZONE;
