CREATE TABLE clinician_onboardings (
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
 clinician_type VARCHAR(40) NOT NULL CHECK (clinician_type IN ('CONSULTANT','ASSOCIATE_DOCTOR')),
 status VARCHAR(40) NOT NULL CHECK (status IN ('INVITED','PROFILE_INCOMPLETE','DOCUMENTS_SUBMITTED','UNDER_VERIFICATION','MORE_INFORMATION_REQUIRED','VERIFIED','REJECTED','OPERATIONAL_SETUP','ACTIVE','SUSPENDED','OFFBOARDED','LEGACY_UNREVIEWED')),
 jurisdiction VARCHAR(20),
 profile_completed_at TIMESTAMP WITH TIME ZONE,
 verified_at TIMESTAMP WITH TIME ZONE,
 activated_at TIMESTAMP WITH TIME ZONE,
 suspended_at TIMESTAMP WITH TIME ZONE,
 offboarded_at TIMESTAMP WITH TIME ZONE,
 reason VARCHAR(500),
 credential_policy_cutover_at TIMESTAMP WITH TIME ZONE,
 created_by VARCHAR(255) NOT NULL,
 updated_by VARCHAR(255) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,practitioner_id)
);
CREATE INDEX idx_clinician_onboarding_status ON clinician_onboardings(organization_id,status);

CREATE TABLE credential_policy_versions (
 id UUID PRIMARY KEY,
 clinician_type VARCHAR(40) NOT NULL,
 jurisdiction VARCHAR(20) NOT NULL,
 version_number INTEGER NOT NULL,
 status VARCHAR(20) NOT NULL CHECK (status IN ('PUBLISHED','RETIRED')),
 effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
 retired_at TIMESTAMP WITH TIME ZONE,
 created_by VARCHAR(255) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 UNIQUE(clinician_type,jurisdiction,version_number)
);

CREATE TABLE credential_policy_requirements (
 policy_version_id UUID NOT NULL REFERENCES credential_policy_versions(id),
 credential_type VARCHAR(60) NOT NULL,
 display_name VARCHAR(120) NOT NULL,
 mandatory BOOLEAN NOT NULL,
 expiry_required BOOLEAN NOT NULL,
 PRIMARY KEY(policy_version_id,credential_type)
);

CREATE TABLE provider_credential_dossiers (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
 credential_type VARCHAR(60) NOT NULL,
 status VARCHAR(30) NOT NULL CHECK (status IN ('OPEN','VERIFIED','SUSPENDED','REVOKED')),
 suspended_reason_encrypted TEXT,
 created_by VARCHAR(255) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(organization_id,practitioner_id,credential_type)
);
CREATE INDEX idx_provider_dossier_practitioner ON provider_credential_dossiers(organization_id,practitioner_id);

CREATE TABLE provider_credential_evidence (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
 staging_object_key VARCHAR(500),
 sealed_object_key VARCHAR(500),
 safe_file_name VARCHAR(255) NOT NULL,
 declared_content_type VARCHAR(100) NOT NULL,
 actual_content_type VARCHAR(100),
 expected_size BIGINT NOT NULL,
 actual_size BIGINT,
 sha256 VARCHAR(64),
 scan_status VARCHAR(30) NOT NULL CHECK (scan_status IN ('PENDING','QUARANTINED','CLEAN','REJECTED')),
 scan_reason VARCHAR(100),
 scanned_at TIMESTAMP WITH TIME ZONE,
 uploaded_by VARCHAR(255) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 sealed_at TIMESTAMP WITH TIME ZONE,
 version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(sealed_object_key)
);
CREATE INDEX idx_provider_evidence_owner ON provider_credential_evidence(organization_id,practitioner_id);

