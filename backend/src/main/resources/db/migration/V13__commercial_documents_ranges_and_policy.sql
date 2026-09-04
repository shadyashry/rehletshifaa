-- Commercial workflow foundation: document type (preliminary vs final), estimate
-- price ranges, internal margin / commercial-policy snapshot, and inclusive
-- patient-facing pricing. All prices remain EGP-based; margin is an internal
-- amount baked into the patient package and never itemized to the patient.

-- 1) Two immutable commercial document types. Existing versions are preliminary.
ALTER TABLE proposal_versions ADD COLUMN document_type VARCHAR(30) NOT NULL DEFAULT 'PRELIMINARY_ESTIMATE';
ALTER TABLE proposal_versions ADD CONSTRAINT ck_proposal_document_type CHECK (document_type IN ('PRELIMINARY_ESTIMATE','FINAL_TREATMENT_QUOTE'));
ALTER TABLE proposal_versions ADD COLUMN assumptions TEXT;
ALTER TABLE proposal_versions ADD COLUMN scope_change_reason TEXT;

-- 2) Internal commercial snapshot (never exposed to the patient).
ALTER TABLE proposal_versions ADD COLUMN provider_net_egp NUMERIC(14,2);
ALTER TABLE proposal_versions ADD COLUMN commercial_policy_id UUID;
ALTER TABLE proposal_versions ADD COLUMN commercial_policy_version INTEGER;
ALTER TABLE proposal_versions ADD COLUMN margin_rate NUMERIC(6,4);
ALTER TABLE proposal_versions ADD COLUMN margin_amount_egp NUMERIC(14,2);
ALTER TABLE proposal_versions ADD COLUMN tax_egp NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 3) Patient-facing inclusive package range (EGP base; converted+frozen at release).
ALTER TABLE proposal_versions ADD COLUMN patient_total_min_egp NUMERIC(14,2);
ALTER TABLE proposal_versions ADD COLUMN patient_total_expected_egp NUMERIC(14,2);
ALTER TABLE proposal_versions ADD COLUMN patient_total_max_egp NUMERIC(14,2);

-- 4) Per-item ranges + provider base. unit_price_egp stays the patient-facing
--    (inclusive) expected EGP; provider_price_egp is the internal provider base.
ALTER TABLE proposal_items ADD COLUMN provider_price_egp NUMERIC(12,2);
ALTER TABLE proposal_items ADD COLUMN unit_price_min_egp NUMERIC(12,2);
ALTER TABLE proposal_items ADD COLUMN unit_price_max_egp NUMERIC(12,2);
ALTER TABLE proposal_items ADD COLUMN item_assumptions TEXT;
ALTER TABLE proposal_items ADD COLUMN conditional BOOLEAN NOT NULL DEFAULT FALSE;
-- Backfill existing exact prices as a degenerate range (min = expected = max) and
-- provider = current EGP base (legacy versions carried no margin).
UPDATE proposal_items SET provider_price_egp = unit_price_egp WHERE provider_price_egp IS NULL;
UPDATE proposal_items SET unit_price_min_egp = unit_price_egp WHERE unit_price_min_egp IS NULL;
UPDATE proposal_items SET unit_price_max_egp = unit_price_egp WHERE unit_price_max_egp IS NULL;

-- 5) Consultant estimate ranges. price_egp stays the expected value.
ALTER TABLE clinical_review_cost_estimates ADD COLUMN price_egp_min NUMERIC(12,2);
ALTER TABLE clinical_review_cost_estimates ADD COLUMN price_egp_max NUMERIC(12,2);
UPDATE clinical_review_cost_estimates SET price_egp_min = price_egp WHERE price_egp_min IS NULL AND price_egp IS NOT NULL;
UPDATE clinical_review_cost_estimates SET price_egp_max = price_egp WHERE price_egp_max IS NULL AND price_egp IS NOT NULL;

-- 6) Central commercial policy (senior Finance configures; not a per-case slider).
--    A NULL care_category is the platform default; a set care_category overrides it.
CREATE TABLE commercial_policies (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    care_category VARCHAR(60),
    margin_rate NUMERIC(6,4) NOT NULL CHECK (margin_rate >= 0 AND margin_rate <= 1),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(120),
    valid_from DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_commercial_policy_lookup ON commercial_policies(care_category, active);
-- Seed a default centrally-approved policy at the mid of the intended 10-15% band.
INSERT INTO commercial_policies (id, name, care_category, margin_rate, active, version, created_by, valid_from)
VALUES ('c0000000-0000-0000-0000-000000000001', 'Default coordinated-care margin', NULL, 0.1200, TRUE, 1, 'system-seed', CURRENT_DATE);
