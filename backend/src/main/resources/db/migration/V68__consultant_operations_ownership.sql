-- SOD-05: effective-dated Consultant Operations ownership and immutable review-conflict snapshots.

CREATE TABLE consultant_operations_ownerships (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    owner_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_to TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL,
    assigned_by VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_by VARCHAR(255),
    end_reason VARCHAR(500),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_consultant_owner_status CHECK (status IN ('ACTIVE','ENDED')),
    CONSTRAINT ck_consultant_owner_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT uq_consultant_owner_start UNIQUE (practitioner_id, effective_from)
);
CREATE INDEX ix_consultant_owner_subject ON consultant_operations_ownerships(owner_subject, status);

-- H2-safe current pointer gives each Consultant at most one current Operations owner.
CREATE TABLE consultant_current_operations_owners (
    practitioner_id UUID PRIMARY KEY REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    ownership_id UUID NOT NULL UNIQUE REFERENCES consultant_operations_ownerships(id),
    owner_subject VARCHAR(255) NOT NULL REFERENCES workforce_people(subject)
);

-- An open review retains every subject that was conflicted while it was open. Reassignment adds the new owner
-- without deleting the previous owner, so an ownership race cannot make a reviewer eligible retroactively.
CREATE TABLE consultant_review_conflicts (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    review_kind VARCHAR(30) NOT NULL,
    review_reference UUID NOT NULL,
    conflict_subject VARCHAR(255) NOT NULL,
    conflict_source VARCHAR(30) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_consultant_review_kind CHECK (review_kind IN ('CREDENTIAL','CAPABILITY')),
    CONSTRAINT ck_consultant_conflict_source CHECK (conflict_source IN ('CONSULTANT','OPERATIONS_OWNER')),
    CONSTRAINT uq_consultant_review_conflict UNIQUE (review_kind, review_reference, conflict_subject)
);
CREATE INDEX ix_consultant_review_conflict_lookup
    ON consultant_review_conflicts(practitioner_id, review_kind, review_reference, conflict_subject);
