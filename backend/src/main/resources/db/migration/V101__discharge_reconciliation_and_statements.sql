-- P1-17 session 1 (post-deposit design §5 stage 5, §6 rules 4-6, decision D-F; architecture §4.1, §4.4, §4.5, §5.4, §5.5).
-- Pre-production clean cutover: new tables state the final design, no backfill. The plan's "V98" name was stale; V101 is the next
-- free number.

-- 1) The ledger's discharge kinds. The pack items are the Consultant's typed clean documents (the ledger row is the type: a
--    DISCHARGE_SUMMARY row says which document is the summary); the handover letter is generated from the pack; the hospital's
--    final invoice is Operations' and Finance countersigns it when it opens the reconciliation; RECONCILIATION is the settled
--    reconciliation (closed, or closed with a facility dispute open); the return travel and the departure are Operations'.
ALTER TABLE case_evidence DROP CONSTRAINT ck_case_evidence_kind;
ALTER TABLE case_evidence ADD CONSTRAINT ck_case_evidence_kind CHECK (kind IN ('FACILITY_ADMISSION_LETTER', 'PRICE_VARIANCE_CHECK',
    'ARRIVAL_ATTESTED', 'PATIENT_ARRIVED', 'BALANCE_EVIDENCED', 'FEE_BALANCE_RECEIVED', 'ADMISSION_NUMBER', 'POINT_OF_NO_RETURN',
    'EMERGENCY_ADMISSION_OVERRIDE', 'MILESTONE_ADMITTED', 'MILESTONE_PROCEDURE_STARTED', 'MILESTONE_PROCEDURE_COMPLETED', 'MILESTONE_ICU',
    'MILESTONE_WARD', 'MILESTONE_COMPLICATION', 'MILESTONE_STABLE', 'MILESTONE_DISCHARGE_PLANNED', 'INTERIM_BILL', 'CHANGE_ORDER',
    'DISCHARGE_SUMMARY', 'MEDICATION_LIST', 'OPERATIVE_NOTE', 'IMPLANT_RECORD', 'FIT_TO_FLY', 'HANDOVER_LETTER', 'FINAL_INVOICE',
    'RECONCILIATION', 'RETURN_CONFIRMED', 'DEPARTURE_CONFIRMED'));

-- 2) D-F: a fit-to-fly certificate is valid for a flight that leaves within this many hours of the examination (72 by default);
--    Operations cannot confirm a return flight without one. Finance Managers change it per care area; left out it carries over.
ALTER TABLE commercial_policies ADD COLUMN fit_to_fly_hours INTEGER NOT NULL DEFAULT 72;
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_fit_to_fly CHECK (fit_to_fly_hours >= 24 AND fit_to_fly_hours <= 168);

-- 3) The reconciliation (module settlement; architecture §4.4): the hospital's final invoice against what was authorised (the
--    voucher's package plus the case's counted change orders). One per case. Finance submits the invoice lines; a variance above
--    the case's change-order band waits for a Finance Manager's countersignature; lines the patient is never charged for (an
--    unapproved extra, a billing error) leave a facility dispute open. Amounts in EGP.
CREATE TABLE reconciliations (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    final_invoice_evidence_id UUID NOT NULL REFERENCES case_evidence(id),
    status VARCHAR(30) NOT NULL,
    invoice_total_egp NUMERIC(14,2) NOT NULL,
    authorised_egp NUMERIC(14,2) NOT NULL,
    band_limit_egp NUMERIC(14,2) NOT NULL,
    charged_egp NUMERIC(14,2),
    variance_egp NUMERIC(14,2),
    disputed_egp NUMERIC(14,2),
    paid_at_facility_egp NUMERIC(14,2),
    note TEXT,
    opened_by VARCHAR(255) NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    submitted_by VARCHAR(255),
    submitted_at TIMESTAMP WITH TIME ZONE,
    countersigned_by VARCHAR(255),
    countersigned_at TIMESTAMP WITH TIME ZONE,
    settled_at TIMESTAMP WITH TIME ZONE,
    dispute_outcome VARCHAR(30),
    dispute_resolved_by VARCHAR(255),
    dispute_resolved_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_reconciliations_case UNIQUE (case_id),
    CONSTRAINT ck_reconciliations_status CHECK (status IN ('OPEN', 'AWAITING_COUNTERSIGN', 'DISPUTED', 'CLOSED')),
    CONSTRAINT ck_reconciliations_amounts CHECK (invoice_total_egp >= 0 AND authorised_egp >= 0 AND band_limit_egp >= 0
        AND (disputed_egp IS NULL OR disputed_egp >= 0) AND (paid_at_facility_egp IS NULL OR paid_at_facility_egp >= 0)),
    -- Submitted figures are set together, and only once the lines are in.
    CONSTRAINT ck_reconciliations_submitted CHECK ((submitted_at IS NULL) = (submitted_by IS NULL) AND (submitted_at IS NULL) = (charged_egp IS NULL)
        AND (submitted_at IS NULL) = (variance_egp IS NULL) AND (submitted_at IS NULL) = (disputed_egp IS NULL)
        AND (submitted_at IS NULL) = (paid_at_facility_egp IS NULL) AND (status = 'OPEN') = (submitted_at IS NULL)),
    CONSTRAINT ck_reconciliations_countersigned CHECK ((countersigned_at IS NULL) = (countersigned_by IS NULL)
        AND (countersigned_by IS NULL OR countersigned_by <> submitted_by)),
    CONSTRAINT ck_reconciliations_settled CHECK ((status IN ('DISPUTED', 'CLOSED')) = (settled_at IS NOT NULL)),
    CONSTRAINT ck_reconciliations_dispute CHECK ((dispute_outcome IS NULL) = (dispute_resolved_at IS NULL)
        AND (dispute_outcome IS NULL) = (dispute_resolved_by IS NULL)
        AND (dispute_outcome IS NULL OR dispute_outcome IN ('FACILITY_WITHDREW', 'PLATFORM_ABSORBED'))
        AND (status <> 'DISPUTED' OR dispute_outcome IS NULL))
);

