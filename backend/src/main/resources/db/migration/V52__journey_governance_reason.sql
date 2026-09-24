-- J-1 (pre-8C): the reason a person gives for a governed Journey action (draft change note, check, test,
-- send for approval, return to draft, edit a copy, publish, retire) was validated and then discarded; the
-- audit row kept only technical detail (revision=/graph=) in its reason column. The stated reason is now
-- stored on the same audit event, next to the technical detail rather than mixed into it.
-- Nullable: events written before this migration, and events that never ask for a reason, have none. Nothing
-- is backfilled; historical reasons are not reconstructed.
ALTER TABLE audit_events ADD COLUMN governance_reason VARCHAR(500);
