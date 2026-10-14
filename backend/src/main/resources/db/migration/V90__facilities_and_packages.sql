-- Review 2026-10-14, B-02 / A-07 (P0-5, session 1). A facility (hospital, day-surgery centre, clinic, diagnostic or
-- rehabilitation centre) is a pricing source and, from session 3, a travel-plan destination. It is never a user of the
-- Consultant workflow. Consultant Operations owns the record, its accreditation records and its package catalogue;
-- Finance approves each package price range once (maker/checker: never the proposer), after which (session 2) a proposal
-- line drawn from an approved package releases without a Finance work item.
CREATE TABLE facilities (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    city VARCHAR(120) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    -- Derived from the accreditation records: CURRENT while at least one is current, EXPIRED once the last one has
    -- lapsed, NONE when nothing was ever recorded. Maintained by the service and the expiry job, never by hand.
    accreditation_status VARCHAR(20) NOT NULL,
    contact_name VARCHAR(160),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(40),
    settlement_terms VARCHAR(40) NOT NULL,
    settlement_notes VARCHAR(1000),
    created_by VARCHAR(120) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_by VARCHAR(120) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_facilities_name_city UNIQUE (name, city),
    CONSTRAINT ck_facilities_kind CHECK (kind IN ('HOSPITAL', 'DAY_SURGERY_CENTRE', 'CLINIC', 'DIAGNOSTIC_CENTRE', 'REHABILITATION_CENTRE')),
    CONSTRAINT ck_facilities_status CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    CONSTRAINT ck_facilities_accreditation_status CHECK (accreditation_status IN ('NONE', 'CURRENT', 'EXPIRED')),
    CONSTRAINT ck_facilities_settlement_terms CHECK (settlement_terms IN ('PREPAID', 'ON_DISCHARGE', 'NET_15', 'NET_30', 'NET_60'))
);

-- One accreditation (JCI, GAHAR, ISO 9001, ...) with its expiry date. CURRENT becomes EXPIRED by the expiry job the day
-- after expires_on passes; WITHDRAWN is Consultant Operations ending it early.
CREATE TABLE facility_accreditations (
    id UUID PRIMARY KEY,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    body VARCHAR(80) NOT NULL,
    reference_number VARCHAR(160),
    issued_on DATE,
    expires_on DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    recorded_by VARCHAR(120) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    withdrawn_by VARCHAR(120),
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_facility_accreditations_status CHECK (status IN ('CURRENT', 'EXPIRED', 'WITHDRAWN')),
    CONSTRAINT ck_facility_accreditations_dates CHECK (issued_on IS NULL OR issued_on <= expires_on),
    CONSTRAINT ck_facility_accreditations_withdrawal CHECK ((status = 'WITHDRAWN') = (withdrawn_by IS NOT NULL))
);
CREATE INDEX idx_facility_accreditations_expiry ON facility_accreditations(status, expires_on);
CREATE INDEX idx_facility_accreditations_facility ON facility_accreditations(facility_id);

-- A priced package: what the facility charges, as an EGP range, for one procedure code in one care area, with what the
-- price includes. Versions per (facility, procedure code) are append-only: a change is a new version that waits for
-- Finance; approving it retires the version approved before. Only one version per code waits at a time.
CREATE TABLE facility_packages (
    id UUID PRIMARY KEY,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
    procedure_code VARCHAR(40) NOT NULL,
    name VARCHAR(200) NOT NULL,
    care_category VARCHAR(60) NOT NULL REFERENCES care_categories(slug) ON DELETE RESTRICT,
    min_egp NUMERIC(14,2) NOT NULL,
    max_egp NUMERIC(14,2) NOT NULL,
    inclusions VARCHAR(2000) NOT NULL,
    exclusions VARCHAR(2000),
    valid_from DATE NOT NULL,
    valid_to DATE,
    version INTEGER NOT NULL,
    approval_status VARCHAR(20) NOT NULL,
    proposed_by VARCHAR(120) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    decided_by VARCHAR(120),
    decided_at TIMESTAMP WITH TIME ZONE,
    decision_note VARCHAR(500),
    CONSTRAINT uq_facility_packages_version UNIQUE (facility_id, procedure_code, version),
    CONSTRAINT ck_facility_packages_range CHECK (min_egp >= 0 AND max_egp >= min_egp),
    CONSTRAINT ck_facility_packages_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT ck_facility_packages_status CHECK (approval_status IN ('PENDING_FINANCE', 'APPROVED', 'REJECTED', 'RETIRED')),
    CONSTRAINT ck_facility_packages_decision CHECK ((approval_status = 'PENDING_FINANCE') = (decided_by IS NULL))
);
CREATE INDEX idx_facility_packages_facility ON facility_packages(facility_id, approval_status);
CREATE INDEX idx_facility_packages_care_area ON facility_packages(care_category, approval_status);
