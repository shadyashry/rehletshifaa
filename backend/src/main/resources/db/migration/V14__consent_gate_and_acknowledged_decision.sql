-- Procedure-specific consent linkage + evidence, for the treatment-commencement gate.
-- Financial acceptance is never medical consent; the treating doctor captures a
-- PROCEDURE_SPECIFIC consent (or an audited emergency override) before treatment.
ALTER TABLE consent_records ADD COLUMN related_proposal_version_id UUID;
ALTER TABLE consent_records ADD COLUMN evidence_document_id UUID;
ALTER TABLE consent_records ADD COLUMN evidence_reference VARCHAR(300);

-- Preliminary-estimate decisions are acknowledgements, distinct from a final-quote
-- ACCEPTED. Existing ACCEPTED rows remain valid (legacy acknowledgements).
ALTER TABLE proposal_decisions DROP CONSTRAINT ck_proposal_decision;
ALTER TABLE proposal_decisions ADD CONSTRAINT ck_proposal_decision CHECK (decision IN ('ACCEPTED','ACKNOWLEDGED','DECLINED','REVISION_REQUESTED'));
