-- Evidence that the patient confirmed the acknowledgement before continuing, held against the
-- exact proposal version they were shown. The row already carries the version reference, the
-- patient subject and reauthenticated_at (the secure-link OTP context), so this only adds the
-- three facts that were previously client-side only.
--
-- The version string identifies which acknowledgement wording was in force, following the
-- policy_version convention already used by consent_records. It is stamped by the server, never
-- taken from the request. NULL means a decision recorded before this gate existed, or one that
-- never required acknowledgement (a decline or a request for changes).
ALTER TABLE proposal_decisions ADD COLUMN acknowledged BOOLEAN;
ALTER TABLE proposal_decisions ADD COLUMN acknowledged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE proposal_decisions ADD COLUMN acknowledgement_version VARCHAR(40);
