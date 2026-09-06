ALTER TABLE staff_members ADD COLUMN manager_subject VARCHAR(255);
ALTER TABLE staff_members ADD CONSTRAINT fk_staff_manager FOREIGN KEY (manager_subject) REFERENCES staff_members(external_subject);
ALTER TABLE staff_members ADD CONSTRAINT ck_staff_not_own_manager CHECK (manager_subject IS NULL OR manager_subject <> external_subject);
CREATE INDEX ix_staff_manager ON staff_members(manager_subject);

CREATE TABLE portal_preferences (
    subject VARCHAR(255) PRIMARY KEY,
    display_name_encrypted TEXT,
    locale VARCHAR(2) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_portal_locale CHECK (locale IN ('en', 'ar'))
);
