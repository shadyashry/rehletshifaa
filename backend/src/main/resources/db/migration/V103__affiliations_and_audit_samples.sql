-- P1-19 session 1 (post-deposit design §7, decision D-H; architecture §4.7, §5.7). Pre-production clean cutover: new tables state
-- the final design, no backfill. The plan's "V100" name was stale; V103 is the next free number.

-- 1) D-H: each Consultant declares, once a year, their relationship with every facility they use (privileges at, employment by, a
--    financial interest in, or none). A current declaration (not superseded, inside its year) is a condition of eligibility for new
--    cases; Compliance reviews each one after it is filed and records CLEARED or FINDING (the review never blocks care). A new
--    declaration supersedes the current one and runs for a year from when it is filed. The note on a review is encrypted.
CREATE TABLE affiliation_declarations (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
    declared_by VARCHAR(255) NOT NULL,
    declared_at TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    attestation_version VARCHAR(40) NOT NULL,
    superseded_at TIMESTAMP WITH TIME ZONE,
    reminded_at TIMESTAMP WITH TIME ZONE,
    review_status VARCHAR(20) NOT NULL,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_note TEXT,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_affiliation_declarations_validity CHECK (valid_until > declared_at),
    CONSTRAINT ck_affiliation_declarations_review CHECK (review_status IN ('PENDING', 'CLEARED', 'FINDING')),
    CONSTRAINT ck_affiliation_declarations_reviewed CHECK ((review_status = 'PENDING') = (reviewed_by IS NULL AND reviewed_at IS NULL)),
    CONSTRAINT ck_affiliation_declarations_finding_note CHECK (review_status <> 'FINDING' OR review_note IS NOT NULL)
);
CREATE INDEX ix_affiliation_declarations_practitioner ON affiliation_declarations(practitioner_id, superseded_at, valid_until);
CREATE INDEX ix_affiliation_declarations_review ON affiliation_declarations(review_status, declared_at);

-- One row per (declaration, facility, kind). NONE_DECLARED says "I use this facility and have no relationship with it"; it is never
-- combined with another kind for the same facility. A financial interest carries a note (what it is), encrypted.
CREATE TABLE consultant_affiliations (
    id UUID PRIMARY KEY,
    declaration_id UUID NOT NULL REFERENCES affiliation_declarations(id),
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
    facility_id UUID NOT NULL REFERENCES facilities(id),
    kind VARCHAR(30) NOT NULL,
    note TEXT,
    CONSTRAINT uq_consultant_affiliations UNIQUE (declaration_id, facility_id, kind),
    CONSTRAINT ck_consultant_affiliations_kind CHECK (kind IN ('PRIVILEGES', 'EMPLOYMENT', 'FINANCIAL_INTEREST', 'NONE_DECLARED')),
    CONSTRAINT ck_consultant_affiliations_interest_note CHECK (kind <> 'FINANCIAL_INTEREST' OR note IS NOT NULL)
);
CREATE INDEX ix_consultant_affiliations_practitioner ON consultant_affiliations(practitioner_id, facility_id);
CREATE INDEX ix_consultant_affiliations_facility ON consultant_affiliations(facility_id);

-- 2) A reservation at a facility the case's Consultant has not declared raises UNDECLARED_FACILITY (the reservation proceeds: never
--    block care on paperwork, make it visible). Compliance reads every flag; a later declaration naming the facility clears it, and
--    the flag stays as the record that the facility was used before it was declared. One open flag per case and facility (kept by the
--    service under the practitioner's row lock); a lapse after clearing raises a new row.
CREATE TABLE affiliation_flags (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id),
    facility_id UUID NOT NULL REFERENCES facilities(id),
    code VARCHAR(30) NOT NULL,
    raised_at TIMESTAMP WITH TIME ZONE NOT NULL,
    cleared_at TIMESTAMP WITH TIME ZONE,
    cleared_by_declaration_id UUID REFERENCES affiliation_declarations(id),
    CONSTRAINT uq_affiliation_flags UNIQUE (case_id, practitioner_id, facility_id, code, raised_at),
    CONSTRAINT ck_affiliation_flags_code CHECK (code IN ('UNDECLARED_FACILITY')),
    CONSTRAINT ck_affiliation_flags_cleared CHECK ((cleared_at IS NULL) = (cleared_by_declaration_id IS NULL))
);
CREATE INDEX ix_affiliation_flags_practitioner ON affiliation_flags(practitioner_id, facility_id, cleared_at);
CREATE INDEX ix_affiliation_flags_raised ON affiliation_flags(raised_at);

