-- P1-10 session 1 (review 2026-10-14 B-03, A-08, B-05; owner decisions 2026-10-15).

-- 1) D-A: the platform's coordination and guarantee fee is its own disclosed proposal line (category PLATFORM_FEE,
--    source PLATFORM); medical lines carry the provider's own price. V91 named the source check, so it is replaced by name.
ALTER TABLE proposal_items DROP CONSTRAINT ck_proposal_items_source;
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_source CHECK (source IN ('CATALOG', 'MANUAL', 'FACILITY_PACKAGE', 'PLATFORM'));
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_category CHECK (category IN ('MEDICAL', 'PLATFORM_FEE'));
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_fee_source CHECK ((category = 'PLATFORM_FEE') = (source = 'PLATFORM'));
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_fee_mandatory CHECK (category <> 'PLATFORM_FEE' OR optional = FALSE);

-- 2) B-05: final-quote validity and the FX tolerance band are commercial policy settings, versioned with the margin and
--    configured by the same COMMERCIAL_POLICY_MANAGE holders.
ALTER TABLE commercial_policies ADD COLUMN final_quote_validity_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE commercial_policies ADD COLUMN fx_tolerance_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0300;
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_quote_validity CHECK (final_quote_validity_days BETWEEN 1 AND 90);
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_fx_tolerance CHECK (fx_tolerance_rate >= 0 AND fx_tolerance_rate <= 0.5);

-- 3) A-08: a final quote whose expected EGP total exceeds the accepted estimate's maximum (allowed only with a recorded
--    scope-change reason) opens for acceptance 24 hours after release.
ALTER TABLE proposal_versions ADD COLUMN above_estimate_maximum BOOLEAN NOT NULL DEFAULT FALSE;

-- 4) B-05: acceptance of a non-EGP final quote outside the FX band pauses for Finance; Finance confirms the frozen rate
--    (CONFIRMED) or re-releases at the day's rate (the request is cleared).
ALTER TABLE proposal_versions ADD COLUMN fx_reapproval_status VARCHAR(20);
ALTER TABLE proposal_versions ADD COLUMN fx_reapproval_rate NUMERIC(18,8);
ALTER TABLE proposal_versions ADD COLUMN fx_reapproval_requested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE proposal_versions ADD COLUMN fx_reapproval_decided_by VARCHAR(255);
ALTER TABLE proposal_versions ADD COLUMN fx_reapproval_decided_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE proposal_versions ADD CONSTRAINT ck_proposal_versions_fx_reapproval CHECK (fx_reapproval_status IS NULL OR fx_reapproval_status IN ('PENDING', 'CONFIRMED'));
