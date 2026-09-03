-- Free-text notes the coordinator can add to a patient proposal (shown to the patient
-- on the secure proposal page alongside the clinical recommendation and services).
ALTER TABLE proposal_versions ADD COLUMN coordinator_notes TEXT;
