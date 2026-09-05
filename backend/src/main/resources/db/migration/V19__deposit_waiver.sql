-- Additive deposit waiver. The append-only payment_events ledger is preserved untouched: a waiver
-- is recorded as narrowly-scoped columns on the deposit plus an audit event, never by mutating or
-- deleting ledger rows. A waiver requires an authorized Finance/System-Admin action with recent
-- authentication and a mandatory reason (enforced in PaymentService); there is no silent coordinator
-- waiver. Deposit readiness = no deposit required, or PAID, or WAIVED here.
ALTER TABLE deposits ADD COLUMN waived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE deposits ADD COLUMN waived_by VARCHAR(120);
ALTER TABLE deposits ADD COLUMN waiver_reason TEXT;