CREATE TABLE provider_credential_revisions (
 id UUID PRIMARY KEY,
 dossier_id UUID NOT NULL REFERENCES provider_credential_dossiers(id),
 revision_number INTEGER NOT NULL,
 policy_version_id UUID NOT NULL REFERENCES credential_policy_versions(id),
 issuer_encrypted TEXT,
 reference_number_encrypted TEXT,
 jurisdiction VARCHAR(20) NOT NULL,
 issued_at TIMESTAMP WITH TIME ZONE,
 expires_at TIMESTAMP WITH TIME ZONE,
 status VARCHAR(40) NOT NULL CHECK (status IN ('SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','VERIFIED','REJECTED','EXPIRED','SUSPENDED')),
 submitted_by VARCHAR(255) NOT NULL,
 submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
 reviewed_by VARCHAR(255),
 reviewed_at TIMESTAMP WITH TIME ZONE,
 review_reason_encrypted TEXT,
 version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(dossier_id,revision_number)
);
CREATE INDEX idx_provider_revision_queue ON provider_credential_revisions(status,submitted_at);
CREATE INDEX idx_provider_revision_expiry ON provider_credential_revisions(status,expires_at);

CREATE TABLE provider_credential_revision_evidence (
 revision_id UUID NOT NULL REFERENCES provider_credential_revisions(id),
 evidence_id UUID NOT NULL REFERENCES provider_credential_evidence(id),
 PRIMARY KEY(revision_id,evidence_id),
 UNIQUE(evidence_id)
);