-- Each invoice line, matched to what authorised it (the package, a counted change-order line) or to nothing. The rule "an
-- unapproved extra is never charged to the patient" is schema-enforced: an unmatched line is never charged a positive amount, and
-- a matched one never above what was authorised.
CREATE TABLE reconciliation_lines (
    id UUID PRIMARY KEY,
    reconciliation_id UUID NOT NULL REFERENCES reconciliations(id),
    line_no INTEGER NOT NULL,
    description VARCHAR(500) NOT NULL,
    invoice_egp NUMERIC(14,2) NOT NULL,
    matched_source VARCHAR(20) NOT NULL,
    matched_id UUID,
    authorised_egp NUMERIC(14,2),
    charged_egp NUMERIC(14,2) NOT NULL,
    variance_egp NUMERIC(14,2) NOT NULL,
    variance_code VARCHAR(20) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_reconciliation_lines_no UNIQUE (reconciliation_id, line_no),
    CONSTRAINT ck_reconciliation_lines_source CHECK (matched_source IN ('PACKAGE', 'CHANGE_ORDER_LINE', 'NONE')),
    CONSTRAINT ck_reconciliation_lines_code CHECK (variance_code IN ('WITHIN_BAND', 'CHANGE_ORDER', 'UNAPPROVED_EXTRA', 'BILLING_ERROR', 'CREDIT')),
    CONSTRAINT ck_reconciliation_lines_match CHECK ((matched_source = 'NONE') = (authorised_egp IS NULL)
        AND (matched_source <> 'CHANGE_ORDER_LINE' OR matched_id IS NOT NULL)),
    CONSTRAINT ck_reconciliation_lines_never_charged CHECK ((variance_code <> 'UNAPPROVED_EXTRA' OR (matched_source = 'NONE' AND charged_egp = 0))
        AND (matched_source <> 'NONE' OR charged_egp <= 0) AND (authorised_egp IS NULL OR charged_egp <= authorised_egp))
);
CREATE INDEX ix_reconciliation_lines_reconciliation ON reconciliation_lines(reconciliation_id);

-- 4) Statements (module settlement; architecture §4.5; design §6 rule 5): the patient's statement at discharge, an immutable
--    record in EGP and, at the voucher's frozen rate, the patient's currency. A correction is a new revision that names the one it
--    supersedes. The only later write is the e-invoice reference slot (the ETA document id once e-invoicing is integrated), once.
--    The lines (descriptions of care) are encrypted.
CREATE TABLE statements (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    kind VARCHAR(20) NOT NULL,
    statement_number VARCHAR(40) NOT NULL,
    revision INTEGER NOT NULL,
    reconciliation_id UUID REFERENCES reconciliations(id),
    display_currency VARCHAR(3) NOT NULL,
    fx_rate NUMERIC(18,8),
    package_egp NUMERIC(14,2) NOT NULL,
    change_orders_egp NUMERIC(14,2) NOT NULL,
    medical_charged_egp NUMERIC(14,2) NOT NULL,
    platform_fee_egp NUMERIC(14,2) NOT NULL,
    total_charged_egp NUMERIC(14,2) NOT NULL,
    deposit_paid_egp NUMERIC(14,2) NOT NULL,
    fee_balance_paid_egp NUMERIC(14,2) NOT NULL,
    paid_at_facility_egp NUMERIC(14,2) NOT NULL,
    refunded_egp NUMERIC(14,2) NOT NULL,
    balance_due_egp NUMERIC(14,2) NOT NULL,
    credit_due_egp NUMERIC(14,2) NOT NULL,
    lines TEXT NOT NULL,
    e_invoice_ref VARCHAR(80),
    e_invoice_recorded_by VARCHAR(255),
    e_invoice_recorded_at TIMESTAMP WITH TIME ZONE,
    supersedes_id UUID REFERENCES statements(id),
    issued_by VARCHAR(255) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_statements_number UNIQUE (statement_number),
    CONSTRAINT uk_statements_revision UNIQUE (case_id, kind, revision),
    CONSTRAINT ck_statements_kind CHECK (kind IN ('DISCHARGE')),
    CONSTRAINT ck_statements_non_negative CHECK (package_egp >= 0 AND change_orders_egp >= 0 AND platform_fee_egp >= 0 AND deposit_paid_egp >= 0
        AND fee_balance_paid_egp >= 0 AND paid_at_facility_egp >= 0 AND refunded_egp >= 0 AND balance_due_egp >= 0 AND credit_due_egp >= 0),
    CONSTRAINT ck_statements_total CHECK (total_charged_egp = medical_charged_egp + platform_fee_egp),
    CONSTRAINT ck_statements_one_side CHECK (balance_due_egp = 0 OR credit_due_egp = 0),
    CONSTRAINT ck_statements_balance CHECK (balance_due_egp - credit_due_egp
        = total_charged_egp - deposit_paid_egp - fee_balance_paid_egp - paid_at_facility_egp + refunded_egp),
    CONSTRAINT ck_statements_e_invoice CHECK ((e_invoice_ref IS NULL) = (e_invoice_recorded_at IS NULL)
        AND (e_invoice_ref IS NULL) = (e_invoice_recorded_by IS NULL))
);
CREATE INDEX ix_statements_case ON statements(case_id, kind, revision);
