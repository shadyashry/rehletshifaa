-- Patient profile activation + the minimum professional profile data an international
-- medical-tourism patient must supply before their profile becomes ACTIVE.
-- Additive only. Identity/passport data is deliberately NOT added here: it stays optional
-- and is requested later by the existing identity/travel flows when operationally required.

ALTER TABLE patient_profiles ADD COLUMN date_of_birth DATE;
ALTER TABLE patient_profiles ADD COLUMN nationality VARCHAR(2);
ALTER TABLE patient_profiles ADD COLUMN sex VARCHAR(16);
ALTER TABLE patient_profiles ADD COLUMN profile_status VARCHAR(24) NOT NULL DEFAULT 'PENDING';
ALTER TABLE patient_profiles ADD COLUMN activated_at TIMESTAMP WITH TIME ZONE;

-- Safe backfill: a profile already bound to an account, or one whose case has progressed past
-- acceptance, is already effectively active. Never downgrade an existing patient.
UPDATE patient_profiles SET profile_status='ACTIVE', activated_at=COALESCE(activated_at, updated_at)
 WHERE external_subject IS NOT NULL;

UPDATE patient_profiles SET profile_status='ACTIVE', activated_at=COALESCE(activated_at, updated_at)
 WHERE profile_status='PENDING' AND id IN (
   SELECT c.patient_id FROM medical_cases c
    WHERE c.patient_id IS NOT NULL
      AND c.status IN ('TRAVEL_COORDINATION','ARRIVAL_CONFIRMED','TREATMENT_IN_PROGRESS','DISCHARGED','FOLLOW_UP','CLOSED')
 );

CREATE INDEX idx_patient_profiles_status ON patient_profiles(profile_status);

-- The onboarding continuation link reuses case_access_links with a new purpose ('ONBOARDING');
-- no new token table is introduced.
ALTER TABLE case_access_links DROP CONSTRAINT IF EXISTS ck_case_access_purpose;
ALTER TABLE case_access_links ADD CONSTRAINT ck_case_access_purpose
    CHECK (purpose IN ('STATUS','INFORMATION_RESPONSE','ONBOARDING'));