CREATE TABLE provider_credential_decisions (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 dossier_id UUID NOT NULL REFERENCES provider_credential_dossiers(id),
 revision_id UUID NOT NULL REFERENCES provider_credential_revisions(id),
 decision VARCHAR(40) NOT NULL CHECK (decision IN ('REVIEW_STARTED','MORE_INFORMATION_REQUIRED','VERIFIED','REJECTED','SUSPENDED','RESTORED')),
 actor_subject VARCHAR(255) NOT NULL,
 reason_encrypted TEXT,
 policy_version_id UUID NOT NULL REFERENCES credential_policy_versions(id),
 decided_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_provider_decision_revision ON provider_credential_decisions(revision_id,decided_at);

CREATE TABLE provider_command_results (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 actor_subject VARCHAR(255) NOT NULL,
 operation VARCHAR(80) NOT NULL,
 resource_id VARCHAR(255) NOT NULL,
 idempotency_key VARCHAR(160) NOT NULL,
 request_hash VARCHAR(64) NOT NULL,
 result_id VARCHAR(255),
 result_status VARCHAR(60),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 UNIQUE(organization_id,actor_subject,operation,idempotency_key)
);

CREATE TABLE provider_domain_events (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES provider_organizations(id),
 aggregate_type VARCHAR(60) NOT NULL,
 aggregate_id VARCHAR(255) NOT NULL,
 event_type VARCHAR(80) NOT NULL,
 event_key VARCHAR(255) NOT NULL UNIQUE,
 actor_subject VARCHAR(255) NOT NULL,
 occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE permission_version_cutovers (
 permission_key VARCHAR(100) NOT NULL REFERENCES permission_definitions(permission_key),
 role_version_id UUID NOT NULL REFERENCES role_template_versions(id),
 approved_by VARCHAR(255) NOT NULL,
 approved_at TIMESTAMP WITH TIME ZONE NOT NULL,
 PRIMARY KEY(permission_key,role_version_id)
);

INSERT INTO clinician_onboardings(organization_id,practitioner_id,clinician_type,status,jurisdiction,credential_policy_cutover_at,created_by,updated_by,created_at,updated_at,version)
SELECT d.organization_id,d.practitioner_id,p.practitioner_type,
 CASE WHEN o.legacy_mapping_status='PENDING_REVIEW' THEN 'LEGACY_UNREVIEWED' ELSE 'PROFILE_INCOMPLETE' END,
 o.country_code,CASE WHEN o.legacy_mapping_status IS NULL THEN o.created_at ELSE NULL END,'MIGRATION','MIGRATION',o.created_at,o.updated_at,0
FROM provider_membership_details d
JOIN practitioner_profiles p ON p.id=d.practitioner_id
JOIN provider_organizations o ON o.id=d.organization_id
WHERE d.member_kind='CLINICIAN';

INSERT INTO credential_policy_versions VALUES ('34000000-0000-0000-0000-000000000001','CONSULTANT','AE',1,'PUBLISHED',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO credential_policy_versions VALUES ('34000000-0000-0000-0000-000000000002','ASSOCIATE_DOCTOR','AE',1,'PUBLISHED',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000001','IDENTITY_EVIDENCE','Identity or professional evidence',TRUE,FALSE);
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000001','MEDICAL_LICENSE','Professional medical license',TRUE,TRUE);
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000001','QUALIFICATION','Professional qualification',TRUE,FALSE);
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000001','CONSULTANT_STATUS_EVIDENCE','Consultant status evidence',TRUE,FALSE);
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000002','IDENTITY_EVIDENCE','Identity or professional evidence',TRUE,FALSE);
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000002','MEDICAL_LICENSE','Professional medical license',TRUE,TRUE);
INSERT INTO credential_policy_requirements VALUES ('34000000-0000-0000-0000-000000000002','QUALIFICATION','Professional qualification',TRUE,FALSE);

UPDATE permission_definitions SET executable=TRUE,actor_types='GOVERNANCE,PRACTICE_OPERATIONS,CONSULTANT,ASSOCIATE_DOCTOR',channels='ADMIN_WEB,CONSULTANT_WEB,API' WHERE permission_key IN ('credential.submit','credential.view');
UPDATE permission_definitions SET executable=TRUE,actor_types='GOVERNANCE',allowed_scopes='ORGANIZATION,ASSIGNED_ORGANIZATIONS,SPECIFIC_RESOURCE',channels='ADMIN_WEB,API' WHERE permission_key IN ('credential.review','credential.request_information','credential.verify','credential.reject','credential.suspend');
UPDATE permission_definitions SET recent_auth=TRUE WHERE permission_key IN ('credential.verify','credential.reject','credential.suspend','provider.activate');
UPDATE permission_definitions SET executable=TRUE WHERE permission_key='provider.activate';
UPDATE permission_definitions SET actor_types='GOVERNANCE,PRACTICE_OPERATIONS,CONSULTANT,ASSOCIATE_DOCTOR' WHERE permission_key='provider.update';

INSERT INTO role_template_versions VALUES ('34000001-0000-0000-0000-000000000005','31000000-0000-0000-0000-000000000005',2,'PUBLISHED',0,'GOVERNANCE','ADMIN_WEB',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00');
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000005','credential.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000005','credential.review','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000005','credential.request_information','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000005','credential.verify','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000005','credential.reject','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000005','credential.suspend','ORGANIZATION',NULL);

INSERT INTO role_template_versions SELECT '34000001-0000-0000-0000-000000000004',template_id,3,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00' FROM role_template_versions WHERE id='32000001-0000-0000-0000-000000000004';
INSERT INTO role_permission_grants SELECT '34000001-0000-0000-0000-000000000004',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='32000001-0000-0000-0000-000000000004';
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000004','provider.activate','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000004','credential.view','ORGANIZATION',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000004','credential.submit','ORGANIZATION',NULL);

INSERT INTO role_template_versions SELECT '34000001-0000-0000-0000-000000000013',template_id,3,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00' FROM role_template_versions WHERE id='32000001-0000-0000-0000-000000000013';
INSERT INTO role_permission_grants SELECT '34000001-0000-0000-0000-000000000013',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='32000001-0000-0000-0000-000000000013';
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000013','credential.submit','SELF',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000013','credential.view','SELF',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000013','provider.update','SELF',NULL);

INSERT INTO role_template_versions SELECT '34000001-0000-0000-0000-000000000014',template_id,3,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00' FROM role_template_versions WHERE id='32000001-0000-0000-0000-000000000014';
INSERT INTO role_permission_grants SELECT '34000001-0000-0000-0000-000000000014',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='32000001-0000-0000-0000-000000000014';
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000014','credential.submit','SELF',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000014','credential.view','SELF',NULL);
INSERT INTO role_permission_grants VALUES ('34000001-0000-0000-0000-000000000014','provider.update','SELF',NULL);

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
SELECT permission_key,version_id,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-13 00:00:00+00'
FROM role_permission_grants
WHERE version_id IN ('34000001-0000-0000-0000-000000000005','34000001-0000-0000-0000-000000000004','34000001-0000-0000-0000-000000000013','34000001-0000-0000-0000-000000000014')
AND (permission_key LIKE 'credential.%' OR permission_key='provider.activate');
