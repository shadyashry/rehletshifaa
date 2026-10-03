-- Section 1 clean cutover: the workforce model (V54) is the only staff record. The legacy directory, its single
-- staff_role, the V21 manager column and the V22 team model are removed rather than migrated (pre-production).
-- provider_membership_details is rebuilt without its staff_members link (its unnamed composite constraints cannot
-- be dropped portably); the provider module itself is retired separately (Section 2).
CREATE TABLE provider_membership_details_v59 (
 subject VARCHAR(255) NOT NULL,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 member_kind VARCHAR(30) NOT NULL CHECK (member_kind IN ('CLINICIAN','PRACTICE_STAFF','PLATFORM_STAFF')),
 practitioner_id UUID REFERENCES practitioner_profiles(id),
 display_name_encrypted TEXT,
 email_encrypted TEXT,
 email_hash VARCHAR(64),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(subject,organization_id),
 FOREIGN KEY(subject,organization_id) REFERENCES access_memberships(subject,organization_id),
 UNIQUE(organization_id,practitioner_id),
 CHECK(member_kind <> 'CLINICIAN' OR practitioner_id IS NOT NULL)
);
INSERT INTO provider_membership_details_v59(subject,organization_id,member_kind,practitioner_id,display_name_encrypted,email_encrypted,email_hash,created_at,updated_at,version)
SELECT subject,organization_id,member_kind,practitioner_id,display_name_encrypted,email_encrypted,email_hash,created_at,updated_at,version
FROM provider_membership_details;
DROP TABLE provider_membership_details;
ALTER TABLE provider_membership_details_v59 RENAME TO provider_membership_details;
CREATE INDEX idx_provider_membership_practitioner ON provider_membership_details(practitioner_id);
CREATE INDEX idx_provider_membership_email ON provider_membership_details(email_hash);

DROP TABLE staff_team_assignments;
DROP TABLE staff_members;
