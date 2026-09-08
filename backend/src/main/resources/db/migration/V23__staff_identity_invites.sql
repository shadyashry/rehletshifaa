ALTER TABLE staff_members ADD COLUMN email_encrypted TEXT;
ALTER TABLE staff_members ADD COLUMN email_hash VARCHAR(64);
ALTER TABLE staff_members ADD COLUMN invitation_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE staff_members ADD COLUMN invited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE staff_members ADD COLUMN disabled_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE staff_members ADD CONSTRAINT ck_staff_invitation_status CHECK (invitation_status IN ('INVITED','ACTIVE','DISABLED'));
CREATE UNIQUE INDEX uq_staff_email_hash ON staff_members(email_hash);
