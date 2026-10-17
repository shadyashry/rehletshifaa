-- Public editorial grants live in RolePolicy: System Administrator and Consultant Operations Manager.
-- Preserve a published URL even after it is unpublished. Seeded V105 profiles have already been published.
ALTER TABLE consultant_directory_profiles ADD COLUMN ever_published BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE consultant_directory_profiles SET ever_published = TRUE WHERE published = TRUE;
