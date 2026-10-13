-- Owner decision 2026-10-14: the Consultant's total gets a 15% markup, and the patient is quoted that total.
-- A new version of the platform-default margin policy replaces the seeded 12% (the old version is kept, inactive, as history).
UPDATE commercial_policies SET active = FALSE WHERE care_category IS NULL AND active = TRUE;
INSERT INTO commercial_policies (id, name, care_category, margin_rate, active, version, created_by, valid_from)
VALUES ('c0000000-0000-0000-0000-000000000002', 'Default coordinated-care margin', NULL, 0.1500, TRUE,
        (SELECT COALESCE(MAX(version), 0) + 1 FROM commercial_policies WHERE care_category IS NULL), 'owner-decision-2026-10-14', CURRENT_DATE);
