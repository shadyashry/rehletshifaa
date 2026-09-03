-- Consultant (doctor) estimated cost per service, captured at clinical review time.
-- These estimates are surfaced to the coordinator to pre-fill the patient proposal,
-- and displayed alongside the clinical recommendation text.
CREATE TABLE clinical_review_cost_estimates (
    id UUID PRIMARY KEY,
    clinical_review_id UUID NOT NULL REFERENCES clinical_review_versions(id) ON DELETE CASCADE,
    service_description VARCHAR(500) NOT NULL,
    estimated_cost NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_cost_estimates_review ON clinical_review_cost_estimates(clinical_review_id);
