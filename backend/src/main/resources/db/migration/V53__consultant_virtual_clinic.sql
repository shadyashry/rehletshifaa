-- Consultant virtual clinic (phase 1): Consultant -> one Virtual Clinic -> optional Practice Managers.
-- Deliberately independent of provider organizations: nothing here references provider_organizations,
-- memberships or onboarding, and nothing in the case workflow routes through an organization.

-- Exactly one virtual clinic per consultant, keyed by the practitioner itself. Not a physical clinic.
CREATE TABLE virtual_clinics (
    practitioner_id UUID PRIMARY KEY REFERENCES practitioner_profiles(id) ON DELETE CASCADE,
    public_display_name VARCHAR(160),
    public_headline VARCHAR(300),
    public_bio TEXT,
    public_languages VARCHAR(300),
    published_at TIMESTAMP WITH TIME ZONE,
    published_by VARCHAR(255),
    draft_display_name VARCHAR(160),
    draft_headline VARCHAR(300),
    draft_bio TEXT,
    draft_languages VARCHAR(300),
    draft_status VARCHAR(30) NOT NULL DEFAULT 'NONE',
    draft_updated_by VARCHAR(255),
    draft_updated_at TIMESTAMP WITH TIME ZONE,
    manager_changes_require_approval BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_clinic_draft_status CHECK (draft_status IN ('NONE','PENDING_APPROVAL'))
);
INSERT INTO virtual_clinics(practitioner_id, created_at, updated_at, version)
    SELECT id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0 FROM practitioner_profiles WHERE practitioner_type = 'CONSULTANT';

-- Practice managers: explicit, revocable, administrative-only delegations granted by the consultant.
-- A delegation never grants case, document, message or clinical access.
CREATE TABLE practice_managers (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES virtual_clinics(practitioner_id) ON DELETE CASCADE,
    manager_subject VARCHAR(255) NOT NULL,
    display_name_encrypted TEXT NOT NULL,
    email_encrypted TEXT,
    email_hash VARCHAR(64),
    status VARCHAR(20) NOT NULL,
    can_manage_schedule BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_profile BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_services BOOLEAN NOT NULL DEFAULT FALSE,
    invited_by VARCHAR(255) NOT NULL,
    invited_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_by VARCHAR(255),
    revoked_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_practice_manager_status CHECK (status IN ('ACTIVE','REVOKED')),
    CONSTRAINT uq_practice_manager_subject UNIQUE (practitioner_id, manager_subject)
);
CREATE INDEX idx_practice_managers_subject ON practice_managers(manager_subject, status);

-- Consultation schedule: published slots. Patient booking is not part of this phase.
CREATE TABLE consultation_slots (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES virtual_clinics(practitioner_id) ON DELETE CASCADE,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consultation_mode VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    admin_note VARCHAR(500),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_slot_mode CHECK (consultation_mode IN ('VIDEO','IN_PERSON')),
    CONSTRAINT ck_slot_status CHECK (status IN ('OPEN','CANCELLED')),
    CONSTRAINT ck_slot_window CHECK (ends_at > starts_at)
);
CREATE INDEX idx_slots_practitioner ON consultation_slots(practitioner_id, starts_at);

-- The consultant's professional service catalogue gains the governed fields. Existing rows stay
-- PLATFORM_MANAGED (set by the platform/template) until a consultant-approved change replaces them.
ALTER TABLE consultant_service_catalog ADD COLUMN service_kind VARCHAR(40);
ALTER TABLE consultant_service_catalog ADD COLUMN description TEXT;
ALTER TABLE consultant_service_catalog ADD COLUMN included_scope TEXT;
ALTER TABLE consultant_service_catalog ADD COLUMN excluded_scope TEXT;
ALTER TABLE consultant_service_catalog ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'EGP';
ALTER TABLE consultant_service_catalog ADD COLUMN price_max_egp NUMERIC(12,2);
ALTER TABLE consultant_service_catalog ADD COLUMN effective_from DATE;
ALTER TABLE consultant_service_catalog ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE consultant_service_catalog ADD COLUMN approval_status VARCHAR(30) NOT NULL DEFAULT 'PLATFORM_MANAGED';
ALTER TABLE consultant_service_catalog ADD COLUMN approved_by VARCHAR(255);
ALTER TABLE consultant_service_catalog ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE consultant_service_catalog ADD COLUMN updated_by VARCHAR(255);

