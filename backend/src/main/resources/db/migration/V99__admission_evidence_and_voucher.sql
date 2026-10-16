-- P1-15 session 1 (post-deposit design §5 stages 1-3, §6 rules 2 and 3; architecture §4.1, §4.2, §5.1; owner decisions
-- D-B, D-C, D-D 2026-10-15). Pre-production clean cutover: new tables state the final design, no backfill.

-- 1) D-D: one new macro state between arrival and treatment. "Arrived" and "cleared to be admitted" are different moments for
--    the patient, for money and for liability; everything else after the deposit is an evidence row, not a state.
ALTER TABLE medical_cases DROP CONSTRAINT ck_case_status;
ALTER TABLE medical_cases ADD CONSTRAINT ck_case_status CHECK (status IN (
    'DRAFT','RECEIVED','INTAKE_REVIEW','INFORMATION_REQUIRED',
    'READY_FOR_CONSULTANT','CONSULTANT_ASSIGNMENT_PENDING','CONSULTANT_REVIEW',
    'CLINICAL_RECOMMENDATION_READY','PROPOSAL_PREPARATION','PROPOSAL_INTERNAL_APPROVAL',
    'PATIENT_DECISION','REVISION_REQUESTED','ACCEPTED','DECLINED','EXPIRED',
    'CLINICALLY_NOT_SUITABLE','TRAVEL_COORDINATION','ARRIVAL_CONFIRMED','ADMISSION_READY',
    'TREATMENT_IN_PROGRESS','DISCHARGED','FOLLOW_UP','CLOSED','CANCELLED'
));

-- 2) The evidence ledger: append-only facts that stage gates read (architecture §4.1). A row is never edited; the only change
--    it ever takes is its countersignature, set once. A correction is a new row that names the one it supersedes. Amounts are
--    plain (audit may carry them); the payload (method, paid-on currency, reasons) may be sensitive and is encrypted.
--    The kinds are P1-15's; later phases widen the list (P1-16 milestones, P1-17 pack and invoices, P1-18 outcomes).
CREATE TABLE case_evidence (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    stage VARCHAR(40) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    document_id UUID REFERENCES medical_documents(id) ON DELETE RESTRICT,
    reference VARCHAR(160),
    amount_egp NUMERIC(14,2),
    effective_at TIMESTAMP WITH TIME ZONE,
    payload TEXT,
    recorded_by VARCHAR(255) NOT NULL,
    recorded_role VARCHAR(40) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    countersigned_by VARCHAR(255),
    countersigned_role VARCHAR(40),
    countersigned_at TIMESTAMP WITH TIME ZONE,
    supersedes_id UUID REFERENCES case_evidence(id),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_case_evidence_kind CHECK (kind IN ('FACILITY_ADMISSION_LETTER', 'PRICE_VARIANCE_CHECK', 'ARRIVAL_ATTESTED',
        'PATIENT_ARRIVED', 'BALANCE_EVIDENCED', 'FEE_BALANCE_RECEIVED', 'ADMISSION_NUMBER', 'POINT_OF_NO_RETURN',
        'EMERGENCY_ADMISSION_OVERRIDE')),
    CONSTRAINT ck_case_evidence_role CHECK (recorded_role IN ('CONSULTANT', 'OPERATIONS', 'FINANCE', 'COORDINATOR', 'PATIENT', 'SYSTEM')),
    CONSTRAINT ck_case_evidence_amount CHECK (amount_egp IS NULL OR amount_egp >= 0),
    CONSTRAINT ck_case_evidence_countersign CHECK ((countersigned_by IS NULL AND countersigned_role IS NULL AND countersigned_at IS NULL)
        OR (countersigned_by IS NOT NULL AND countersigned_role IS NOT NULL AND countersigned_at IS NOT NULL)),
    CONSTRAINT ck_case_evidence_not_self CHECK (countersigned_by IS NULL OR countersigned_by <> recorded_by)
);
CREATE INDEX ix_case_evidence_case_kind ON case_evidence(case_id, kind);
CREATE INDEX ix_case_evidence_case_time ON case_evidence(case_id, recorded_at);

-- 3) The facility admission (architecture §4.2): one per case, reserved by Operations with the hospital in treatment
--    coordination. A new reservation replaces the facility and date while the patient is not admitted yet. The letter, the
--    price check, the balance, the point of no return and the admission number are ledger rows, not columns here.
CREATE TABLE facility_admissions (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    facility_id UUID NOT NULL REFERENCES facilities(id),
    planned_admission_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_facility_admissions_case UNIQUE (case_id),
    CONSTRAINT ck_facility_admissions_status CHECK (status IN ('RESERVED', 'CONFIRMED', 'ADMITTED', 'CANCELLED'))
);
CREATE INDEX ix_facility_admissions_facility ON facility_admissions(facility_id, planned_admission_at);

-- 4) D-B (rule 2): the admission voucher the platform issues to the hospital, with the money split frozen at issue. A voucher
--    is immutable; a new accepted quote supersedes it with the next revision. The identities are schema-enforced:
--      the deposit covers the platform fee first, the rest of it is the credit the platform settles to the hospital,
--      the patient pays the hospital the package less that credit, and any fee the deposit did not cover is owed to the
--      platform (fee balance), never to the hospital.
CREATE TABLE admission_vouchers (
    id UUID PRIMARY KEY,
    admission_id UUID NOT NULL REFERENCES facility_admissions(id),
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    voucher_number VARCHAR(40) NOT NULL,
    revision INTEGER NOT NULL,
    proposal_version_id UUID NOT NULL REFERENCES proposal_versions(id),
    status VARCHAR(20) NOT NULL,
    package_total_egp NUMERIC(14,2) NOT NULL,
    platform_fee_egp NUMERIC(14,2) NOT NULL,
    deposit_paid_egp NUMERIC(14,2) NOT NULL,
    deposit_credit_egp NUMERIC(14,2) NOT NULL,
    fee_balance_egp NUMERIC(14,2) NOT NULL,
    patient_pays_at_facility_egp NUMERIC(14,2) NOT NULL,
    display_currency VARCHAR(3) NOT NULL,
    fx_rate NUMERIC(18,8),
    fx_rate_date DATE,
    issued_by VARCHAR(255) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    superseded_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_admission_vouchers_number UNIQUE (voucher_number),
    CONSTRAINT uk_admission_vouchers_revision UNIQUE (case_id, revision),
    CONSTRAINT ck_admission_vouchers_status CHECK (status IN ('ISSUED', 'SUPERSEDED')),
    CONSTRAINT ck_admission_vouchers_superseded CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL)),
    CONSTRAINT ck_admission_vouchers_non_negative CHECK (package_total_egp >= 0 AND platform_fee_egp >= 0 AND deposit_paid_egp >= 0
        AND deposit_credit_egp >= 0 AND fee_balance_egp >= 0 AND patient_pays_at_facility_egp >= 0),
    CONSTRAINT ck_admission_vouchers_facility_split CHECK (patient_pays_at_facility_egp = package_total_egp - deposit_credit_egp),
    CONSTRAINT ck_admission_vouchers_deposit_split CHECK (deposit_credit_egp + platform_fee_egp - fee_balance_egp = deposit_paid_egp)
);
CREATE INDEX ix_admission_vouchers_case ON admission_vouchers(case_id, status);
