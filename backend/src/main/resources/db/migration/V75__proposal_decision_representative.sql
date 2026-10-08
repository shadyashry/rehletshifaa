-- A decision recorded for the patient after a call says which authorised representative confirmed it
-- (docs/ux-redesign/STATUS.md pass 3). "Representative" means an unrevoked, in-force patient_representatives link at
-- the time of recording, never the submitting contact's self-description. The subject is stored rather than the link
-- id, so the provenance survives a patient merge, which drops duplicate links.

ALTER TABLE proposal_decisions ADD COLUMN confirmed_representative_subject VARCHAR(255);
ALTER TABLE proposal_decisions ADD CONSTRAINT ck_proposal_decision_representative CHECK (
    (confirmed_by = 'REPRESENTATIVE' AND confirmed_representative_subject IS NOT NULL)
    OR ((confirmed_by IS NULL OR confirmed_by <> 'REPRESENTATIVE') AND confirmed_representative_subject IS NULL));
