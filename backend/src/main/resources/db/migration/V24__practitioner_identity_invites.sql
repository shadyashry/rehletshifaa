ALTER TABLE practitioner_profiles ADD COLUMN email_encrypted TEXT;
ALTER TABLE practitioner_profiles ADD COLUMN email_hash VARCHAR(64);
ALTER TABLE practitioner_profiles ADD COLUMN account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE practitioner_profiles ADD COLUMN invited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE practitioner_profiles ADD COLUMN disabled_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE practitioner_profiles ADD CONSTRAINT ck_practitioner_account_status CHECK (account_status IN ('INVITED','ACTIVE','DISABLED'));
CREATE UNIQUE INDEX uq_practitioner_email_hash ON practitioner_profiles(email_hash);

