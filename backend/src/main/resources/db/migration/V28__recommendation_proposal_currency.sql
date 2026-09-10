-- The currency the consultant prepared the recommendation in, and which the patient
-- proposal must therefore be issued in. Catalogue and cost-estimate base prices stay in
-- EGP (see V11): this column records the presentation currency the consultant chose, not a
-- second source of truth for amounts. NULL means "not stated", which keeps every existing
-- recommendation on the base currency exactly as before.
ALTER TABLE clinical_review_versions ADD COLUMN proposal_currency VARCHAR(3);
