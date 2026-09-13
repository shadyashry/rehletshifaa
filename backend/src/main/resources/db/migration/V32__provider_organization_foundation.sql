CREATE TABLE provider_organizations (
 id UUID PRIMARY KEY,
 legal_name VARCHAR(200) NOT NULL,
 business_name VARCHAR(200),
 display_name VARCHAR(160) NOT NULL,
 organization_type VARCHAR(40) NOT NULL CHECK (organization_type IN ('SOLO_PRACTICE','GROUP_PRACTICE','CLINIC','HOSPITAL','PROVIDER_NETWORK')),
 status VARCHAR(40) NOT NULL CHECK (status IN ('DRAFT','ONBOARDING','READINESS_REVIEW','ACTIVE','SUSPENDED','OFFBOARDED')),
 country_code VARCHAR(2),
 time_zone VARCHAR(80) NOT NULL,
 default_currency VARCHAR(3) NOT NULL,
 legacy_practitioner_id UUID REFERENCES practitioner_profiles(id),
 legacy_mapping_status VARCHAR(30) CHECK (legacy_mapping_status IN ('PENDING_REVIEW','REVIEWED')),
 created_by VARCHAR(255) NOT NULL,
 updated_by VARCHAR(255) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(legacy_practitioner_id)
);

ALTER TABLE practitioner_profiles DROP CONSTRAINT ck_practitioner_type;
ALTER TABLE practitioner_profiles ADD CONSTRAINT ck_practitioner_type CHECK (practitioner_type IN ('CONSULTANT','ASSOCIATE_DOCTOR','STAFF'));

ALTER TABLE access_memberships ADD COLUMN invitation_status VARCHAR(30);
ALTER TABLE access_memberships ADD COLUMN invited_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE access_memberships ADD COLUMN activated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE access_memberships ADD COLUMN activated_by VARCHAR(255);
ALTER TABLE access_memberships ADD COLUMN deactivated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE access_memberships ADD COLUMN deactivated_by VARCHAR(255);

CREATE TABLE provider_membership_details (
 subject VARCHAR(255) NOT NULL,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 member_kind VARCHAR(30) NOT NULL CHECK (member_kind IN ('CLINICIAN','PRACTICE_STAFF','PLATFORM_STAFF')),
 practitioner_id UUID REFERENCES practitioner_profiles(id),
 staff_member_id UUID REFERENCES staff_members(id),
 display_name_encrypted TEXT,
 email_encrypted TEXT,
 email_hash VARCHAR(64),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(subject,organization_id),
 FOREIGN KEY(subject,organization_id) REFERENCES access_memberships(subject,organization_id),
 UNIQUE(organization_id,practitioner_id),
 UNIQUE(organization_id,staff_member_id),
 CHECK(member_kind <> 'CLINICIAN' OR practitioner_id IS NOT NULL)
);
CREATE INDEX idx_provider_membership_practitioner ON provider_membership_details(practitioner_id);
CREATE INDEX idx_provider_membership_email ON provider_membership_details(email_hash);

CREATE TABLE provider_identity_operations (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 requested_role VARCHAR(60) NOT NULL,
 member_kind VARCHAR(30) NOT NULL,
 display_name_encrypted TEXT NOT NULL,
 email_encrypted TEXT NOT NULL,
 email_hash VARCHAR(64) NOT NULL,
 locale VARCHAR(10) NOT NULL,
 external_subject VARCHAR(255),
 status VARCHAR(30) NOT NULL CHECK (status IN ('REQUESTED','IDENTITY_CREATED','COMPLETED','FAILED')),
 failure_reason VARCHAR(500),
 requested_by VARCHAR(255) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(organization_id,email_hash)
);

INSERT INTO permission_definitions VALUES ('provider.relationship.manage','Manage provider relationships','Manage explicit provider clinician and staff relationships within the approved data scope.','provider','HIGH','ORGANIZATION,ASSIGNED_ORGANIZATIONS','GOVERNANCE,PRACTICE_OPERATIONS,CONSULTANT','ADMIN_WEB,CONSULTANT_WEB,API','BUSINESS','','',TRUE,TRUE,FALSE,FALSE);
UPDATE permission_definitions SET executable=TRUE WHERE permission_key IN ('provider.view','provider.create','provider.update','provider.suspend','provider.member.invite','provider.member.deactivate','provider.clinician.invite','provider.practice_staff.manage');
UPDATE permission_definitions SET allowed_scopes='ORGANIZATION,ASSIGNED_ORGANIZATIONS,PLATFORM' WHERE permission_key='provider.create';
UPDATE permission_definitions SET actor_types='GOVERNANCE' WHERE permission_key IN ('provider.create','provider.suspend');
UPDATE permission_definitions SET actor_types='GOVERNANCE,PRACTICE_OPERATIONS' WHERE permission_key IN ('provider.update','provider.member.invite','provider.member.deactivate','provider.clinician.invite','provider.practice_staff.manage');

INSERT INTO role_template_versions VALUES ('32000001-0000-0000-0000-000000000004','31000000-0000-0000-0000-000000000004',2,'PUBLISHED',0,'GOVERNANCE','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.create','PLATFORM',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.update','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.suspend','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.member.invite','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.member.deactivate','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.clinician.invite','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.practice_staff.manage','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000004','provider.relationship.manage','ORGANIZATION',NULL);

INSERT INTO role_template_versions VALUES ('32000001-0000-0000-0000-000000000011','31000000-0000-0000-0000-000000000011',2,'PUBLISHED',0,'PRACTICE_OPERATIONS','CONSULTANT_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.update','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.member.invite','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.member.deactivate','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.clinician.invite','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.practice_staff.manage','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000011','provider.relationship.manage','ORGANIZATION',NULL);

INSERT INTO role_template_versions VALUES ('32000001-0000-0000-0000-000000000012','31000000-0000-0000-0000-000000000012',2,'PUBLISHED',0,'PRACTICE_OPERATIONS','CONSULTANT_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000012','provider.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000012','provider.practice_staff.manage','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000012','provider.relationship.manage','ORGANIZATION',NULL);

INSERT INTO role_template_versions VALUES ('32000001-0000-0000-0000-000000000013','31000000-0000-0000-0000-000000000013',2,'PUBLISHED',0,'CONSULTANT','CONSULTANT_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000013','provider.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000013','provider.relationship.manage','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000013','clinical.case.view','ASSIGNED_CASES',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000013','clinical.document.view','ASSIGNED_CASES',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000013','clinical.recommendation.draft','ASSIGNED_CASES',NULL);
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000013','clinical.recommendation.submit','ASSIGNED_CASES',NULL);

INSERT INTO role_template_versions SELECT '32000001-0000-0000-0000-000000000014','31000000-0000-0000-0000-000000000014',2,'PUBLISHED',0,'ASSOCIATE_DOCTOR','CONSULTANT_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00';
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000014','provider.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants SELECT '32000001-0000-0000-0000-000000000014',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='31000001-0000-0000-0000-000000000014';

INSERT INTO role_template_versions VALUES ('32000001-0000-0000-0000-000000000015','31000000-0000-0000-0000-000000000015',2,'PUBLISHED',0,'CLINICAL_SUPPORT','CONSULTANT_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('32000001-0000-0000-0000-000000000015','provider.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants SELECT '32000001-0000-0000-0000-000000000015',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='31000001-0000-0000-0000-000000000015';
