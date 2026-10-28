-- B-3-1b: treatment starts on the admission (the hospital's admission number on a cleared case), so the Consultant's
-- treatment-episode record and its endpoint are retired. The treatment, discharge and follow-up facts live in the evidence
-- ledger and their own tables (P1-15..P1-18). Pre-production clean cutover: nothing to keep.
ALTER TABLE follow_up_plans DROP COLUMN treatment_episode_id;
DROP TABLE treatment_episodes;
