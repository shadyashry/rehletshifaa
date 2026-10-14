-- Review 2026-10-14, B-01 (P0-4), owner decision 2026-10-14: one deposit, still 15% of the patient's medical total, now
-- bounded so it neither fails to commit a small case nor asks a corridor patient for a transfer they cannot make. The
-- bounds are set in US dollars and converted at the proposal's own exchange-rate date; a missing bound means none.
-- Starting values: at least USD 200, at most USD 1,500. Pre-production clean cutover: existing policies take them.
ALTER TABLE deposit_policies ADD COLUMN minimum_usd NUMERIC(12,2);
ALTER TABLE deposit_policies ADD COLUMN maximum_usd NUMERIC(12,2);
UPDATE deposit_policies SET minimum_usd = 200.00, maximum_usd = 1500.00;
ALTER TABLE deposit_policies ADD CONSTRAINT ck_deposit_policies_minimum CHECK (minimum_usd IS NULL OR minimum_usd >= 0);
ALTER TABLE deposit_policies ADD CONSTRAINT ck_deposit_policies_maximum CHECK (maximum_usd IS NULL OR maximum_usd > 0);
ALTER TABLE deposit_policies ADD CONSTRAINT ck_deposit_policies_bounds CHECK (minimum_usd IS NULL OR maximum_usd IS NULL OR minimum_usd <= maximum_usd);

-- Corridor rail: a patient who cannot send a bank transfer pays cash through an agent and enters the agent's receipt
-- number; Finance verifies it with the agent exactly as it verifies a bank reference (never on staff word alone).
-- The agent is a named string until partners become an entity (P1-12).
ALTER TABLE deposit_transfer_reports DROP CONSTRAINT ck_transfer_report_method;
ALTER TABLE deposit_transfer_reports ADD CONSTRAINT ck_transfer_report_method CHECK (method IN ('BANK_TRANSFER', 'AGENT_CASH'));
ALTER TABLE deposit_transfer_reports ADD COLUMN agent_name VARCHAR(120);
ALTER TABLE deposit_transfer_reports ADD CONSTRAINT ck_transfer_report_agent CHECK ((method = 'AGENT_CASH') = (agent_name IS NOT NULL));

-- The deposit is refundable under the owner's refund rule (fully until 10 days before the first confirmed appointment),
-- so the component no longer says otherwise.
UPDATE deposit_components SET refundability = 'REFUNDABLE' WHERE beneficiary = 'PLATFORM' AND refundability = 'NON_REFUNDABLE';
