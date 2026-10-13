-- Owner decision 2026-10-14 (W-1): the coordination deposit is a share of the patient's estimated total, not a fixed amount.
-- The default is 15%; a care area may override it. Pre-production clean cutover: the fixed amount is replaced, not kept.
ALTER TABLE deposit_policies ADD COLUMN deposit_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1500;
ALTER TABLE deposit_policies ADD CONSTRAINT ck_deposit_policies_rate CHECK (deposit_rate >= 0 AND deposit_rate <= 1);
UPDATE deposit_policies SET deposit_rate = 0.1500;
ALTER TABLE deposit_policies DROP COLUMN coordination_deposit_egp;