-- Every clinic-side service/price change is a governed change record: prepared (by the consultant or a
-- practice manager), approved or rejected by the consultant, and — once applied — the version history.
CREATE TABLE clinic_service_changes (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES virtual_clinics(practitioner_id) ON DELETE CASCADE,
    catalog_service_id UUID REFERENCES consultant_service_catalog(id) ON DELETE SET NULL,
    change_type VARCHAR(20) NOT NULL,
    service_code VARCHAR(60) NOT NULL,
    service_name VARCHAR(500) NOT NULL,
    service_kind VARCHAR(40) NOT NULL,
    description TEXT,
    included_scope TEXT,
    excluded_scope TEXT,
    currency VARCHAR(3) NOT NULL,
    price_egp NUMERIC(12,2) NOT NULL,
    price_max_egp NUMERIC(12,2),
    effective_from DATE NOT NULL,
    valid_until DATE,
    base_version BIGINT,
    applied_revision INTEGER,
    status VARCHAR(20) NOT NULL,
    proposed_by VARCHAR(255) NOT NULL,
    proposed_by_role VARCHAR(30) NOT NULL,
    proposed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_by VARCHAR(255),
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_reason VARCHAR(500),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_service_change_type CHECK (change_type IN ('CREATE','UPDATE','RETIRE','ACTIVATE')),
    CONSTRAINT ck_service_change_status CHECK (status IN ('PENDING_APPROVAL','APPLIED','REJECTED')),
    CONSTRAINT ck_service_change_role CHECK (proposed_by_role IN ('CONSULTANT','PRACTICE_MANAGER')),
    CONSTRAINT ck_service_change_price CHECK (price_egp >= 0 AND (price_max_egp IS NULL OR price_max_egp >= price_egp))
);
CREATE INDEX idx_service_changes_clinic ON clinic_service_changes(practitioner_id, status, proposed_at);
CREATE INDEX idx_service_changes_service ON clinic_service_changes(catalog_service_id, applied_revision);

-- Structured clinical capabilities, approved by RehletShifaa governance (never by the consultant or a
-- practice manager). CARE_AREA capabilities widen assignment eligibility beyond the primary care area.
CREATE TABLE consultant_capabilities (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE CASCADE,
    capability_type VARCHAR(30) NOT NULL,
    capability_code VARCHAR(120) NOT NULL,
    label VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL,
    approved_by VARCHAR(255) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_by VARCHAR(255),
    revoked_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_capability_type CHECK (capability_type IN ('CARE_AREA','SUBSPECIALTY','PROCEDURE','AGE_GROUP','LANGUAGE')),
    CONSTRAINT ck_capability_status CHECK (status IN ('APPROVED','REVOKED')),
    CONSTRAINT uq_consultant_capability UNIQUE (practitioner_id, capability_type, capability_code)
);

-- Consultant-initiated referrals: a transfer or a second opinion. Never grants access by itself — the
-- coordinator confirms the handover and the receiving consultant accepts before any assignment is active.
CREATE TABLE consultant_referrals (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    referral_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    from_subject VARCHAR(255) NOT NULL,
    from_practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
    source_assignment_id UUID NOT NULL REFERENCES case_assignments(id),
    clinical_reason_encrypted TEXT NOT NULL,
    suggested_care_category VARCHAR(60) REFERENCES care_categories(slug),
    suggested_capability VARCHAR(200),
    suggested_practitioner_id UUID REFERENCES practitioner_profiles(id),
    target_care_category VARCHAR(60) REFERENCES care_categories(slug),
    target_practitioner_id UUID REFERENCES practitioner_profiles(id),
    target_assignment_id UUID REFERENCES case_assignments(id),
    coordinator_subject VARCHAR(255),
    coordinator_note VARCHAR(500),
    coordinator_decided_at TIMESTAMP WITH TIME ZONE,
    receiver_reason VARCHAR(500),
    receiver_decided_at TIMESTAMP WITH TIME ZONE,
    opinion_encrypted TEXT,
    opinion_submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_referral_type CHECK (referral_type IN ('TRANSFER','SECOND_OPINION')),
    CONSTRAINT ck_referral_status CHECK (status IN ('AWAITING_COORDINATOR','AWAITING_CONSULTANT','IN_PROGRESS','COMPLETED','DECLINED_BY_COORDINATOR','WITHDRAWN'))
);
CREATE INDEX idx_referrals_case ON consultant_referrals(case_id, status);
CREATE INDEX idx_referrals_target_assignment ON consultant_referrals(target_assignment_id);
