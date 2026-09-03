-- Store the patient's selected care area as structured case data so consultant
-- matching can be enforced instead of relying on free-text intake notes.
ALTER TABLE medical_cases
    ADD COLUMN care_category VARCHAR(60) REFERENCES care_categories(slug);

-- Recover the selection from cases created by the earlier UI, which prefixed the
-- condition description with a localized care-area label.
UPDATE medical_cases
SET care_category = 'cardiology'
WHERE care_category IS NULL
  AND (lower(coalesce(condition_description, '')) LIKE '%cardiology%'
       OR lower(coalesce(condition_description, '')) LIKE '%cardiac%');

UPDATE medical_cases
SET care_category = 'rheumatology-rehabilitation'
WHERE care_category IS NULL
  AND (lower(coalesce(condition_description, '')) LIKE '%rheumatolog%'
       OR lower(coalesce(condition_description, '')) LIKE '%rehabilitation%'
       OR lower(coalesce(condition_description, '')) LIKE '%dysphagia%');

UPDATE medical_cases
SET care_category = 'orthopedics'
WHERE care_category IS NULL
  AND lower(coalesce(condition_description, '')) LIKE '%orthopedic%';

CREATE INDEX idx_cases_care_category ON medical_cases(care_category, status);
