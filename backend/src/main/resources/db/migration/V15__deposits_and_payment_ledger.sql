-- Deposit + payment sub-workflow. Deposit state lives here, never in medical_cases.status.
-- Offline record-only in this build: Finance records receipts/refunds; no card data is stored.

-- Central deposit policy (senior Finance configures; versioned), like the commercial policy.
CREATE TABLE deposit_policies (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    care_category VARCHAR(60),
    coordination_deposit_egp NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (coordination_deposit_egp >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(120),
    valid_from DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_deposit_policy_lookup ON deposit_policies(care_category, active);
INSERT INTO deposit_policies (id, name, care_category, coordination_deposit_egp, active, version, created_by, valid_from)
VALUES ('d0000000-0000-0000-0000-000000000001', 'Default coordination-initiation deposit', NULL, 3000.00, TRUE, 1, 'system-seed', CURRENT_DATE);

-- A deposit request for a case, priced in EGP and shown in the patient's frozen currency.
CREATE TABLE deposits (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    proposal_version_id UUID REFERENCES proposal_versions(id) ON DELETE SET NULL,
    currency VARCHAR(3) NOT NULL,
    fx_rate NUMERIC(18,8),
    fx_rate_date DATE,
    fx_source VARCHAR(20),
    policy_id UUID,
    policy_version INTEGER,
    total_egp NUMERIC(14,2) NOT NULL CHECK (total_egp >= 0),
    total_display NUMERIC(14,2),
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','PARTIALLY_PAID','PAID','CANCELLED','REFUNDED')),
    created_by VARCHAR(120),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_deposits_case ON deposits(case_id);

-- Beneficiary-level breakdown (platform coordination now; provider/supplier reservations later).
CREATE TABLE deposit_components (
    id UUID PRIMARY KEY,
    deposit_id UUID NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
    beneficiary VARCHAR(20) NOT NULL CHECK (beneficiary IN ('PLATFORM','PROVIDER','SUPPLIER')),
    purpose VARCHAR(300) NOT NULL,
    amount_egp NUMERIC(14,2) NOT NULL CHECK (amount_egp >= 0),
    refundability VARCHAR(30) NOT NULL CHECK (refundability IN ('REFUNDABLE','NON_REFUNDABLE','PARTIALLY_REFUNDABLE')),
    cancellation_terms TEXT,
    credited_to_final BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Append-only payment/refund ledger. One row per event; idempotency_key is unique.
CREATE TABLE payment_events (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    deposit_id UUID REFERENCES deposits(id) ON DELETE SET NULL,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('DEPOSIT_REQUESTED','PAYMENT_RECORDED','PAYMENT_FAILED','REFUND_RECORDED','REVERSAL')),
    amount_egp NUMERIC(14,2),
    amount_display NUMERIC(14,2),
    currency VARCHAR(3),
    method VARCHAR(40),
    provider VARCHAR(40) NOT NULL DEFAULT 'OFFLINE',
    provider_reference VARCHAR(200),
    status VARCHAR(20) NOT NULL,
    actor_subject VARCHAR(120),
    reason TEXT,
    idempotency_key VARCHAR(200) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_event_idempotency UNIQUE (idempotency_key)
);
CREATE INDEX idx_payment_events_case ON payment_events(case_id);
