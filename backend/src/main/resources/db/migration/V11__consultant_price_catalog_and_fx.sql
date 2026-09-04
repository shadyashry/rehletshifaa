-- Per-consultant, finance-pre-approved price list. Prices are held in the
-- consultant's base currency (EGP); other currencies are derived at quote time
-- from fx_rates and snapshotted onto the proposal at release.
CREATE TABLE consultant_service_catalog (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE CASCADE,
    service_code VARCHAR(60) NOT NULL,
    service_name VARCHAR(500) NOT NULL,
    category VARCHAR(120),
    price_egp NUMERIC(12,2) NOT NULL CHECK (price_egp >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_until DATE,
    created_by VARCHAR(120) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    -- service_code is the stable key the admin's spreadsheet upserts against.
    CONSTRAINT uq_catalog_practitioner_code UNIQUE (practitioner_id, service_code)
);
CREATE INDEX idx_catalog_practitioner ON consultant_service_catalog(practitioner_id);

-- Specialty service templates: the canonical service list per care area an admin
-- starts from when building a consultant's price list manually. Editing a
-- consultant's prices afterwards happens in consultant_service_catalog (above),
-- so admin price changes reflect on the doctor's page immediately.
CREATE TABLE service_templates (
    id UUID PRIMARY KEY,
    care_category VARCHAR(60) NOT NULL,
    name VARCHAR(160) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_template_care_category UNIQUE (care_category)
);
CREATE TABLE service_template_items (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES service_templates(id) ON DELETE CASCADE,
    service_code VARCHAR(60) NOT NULL,
    service_name VARCHAR(500) NOT NULL,
    category VARCHAR(120),
    suggested_price_egp NUMERIC(12,2),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_template_item_code UNIQUE (template_id, service_code)
);
CREATE INDEX idx_template_items ON service_template_items(template_id);

-- Daily FX rates with EGP as the base. One effective row per (quote_currency,
-- rate_date); an admin override (source='MANUAL') replaces the fetched API row
-- so the Central Bank of Egypt published rate can be pinned when required.
-- rate = quote-currency units per 1 EGP (amount_quote = amount_egp * rate).
CREATE TABLE fx_rates (
    id UUID PRIMARY KEY,
    base_currency VARCHAR(3) NOT NULL DEFAULT 'EGP',
    quote_currency VARCHAR(3) NOT NULL,
    rate NUMERIC(18,8) NOT NULL CHECK (rate > 0),
    rate_date DATE NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'API' CHECK (source IN ('API','MANUAL')),
    created_by VARCHAR(120),
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_fx_base_quote_date UNIQUE (base_currency, quote_currency, rate_date)
);
CREATE INDEX idx_fx_lookup ON fx_rates(quote_currency, rate_date);

-- A consultant cost-estimate line may now be sourced from the approved catalog
-- (needs no finance approval) or entered manually (does). price_egp is the base
-- amount; the existing estimated_cost/currency stay as the doctor-facing display.
-- Existing rows predate the catalog, so they are treated as manual (finance-gated).
ALTER TABLE clinical_review_cost_estimates ADD COLUMN catalog_service_id UUID REFERENCES consultant_service_catalog(id) ON DELETE SET NULL;
ALTER TABLE clinical_review_cost_estimates ADD COLUMN price_egp NUMERIC(12,2);
ALTER TABLE clinical_review_cost_estimates ADD COLUMN requires_finance_approval BOOLEAN NOT NULL DEFAULT TRUE;

-- Snapshot the exact rate used onto the released proposal so the patient price
-- is fixed and auditable, independent of later market movement.
ALTER TABLE proposal_versions ADD COLUMN fx_rate NUMERIC(18,8);
ALTER TABLE proposal_versions ADD COLUMN fx_rate_date DATE;
ALTER TABLE proposal_versions ADD COLUMN fx_source VARCHAR(20);
ALTER TABLE proposal_versions ADD COLUMN requires_finance_approval BOOLEAN NOT NULL DEFAULT TRUE;

-- Distinguish catalog-priced items from manual ones on the proposal itself, and
-- keep the EGP base alongside the quoted unit_price for audit/reconversion.
ALTER TABLE proposal_items ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('CATALOG','MANUAL'));
ALTER TABLE proposal_items ADD COLUMN unit_price_egp NUMERIC(12,2);
ALTER TABLE proposal_items ADD COLUMN catalog_service_id UUID REFERENCES consultant_service_catalog(id) ON DELETE SET NULL;

-- Seed the cardiology template. Suggested EGP prices are starting points the
-- admin can accept or override per consultant; they are not applied until copied
-- into a consultant's catalog.
INSERT INTO service_templates (id, care_category, name) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'cardiology', 'Cardiology standard services');
INSERT INTO service_template_items (id, template_id, service_code, service_name, category, suggested_price_egp, sort_order) VALUES
    ('a1000000-0000-0000-0000-000000000101', 'a1000000-0000-0000-0000-000000000001', 'CARD-CONSULT', 'Diagnostic cardiology consultation',           'Consultation', 3500,   1),
    ('a1000000-0000-0000-0000-000000000102', 'a1000000-0000-0000-0000-000000000001', 'CARD-ECHO',    'Transthoracic echocardiogram',                 'Diagnostics',  4500,   2),
    ('a1000000-0000-0000-0000-000000000103', 'a1000000-0000-0000-0000-000000000001', 'CARD-HOLTER',  '24-hour Holter monitoring',                     'Diagnostics',  5000,   3),
    ('a1000000-0000-0000-0000-000000000104', 'a1000000-0000-0000-0000-000000000001', 'CARD-STRESS',  'Exercise stress test',                         'Diagnostics',  6500,   4),
    ('a1000000-0000-0000-0000-000000000105', 'a1000000-0000-0000-0000-000000000001', 'CARD-PREOP',   'Pre-procedure assessment panel',               'Diagnostics',  6500,   5),
    ('a1000000-0000-0000-0000-000000000106', 'a1000000-0000-0000-0000-000000000001', 'CARD-ANGIO',   'Diagnostic coronary angiography',              'Procedures',   85000,  6),
    ('a1000000-0000-0000-0000-000000000107', 'a1000000-0000-0000-0000-000000000001', 'CARD-PTCA1',   'Coronary angioplasty + 1 drug-eluting stent',  'Procedures',   320000, 7),
    ('a1000000-0000-0000-0000-000000000108', 'a1000000-0000-0000-0000-000000000001', 'CARD-PTCA2',   'Coronary angioplasty + 2 drug-eluting stents', 'Procedures',   465000, 8),
    ('a1000000-0000-0000-0000-000000000109', 'a1000000-0000-0000-0000-000000000001', 'CARD-PACE',    'Dual-chamber pacemaker implant',               'Procedures',   390000, 9),
    ('a1000000-0000-0000-0000-000000000110', 'a1000000-0000-0000-0000-000000000001', 'CARD-ROOM',    'Hospital day - standard private room',         'Inpatient',    12000,  10),
    ('a1000000-0000-0000-0000-000000000111', 'a1000000-0000-0000-0000-000000000001', 'CARD-CCU',     'Coronary care unit - per day',                 'Inpatient',    28000,  11);
