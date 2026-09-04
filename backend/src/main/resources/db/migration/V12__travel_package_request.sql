-- Whether the patient asked for a full travel package (flights, visa, hospital, stay).
-- Set by the patient on submission and adjustable by the coordinator at intake.
-- Operations is engaged before a proposal is released only when this is true.
ALTER TABLE medical_cases ADD COLUMN travel_package_requested BOOLEAN NOT NULL DEFAULT FALSE;
