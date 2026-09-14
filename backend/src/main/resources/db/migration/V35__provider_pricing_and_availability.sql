-- Phase 2C extends the existing consultant catalogue with immutable provider-owned
-- price versions and adds the single authoritative clinician availability model.
CREATE TABLE provider_price_versions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES provider_organizations(id) ON DELETE RESTRICT,
    service_code VARCHAR(60) NOT NULL,
    service_name VARCHAR(500) NOT NULL,
    category VARCHAR(120),
    scope_type VARCHAR(30) NOT NULL CHECK (scope_type IN ('ORGANIZATION','CONSULTANT','ASSOCIATE_DOCTOR')),
    scope_key VARCHAR(80) NOT NULL,
    clinician_id UUID REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    legacy_catalog_id UUID REFERENCES consultant_service_catalog(id) ON DELETE SET NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
    version_number INTEGER NOT NULL,
    consultant_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
    consultant_approved_by VARCHAR(255),
    consultant_approved_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(255) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    published_by VARCHAR(255),
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_provider_price_version UNIQUE (organization_id,service_code,scope_type,scope_key,version_number),
    CONSTRAINT ck_provider_price_scope CHECK ((scope_type='ORGANIZATION' AND clinician_id IS NULL AND scope_key='ORGANIZATION') OR (scope_type<>'ORGANIZATION' AND clinician_id IS NOT NULL)),
    CONSTRAINT ck_provider_price_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX idx_provider_price_effective ON provider_price_versions(organization_id,service_code,scope_type,scope_key,status,effective_from,effective_to);
CREATE INDEX idx_provider_price_clinician ON provider_price_versions(organization_id,clinician_id,status);

CREATE TABLE clinician_availability_slots (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES provider_organizations(id) ON DELETE RESTRICT,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    time_zone VARCHAR(80) NOT NULL,
    service_code VARCHAR(60),
    consultation_mode VARCHAR(30),
    location VARCHAR(300),
    effective_from DATE NOT NULL,
    effective_to DATE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
    created_by VARCHAR(255) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_availability_slot_time CHECK (end_time > start_time),
    CONSTRAINT ck_availability_slot_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX idx_availability_slot_effective ON clinician_availability_slots(organization_id,practitioner_id,day_of_week,status,effective_from,effective_to);

CREATE TABLE clinician_availability_exceptions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES provider_organizations(id) ON DELETE RESTRICT,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    exception_type VARCHAR(30) NOT NULL CHECK (exception_type IN ('LEAVE','BLOCKED','CLINIC_CLOSURE','EXTRA_AVAILABILITY','SPECIAL_CLINIC')),
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    time_zone VARCHAR(80) NOT NULL,
    service_code VARCHAR(60),
    consultation_mode VARCHAR(30),
    location VARCHAR(300),
    reason VARCHAR(500),
    created_by VARCHAR(255) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_availability_exception_time CHECK (ends_at > starts_at)
);
CREATE INDEX idx_availability_exception_effective ON clinician_availability_exceptions(organization_id,practitioner_id,starts_at,ends_at);

UPDATE permission_definitions SET executable=TRUE,actor_types='PRACTICE_OPERATIONS,CONSULTANT,ASSOCIATE_DOCTOR',channels='CONSULTANT_WEB,API'
WHERE permission_key IN ('price_list.view','price_list.manage','price_list.publish','availability.view','availability.manage','availability.manage_self','service_catalog.view','service_catalog.manage');
UPDATE permission_definitions SET dependencies='price_list.view,price_list.manage' WHERE permission_key='price_list.publish';

-- Only these reviewed versions activate the Phase 2C capabilities. Existing pinned
-- versions stay dormant until explicitly replaced through Access Governance.
INSERT INTO role_template_versions SELECT '35000001-0000-0000-0000-000000000012',template_id,3,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='32000001-0000-0000-0000-000000000012';
INSERT INTO role_permission_grants SELECT '35000001-0000-0000-0000-000000000012',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='32000001-0000-0000-0000-000000000012';
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','price_list.view','MANAGED_CLINICIANS','MANAGES');
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','price_list.manage','MANAGED_CLINICIANS','MANAGES');
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','price_list.publish','MANAGED_CLINICIANS','MANAGES');
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','service_catalog.view','MANAGED_CLINICIANS','MANAGES');
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','service_catalog.manage','MANAGED_CLINICIANS','MANAGES');
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','availability.view','MANAGED_CLINICIANS','MANAGES');
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000012','availability.manage','MANAGED_CLINICIANS','MANAGES');

INSERT INTO role_template_versions SELECT '35000001-0000-0000-0000-000000000013',template_id,4,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='34000001-0000-0000-0000-000000000013';
INSERT INTO role_permission_grants SELECT '35000001-0000-0000-0000-000000000013',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='34000001-0000-0000-0000-000000000013';
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000013','price_list.view','SELF',NULL);
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000013','availability.view','SELF',NULL);

INSERT INTO role_template_versions SELECT '35000001-0000-0000-0000-000000000014',template_id,4,'PUBLISHED',0,actor_type,channel,TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00',NULL,'ENGINEERING','ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00' FROM role_template_versions WHERE id='34000001-0000-0000-0000-000000000014';
INSERT INTO role_permission_grants SELECT '35000001-0000-0000-0000-000000000014',permission_key,scope_type,relationship_type FROM role_permission_grants WHERE version_id='34000001-0000-0000-0000-000000000014';
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000014','price_list.view','SELF',NULL);
INSERT INTO role_permission_grants VALUES ('35000001-0000-0000-0000-000000000014','availability.view','SELF',NULL);

INSERT INTO permission_version_cutovers(permission_key,role_version_id,approved_by,approved_at)
SELECT permission_key,version_id,'ENGINEERING',TIMESTAMP WITH TIME ZONE '2026-09-14 00:00:00+00'
FROM role_permission_grants
WHERE version_id IN ('35000001-0000-0000-0000-000000000012','35000001-0000-0000-0000-000000000013','35000001-0000-0000-0000-000000000014')
AND permission_key IN ('price_list.view','price_list.manage','price_list.publish','service_catalog.view','service_catalog.manage','availability.view','availability.manage','availability.manage_self');
