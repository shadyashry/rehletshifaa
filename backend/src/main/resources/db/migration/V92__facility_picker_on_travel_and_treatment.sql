-- Review 2026-10-14, B-02 (P0-5, session 3). The travel plan's destination and the treatment episode's facility are
-- facility records, never free text: the picker replaces the field. Pre-production clean cutover: the text columns go,
-- their content is not migrated (nothing to keep). treatment_episodes.facility_id stays nullable in the schema because
-- rows recorded before this migration have no facility to point at; the service refuses a new episode without one.
ALTER TABLE travel_plans ADD COLUMN facility_id UUID REFERENCES facilities(id) ON DELETE RESTRICT;
ALTER TABLE travel_plans DROP COLUMN facility;
CREATE INDEX idx_travel_plans_facility ON travel_plans(facility_id);

ALTER TABLE treatment_episodes ADD COLUMN facility_id UUID REFERENCES facilities(id) ON DELETE RESTRICT;
ALTER TABLE treatment_episodes DROP COLUMN facility;
CREATE INDEX idx_treatment_episodes_facility ON treatment_episodes(facility_id);
