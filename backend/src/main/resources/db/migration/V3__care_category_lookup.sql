-- Care-category lookup and consultant classification.
-- Adds a managed taxonomy of care categories (aligned with the public care areas)
-- and classifies practitioners by category and type so the coordinator assignment
-- flow can offer category -> consultant lookups filtered to consultants only.

CREATE TABLE care_categories (
    slug VARCHAR(60) PRIMARY KEY,
    name_en VARCHAR(120) NOT NULL,
    name_ar VARCHAR(120) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO care_categories(slug, name_en, name_ar, sort_order) VALUES
    ('cardiology', 'Cardiology', 'أمراض القلب', 1),
    ('rheumatology-rehabilitation', 'Rehabilitation & Dysphagia', 'التأهيل وعلاج البلع', 2),
    ('orthopedics', 'Orthopedics', 'جراحة العظام', 3);

ALTER TABLE practitioner_profiles ADD COLUMN care_category VARCHAR(60) REFERENCES care_categories(slug);
ALTER TABLE practitioner_profiles ADD COLUMN practitioner_type VARCHAR(20) NOT NULL DEFAULT 'CONSULTANT';
ALTER TABLE practitioner_profiles ADD CONSTRAINT ck_practitioner_type CHECK (practitioner_type IN ('CONSULTANT','STAFF'));

-- Backfill any existing practitioners into a category from their free-text specialty.
UPDATE practitioner_profiles SET care_category='cardiology'
    WHERE care_category IS NULL AND lower(coalesce(specialty,'')) LIKE '%cardio%';
UPDATE practitioner_profiles SET care_category='rheumatology-rehabilitation'
    WHERE care_category IS NULL AND (lower(coalesce(specialty,'')) LIKE '%rehab%'
        OR lower(coalesce(specialty,'')) LIKE '%rheumat%'
        OR lower(coalesce(specialty,'')) LIKE '%dysphag%');
UPDATE practitioner_profiles SET care_category='orthopedics'
    WHERE care_category IS NULL AND lower(coalesce(specialty,'')) LIKE '%ortho%';

CREATE INDEX idx_practitioner_category_type ON practitioner_profiles(care_category, practitioner_type, credentialing_status);
