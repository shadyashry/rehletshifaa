-- Review 2026-10-14, B-02 / A-07 (P0-5, session 2). Two pre-approved price sources that release a proposal without a
-- Finance work item: a Finance-approved facility package (the line carries the package and its EGP range) and a manual
-- line whose EGP price sits inside the care area's pre-approved manual band on the commercial policy. A missing band
-- means every manual line still waits for Finance, as before.
ALTER TABLE commercial_policies ADD COLUMN manual_band_egp NUMERIC(14,2);
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_manual_band CHECK (manual_band_egp IS NULL OR manual_band_egp >= 0);

ALTER TABLE clinical_review_cost_estimates ADD COLUMN facility_package_id UUID REFERENCES facility_packages(id) ON DELETE RESTRICT;
CREATE INDEX idx_cost_estimates_facility_package ON clinical_review_cost_estimates(facility_package_id);

ALTER TABLE proposal_items ADD COLUMN facility_package_id UUID REFERENCES facility_packages(id) ON DELETE RESTRICT;
CREATE INDEX idx_proposal_items_facility_package ON proposal_items(facility_package_id);

-- V11 added proposal_items.source with an unnamed inline CHECK (CATALOG, MANUAL), which cannot be dropped by name on both
-- PostgreSQL and H2. Dropping the column drops that single-column constraint on both; the values are kept through a
-- scratch column and the new constraint is named so it can be widened again later.
ALTER TABLE proposal_items ADD COLUMN source_kept VARCHAR(20);
UPDATE proposal_items SET source_kept = source;
ALTER TABLE proposal_items DROP COLUMN source;
ALTER TABLE proposal_items ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
UPDATE proposal_items SET source = source_kept WHERE source_kept IS NOT NULL;
ALTER TABLE proposal_items DROP COLUMN source_kept;
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_source CHECK (source IN ('CATALOG', 'MANUAL', 'FACILITY_PACKAGE'));
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_package CHECK ((source = 'FACILITY_PACKAGE') = (facility_package_id IS NOT NULL));
