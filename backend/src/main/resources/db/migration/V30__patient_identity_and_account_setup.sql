-- Patient identity, case submission contacts and Keycloak-owned account setup.
--
-- Principles (see docs/architecture.md "Patient identity"):
--   * patient_profiles.id is the ONLY canonical patient identity. Email, WhatsApp, names and the
--     Keycloak subject are attributes that can change, be shared or be mistyped.
--   * The person who SUBMITTED a case (and their contact channels) is recorded separately from the
--     patient the case is about: a parent, spouse or guardian commonly submits for someone else and
--     commonly shares one WhatsApp number with them. No uniqueness is imposed on email or mobile.
--   * Profile state and account state are separate: ProfileStatus (PENDING/ACTIVE) says whether the
--     patient's information is complete; AccountStatus (NOT_PROVISIONED/SETUP_PENDING/ACTIVE) says
--     whether a usable sign-in exists. Keycloak owns the credential; this schema never stores one.
--
-- MIGRATION OF LEGACY NAMES: existing rows only carry full_name. International names cannot be split
-- safely, so NOTHING is parsed here. full_name is preserved as the legacy display name
-- (name_source = 'LEGACY_FULL_NAME'); given_name/family_name stay NULL until the patient confirms
-- them during their next profile completion, after which name_source becomes 'STRUCTURED'.

ALTER TABLE patient_profiles ADD COLUMN given_name VARCHAR(80);
ALTER TABLE patient_profiles ADD COLUMN family_name VARCHAR(80);
ALTER TABLE patient_profiles ADD COLUMN preferred_name VARCHAR(80);
ALTER TABLE patient_profiles ADD COLUMN name_source VARCHAR(20) NOT NULL DEFAULT 'LEGACY_FULL_NAME';
ALTER TABLE patient_profiles ADD CONSTRAINT ck_patient_name_source CHECK (name_source IN ('LEGACY_FULL_NAME','STRUCTURED'));

-- Who the on-file WhatsApp/mobile belongs to. NULL = not yet clarified (legacy rows).
ALTER TABLE patient_profiles ADD COLUMN mobile_owner VARCHAR(20);
ALTER TABLE patient_profiles ADD CONSTRAINT ck_patient_mobile_owner CHECK (mobile_owner IS NULL OR mobile_owner IN ('PATIENT','REPRESENTATIVE'));
-- A patient whose case was submitted by a representative has no personal mobile on file yet.
ALTER TABLE patient_profiles ALTER COLUMN whatsapp_number DROP NOT NULL;

-- Account (sign-in) lifecycle, distinct from profile completeness.
ALTER TABLE patient_profiles ADD COLUMN account_status VARCHAR(24) NOT NULL DEFAULT 'NOT_PROVISIONED';
ALTER TABLE patient_profiles ADD CONSTRAINT ck_patient_account_status CHECK (account_status IN ('NOT_PROVISIONED','SETUP_PENDING','ACTIVE'));
ALTER TABLE patient_profiles ADD COLUMN account_setup_requested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE patient_profiles ADD COLUMN account_activated_at TIMESTAMP WITH TIME ZONE;
-- Profile information complete (all required fields supplied) — independent of account state.
ALTER TABLE patient_profiles ADD COLUMN profile_completed_at TIMESTAMP WITH TIME ZONE;
-- Set only by an authenticated, explicit "this is me" resolution; never by matching email or phone.
ALTER TABLE patient_profiles ADD COLUMN merged_into_patient_id UUID;
ALTER TABLE patient_profiles ADD CONSTRAINT fk_patient_merged_into FOREIGN KEY (merged_into_patient_id) REFERENCES patient_profiles(id) ON DELETE SET NULL;

-- Backfill: a profile already bound to an identity account has a usable sign-in.
UPDATE patient_profiles SET account_status='ACTIVE', account_activated_at=COALESCE(activated_at, updated_at)
 WHERE external_subject IS NOT NULL;
UPDATE patient_profiles SET profile_completed_at=COALESCE(activated_at, updated_at)
 WHERE profile_status='ACTIVE';
-- Every legacy number was typed by the submitter into "your WhatsApp"; treat it as the patient's own
-- for cases that pre-date the representative model (the only option that existed).
UPDATE patient_profiles SET mobile_owner='PATIENT' WHERE whatsapp_number IS NOT NULL;

CREATE INDEX idx_patient_profiles_account_status ON patient_profiles(account_status);
CREATE INDEX idx_patient_profiles_email ON patient_profiles(email);

-- Who submitted the case and how to reach them. One row per case. Absence of a row means the case
-- pre-dates this table and was submitted by the patient (the only option that existed).
CREATE TABLE case_submission_contacts (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
    contact_role VARCHAR(20) NOT NULL CHECK (contact_role IN ('PATIENT','REPRESENTATIVE')),
    contact_name VARCHAR(160),
    relationship_to_patient VARCHAR(40),
    email VARCHAR(254),
    whatsapp_number VARCHAR(32),
    preferred_language VARCHAR(8),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_case_submission_contact UNIQUE (case_id)
);
CREATE INDEX idx_submission_contact_patient ON case_submission_contacts(patient_id);

-- An email that already has a RehletShifaa account was used for a new patient/case. The public UI
-- reveals nothing; the address receives one neutral, time-limited continuation link. Whoever signs in
-- with that account then resolves — explicitly and authenticated — whether the case is theirs
-- (SAME_PATIENT) or for someone they act for (REPRESENTATIVE). No automatic merge ever happens.
CREATE TABLE patient_account_link_requests (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    origin VARCHAR(20) NOT NULL CHECK (origin IN ('INTAKE','PROFILE')),
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    resolved_subject VARCHAR(255),
    resolution VARCHAR(20),
    relationship VARCHAR(40),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_account_link_resolution CHECK (resolution IS NULL OR resolution IN ('SAME_PATIENT','REPRESENTATIVE','DECLINED')),
    CONSTRAINT uq_account_link_patient_email UNIQUE (patient_id, email)
);
CREATE INDEX idx_account_link_token ON patient_account_link_requests(token_hash);
CREATE INDEX idx_account_link_email ON patient_account_link_requests(email);
