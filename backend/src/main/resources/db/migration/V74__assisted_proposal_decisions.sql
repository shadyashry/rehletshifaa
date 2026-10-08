-- Coordinator-mediated proposal decisions (docs/ux-redesign/plans/arabic-proposal-decision.md, owner GATE P2-1).
-- While the deposit, refund and cancellation terms have no approved Arabic wording, an Arabic-speaking patient asks
-- their coordinator to go through them in Arabic; the coordinator then records the patient's decision. The row says
-- so: a recorded decision is never presented as one the patient made on the page.

ALTER TABLE proposal_decisions ADD COLUMN decision_source VARCHAR(30) NOT NULL DEFAULT 'PATIENT_SELF';
ALTER TABLE proposal_decisions ADD COLUMN recorded_by VARCHAR(255);
ALTER TABLE proposal_decisions ADD COLUMN decision_channel VARCHAR(20);
ALTER TABLE proposal_decisions ADD COLUMN confirmed_by VARCHAR(20);
ALTER TABLE proposal_decisions ADD COLUMN conversation_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE proposal_decisions ADD COLUMN terms_language VARCHAR(8);
ALTER TABLE proposal_decisions ADD CONSTRAINT ck_proposal_decision_source CHECK (decision_source IN ('PATIENT_SELF','RECORDED_ON_BEHALF'));
ALTER TABLE proposal_decisions ADD CONSTRAINT ck_proposal_decision_channel CHECK (decision_channel IS NULL OR decision_channel IN ('PHONE','WHATSAPP_CALL','VIDEO','IN_PERSON'));
ALTER TABLE proposal_decisions ADD CONSTRAINT ck_proposal_decision_confirmed_by CHECK (confirmed_by IS NULL OR confirmed_by IN ('PATIENT','REPRESENTATIVE'));
-- A recorded decision always carries who recorded it, how and when the conversation took place.
ALTER TABLE proposal_decisions ADD CONSTRAINT ck_proposal_decision_recorded CHECK (decision_source = 'PATIENT_SELF'
    OR (recorded_by IS NOT NULL AND decision_channel IS NOT NULL AND confirmed_by IS NOT NULL AND conversation_at IS NOT NULL AND terms_language IS NOT NULL));

-- The patient's request for that conversation: one per proposal version, from the portal or the secure link.
CREATE TABLE proposal_assistance_requests (
    id UUID PRIMARY KEY,
    proposal_version_id UUID NOT NULL REFERENCES proposal_versions(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    requested_by VARCHAR(255) NOT NULL,
    request_channel VARCHAR(20) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_proposal_assistance_version UNIQUE (proposal_version_id),
    CONSTRAINT ck_proposal_assistance_channel CHECK (request_channel IN ('PORTAL','SECURE_LINK'))
);
CREATE INDEX idx_proposal_assistance_case ON proposal_assistance_requests(case_id);
