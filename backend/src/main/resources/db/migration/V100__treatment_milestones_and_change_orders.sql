-- P1-16 session 1 (post-deposit design §5 stage 4, decision D-E; architecture §4.1, §4.3, §5.2, §5.3). Pre-production clean
-- cutover: new tables state the final design, no backfill. The plan's "V97" name was stale; V100 is the next free number.

-- 1) The ledger's treatment kinds. A milestone is one fact (the Consultant's, or Operations' on the Consultant's behalf and then
--    countersigned by the Consultant); the hospital's interim bill is Operations' and Finance countersigns it; CHANGE_ORDER is
--    the decision on a change order (the patient's above the band, Finance's within it, the Consultant's in an emergency).
ALTER TABLE case_evidence DROP CONSTRAINT ck_case_evidence_kind;
ALTER TABLE case_evidence ADD CONSTRAINT ck_case_evidence_kind CHECK (kind IN ('FACILITY_ADMISSION_LETTER', 'PRICE_VARIANCE_CHECK',
    'ARRIVAL_ATTESTED', 'PATIENT_ARRIVED', 'BALANCE_EVIDENCED', 'FEE_BALANCE_RECEIVED', 'ADMISSION_NUMBER', 'POINT_OF_NO_RETURN',
    'EMERGENCY_ADMISSION_OVERRIDE', 'MILESTONE_ADMITTED', 'MILESTONE_PROCEDURE_STARTED', 'MILESTONE_PROCEDURE_COMPLETED', 'MILESTONE_ICU',
    'MILESTONE_WARD', 'MILESTONE_COMPLICATION', 'MILESTONE_STABLE', 'MILESTONE_DISCHARGE_PLANNED', 'INTERIM_BILL', 'CHANGE_ORDER'));

-- 2) D-E: the change-order tolerance band on the commercial policy. A change order the case's running total of change orders
--    keeps within the lower of (rate x the facility package) and the EGP cap is Finance's alone; above it the patient decides.
ALTER TABLE commercial_policies ADD COLUMN change_order_band_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1000;
ALTER TABLE commercial_policies ADD COLUMN change_order_band_egp NUMERIC(14,2) NOT NULL DEFAULT 15000.00;
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_co_band_rate CHECK (change_order_band_rate >= 0 AND change_order_band_rate <= 0.5);
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_co_band_egp CHECK (change_order_band_egp >= 0);

-- 3) Change orders (architecture §4.3): any procedure, implant, extra night or other care outside the accepted quote. The
--    Consultant proposes it with the clinical reason (encrypted), Finance prices it, the band decides who accepts it. An
--    emergency order is done first and priced and reviewed after. Amounts in EGP; the patient's currency at the voucher's frozen
--    rate. Every decision column is set together (status says which decided state it is).
CREATE TABLE change_orders (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    admission_id UUID REFERENCES facility_admissions(id),
    order_number VARCHAR(40) NOT NULL,
    seq_no INTEGER NOT NULL,
    emergency BOOLEAN NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    total_egp NUMERIC(14,2),
    band_limit_egp NUMERIC(14,2),
    within_band BOOLEAN,
    display_currency VARCHAR(3),
    fx_rate NUMERIC(18,8),
    total_display NUMERIC(14,2),
    proposed_by VARCHAR(255) NOT NULL,
    proposed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    priced_by VARCHAR(255),
    priced_at TIMESTAMP WITH TIME ZONE,
    decided_by VARCHAR(255),
    decided_role VARCHAR(40),
    decision_channel VARCHAR(20),
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_note TEXT,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_change_orders_number UNIQUE (order_number),
    CONSTRAINT uk_change_orders_sequence UNIQUE (case_id, seq_no),
    CONSTRAINT ck_change_orders_status CHECK (status IN ('PROPOSED', 'AWAITING_PATIENT', 'ACCEPTED', 'REJECTED', 'EMERGENCY', 'WITHDRAWN')),
    CONSTRAINT ck_change_orders_channel CHECK (decision_channel IS NULL OR decision_channel IN ('FINANCE', 'MY_CARE', 'SECURE_LINK', 'CONSULTANT')),
    CONSTRAINT ck_change_orders_amounts CHECK ((total_egp IS NULL OR total_egp >= 0) AND (band_limit_egp IS NULL OR band_limit_egp >= 0)),
    CONSTRAINT ck_change_orders_priced CHECK ((priced_at IS NULL) = (total_egp IS NULL) AND (priced_at IS NULL) = (priced_by IS NULL)
        AND (priced_at IS NULL) = (within_band IS NULL)),
    CONSTRAINT ck_change_orders_decided CHECK ((decided_at IS NULL) = (decided_by IS NULL) AND (decided_at IS NULL) = (decision_channel IS NULL)),
    -- Only the band decides who accepts: a priced, non-emergency order above the band is accepted by the patient, never by Finance.
    CONSTRAINT ck_change_orders_band_rule CHECK (status <> 'ACCEPTED' OR (within_band AND decision_channel = 'FINANCE')
        OR (NOT within_band AND decision_channel IN ('MY_CARE', 'SECURE_LINK'))),
    CONSTRAINT ck_change_orders_awaiting CHECK (status <> 'AWAITING_PATIENT' OR (within_band IS NOT NULL AND NOT within_band)),
    CONSTRAINT ck_change_orders_emergency CHECK ((status = 'EMERGENCY') = emergency)
);
CREATE INDEX ix_change_orders_case ON change_orders(case_id, status);

CREATE TABLE change_order_lines (
    id UUID PRIMARY KEY,
    change_order_id UUID NOT NULL REFERENCES change_orders(id),
    line_no INTEGER NOT NULL,
    kind VARCHAR(20) NOT NULL,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    unit_egp NUMERIC(14,2),
    line_egp NUMERIC(14,2),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_change_order_lines_no UNIQUE (change_order_id, line_no),
    CONSTRAINT ck_change_order_lines_kind CHECK (kind IN ('PROCEDURE', 'IMPLANT', 'EXTRA_NIGHT', 'MEDICATION', 'OTHER')),
    CONSTRAINT ck_change_order_lines_quantity CHECK (quantity > 0),
    CONSTRAINT ck_change_order_lines_priced CHECK ((unit_egp IS NULL) = (line_egp IS NULL) AND (unit_egp IS NULL OR (unit_egp >= 0 AND line_egp >= 0)))
);