-- 3) Design §7.4: separate lines, no blending. Every priced line names who is paid: the Consultant, the facility, someone else
--    (an implant supplier, a laboratory), or the platform (the fee line). A facility package line is always the facility's; the fee
--    line is always the platform's. A cost-estimate line without a payee takes it from its source (catalogue: the Consultant).
ALTER TABLE clinical_review_cost_estimates ADD COLUMN payee VARCHAR(20);
ALTER TABLE clinical_review_cost_estimates ADD CONSTRAINT ck_cost_estimates_payee CHECK (payee IS NULL OR payee IN ('CONSULTANT', 'FACILITY', 'OTHER'));
ALTER TABLE proposal_items ADD COLUMN payee VARCHAR(20) NOT NULL DEFAULT 'OTHER';
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_payee CHECK (payee IN ('CONSULTANT', 'FACILITY', 'OTHER', 'PLATFORM'));
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_fee_payee CHECK ((category = 'PLATFORM_FEE') = (payee = 'PLATFORM'));
ALTER TABLE proposal_items ADD CONSTRAINT ck_proposal_items_package_payee CHECK (source <> 'FACILITY_PACKAGE' OR payee = 'FACILITY');

-- 4) Design §7.5: an unapproved extra on a facility's final invoice twice in a calendar quarter (Cairo) suspends the facility's
--    packages pending review: they stop releasing proposal lines without a Finance check (care already reserved goes on). A Finance
--    Manager lifts the suspension after the review, with a note. One row per suspension; at most one is open per facility (kept by
--    the service under the facility's row lock: no partial index).
CREATE TABLE facility_package_suspensions (
    id UUID PRIMARY KEY,
    facility_id UUID NOT NULL REFERENCES facilities(id),
    reason VARCHAR(40) NOT NULL,
    trigger_case_id UUID REFERENCES medical_cases(id),
    quarter VARCHAR(7) NOT NULL,
    occurrences INTEGER NOT NULL,
    suspended_at TIMESTAMP WITH TIME ZONE NOT NULL,
    lifted_by VARCHAR(255),
    lifted_at TIMESTAMP WITH TIME ZONE,
    lift_note VARCHAR(2000),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_facility_package_suspensions_reason CHECK (reason IN ('REPEATED_UNAPPROVED_EXTRAS')),
    CONSTRAINT ck_facility_package_suspensions_lifted CHECK ((lifted_at IS NULL) = (lifted_by IS NULL) AND (lifted_at IS NULL) = (lift_note IS NULL)),
    CONSTRAINT ck_facility_package_suspensions_occurrences CHECK (occurrences >= 2)
);
CREATE INDEX ix_facility_package_suspensions_facility ON facility_package_suspensions(facility_id, lifted_at);

-- 5) Design §7.8: Compliance samples closed cases every month (and on demand). Each sampled case keeps the assembled money record
--    (statement, final invoice, receipts, the Consultant's and the facility's lines on the accepted final quote, the reconciliation:
--    metadata and amounts only, never clinical content, AUD-05) and the mismatches found, then Compliance's review: no finding, or a
--    finding (note encrypted) that becomes a case incident (P1-13). One monthly sample per month (monthly_of is set only on it).
CREATE TABLE audit_samples (
    id UUID PRIMARY KEY,
    sample_month VARCHAR(7) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    monthly_of VARCHAR(7),
    requested_size INTEGER NOT NULL,
    candidates INTEGER NOT NULL,
    drawn_by VARCHAR(255) NOT NULL,
    drawn_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_audit_samples_monthly UNIQUE (monthly_of),
    CONSTRAINT ck_audit_samples_kind CHECK (kind IN ('MONTHLY', 'ON_DEMAND')),
    CONSTRAINT ck_audit_samples_monthly CHECK ((kind = 'MONTHLY') = (monthly_of IS NOT NULL) AND (monthly_of IS NULL OR monthly_of = sample_month)),
    CONSTRAINT ck_audit_samples_size CHECK (requested_size >= 1 AND requested_size <= 50 AND candidates >= 0)
);
CREATE INDEX ix_audit_samples_month ON audit_samples(sample_month, drawn_at);

CREATE TABLE audit_sample_cases (
    id UUID PRIMARY KEY,
    sample_id UUID NOT NULL REFERENCES audit_samples(id),
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    closed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    practitioner_id UUID REFERENCES practitioner_profiles(id),
    facility_id UUID REFERENCES facilities(id),
    record TEXT NOT NULL,
    mismatches VARCHAR(400) NOT NULL,
    review_status VARCHAR(20) NOT NULL,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    finding_note TEXT,
    incident_id UUID REFERENCES case_incidents(id),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_audit_sample_cases UNIQUE (sample_id, case_id),
    CONSTRAINT ck_audit_sample_cases_review CHECK (review_status IN ('PENDING', 'NO_FINDING', 'FINDING')),
    CONSTRAINT ck_audit_sample_cases_reviewed CHECK ((review_status = 'PENDING') = (reviewed_by IS NULL AND reviewed_at IS NULL)),
    CONSTRAINT ck_audit_sample_cases_finding CHECK ((review_status = 'FINDING') = (finding_note IS NOT NULL AND incident_id IS NOT NULL))
);
CREATE INDEX ix_audit_sample_cases_case ON audit_sample_cases(case_id);
CREATE INDEX ix_audit_sample_cases_review ON audit_sample_cases(review_status, sample_id);
