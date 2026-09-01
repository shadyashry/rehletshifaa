ALTER TABLE medical_cases DROP CONSTRAINT ck_case_status;
ALTER TABLE medical_cases ADD CONSTRAINT ck_case_status CHECK (status IN (
    'DRAFT','RECEIVED','CLAIM_PENDING','INTAKE_REVIEW','INFORMATION_REQUIRED',
    'READY_FOR_CONSULTANT','CONSULTANT_ASSIGNMENT_PENDING','CONSULTANT_REVIEW',
    'CLINICAL_RECOMMENDATION_READY','PROPOSAL_PREPARATION','PROPOSAL_INTERNAL_APPROVAL',
    'PROPOSAL_READY','PATIENT_DECISION','REVISION_REQUESTED','ACCEPTED','DECLINED',
    'EXPIRED','TRAVEL_COORDINATION','ARRIVAL_CONFIRMED','TREATMENT_IN_PROGRESS',
    'DISCHARGED','FOLLOW_UP','CLOSED','CANCELLED','NEW','COORDINATOR_REVIEW',
    'RECOMMENDATION_READY','TREATMENT_COORDINATION'
));

ALTER TABLE medical_documents DROP CONSTRAINT ck_document_status;
ALTER TABLE medical_documents ADD CONSTRAINT ck_document_status CHECK (status IN (
    'PENDING','QUARANTINED','CLEAN','UPLOADED','REJECTED','SCAN_FAILED'
));

CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY,
    external_subject VARCHAR(255) UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    country VARCHAR(80) NOT NULL,
    whatsapp_number VARCHAR(32) NOT NULL,
    email VARCHAR(254),
    preferred_language VARCHAR(8) NOT NULL,
    time_zone VARCHAR(80),
    phone_verified_at TIMESTAMP WITH TIME ZONE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE medical_cases ADD COLUMN patient_id UUID;
ALTER TABLE medical_cases ADD COLUMN claimed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE medical_cases ADD CONSTRAINT fk_cases_patient FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE RESTRICT;
CREATE INDEX idx_cases_patient ON medical_cases(patient_id, created_at);

CREATE TABLE patient_representatives (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
    representative_subject VARCHAR(255) NOT NULL,
    relationship VARCHAR(80) NOT NULL,
    permissions VARCHAR(500) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(patient_id, representative_subject)
);

CREATE TABLE case_claim_challenges (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL,
    delivery_channel VARCHAR(20) NOT NULL,
    destination_hint VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_claim_attempts CHECK (attempts >= 0 AND max_attempts > 0)
);
CREATE INDEX idx_claim_case_active ON case_claim_challenges(case_id, expires_at);

CREATE TABLE practitioner_profiles (
    id UUID PRIMARY KEY,
    external_subject VARCHAR(255) UNIQUE,
    legal_name VARCHAR(160) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    registration_number VARCHAR(100),
    specialty VARCHAR(120),
    subspecialty VARCHAR(160),
    qualifications TEXT,
    appointments TEXT,
    hospital_privileges TEXT,
    languages VARCHAR(300),
    approved_procedures TEXT,
    indemnity_reference VARCHAR(255),
    contract_status VARCHAR(40),
    availability_status VARCHAR(40),
    expected_review_hours INTEGER,
    credentialing_status VARCHAR(40) NOT NULL,
    suspension_reason VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_practitioner_status CHECK (credentialing_status IN ('INVITED','PROFILE_INCOMPLETE','UNDER_REVIEW','VERIFIED','SUSPENDED','EXPIRED','REJECTED'))
);

CREATE TABLE practitioner_credentials (
    id UUID PRIMARY KEY,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE CASCADE,
    credential_type VARCHAR(80) NOT NULL,
    reference_number VARCHAR(160),
    source VARCHAR(500),
    evidence_document_id UUID REFERENCES medical_documents(id) ON DELETE RESTRICT,
    issued_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(255),
    status VARCHAR(40) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_credentials_expiry ON practitioner_credentials(status, expires_at);

CREATE TABLE case_assignments (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    assignee_subject VARCHAR(255) NOT NULL,
    assignee_role VARCHAR(40) NOT NULL,
    assignment_type VARCHAR(30) NOT NULL,
    pod VARCHAR(100),
    status VARCHAR(30) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    assigned_by VARCHAR(255) NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_assignment_status CHECK (status IN ('PENDING','ACTIVE','DECLINED','ENDED'))
);
CREATE INDEX idx_assignments_subject ON case_assignments(assignee_subject, status, assigned_at);
CREATE INDEX idx_assignments_case ON case_assignments(case_id, status);

CREATE TABLE case_status_history (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    from_status VARCHAR(40),
    to_status VARCHAR(40) NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    reason VARCHAR(1000),
    correlation_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_case_history_case ON case_status_history(case_id, created_at);

CREATE TABLE case_tasks (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    task_type VARCHAR(80) NOT NULL,
    title VARCHAR(240) NOT NULL,
    description TEXT,
    owner_subject VARCHAR(255),
    owner_role VARCHAR(40),
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    blocking BOOLEAN NOT NULL DEFAULT FALSE,
    due_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    completion_evidence TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_task_status CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
    CONSTRAINT ck_task_priority CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'))
);
CREATE INDEX idx_tasks_owner ON case_tasks(owner_subject, status, due_at);
CREATE INDEX idx_tasks_case ON case_tasks(case_id, status);

CREATE TABLE case_messages (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    thread_type VARCHAR(40) NOT NULL,
    sender_subject VARCHAR(255) NOT NULL,
    sender_role VARCHAR(40) NOT NULL,
    body TEXT NOT NULL,
    language VARCHAR(8) NOT NULL,
    internal_only BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_messages_case ON case_messages(case_id, created_at);

CREATE TABLE clinical_review_versions (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    practitioner_id UUID NOT NULL REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL,
    case_summary TEXT,
    suitability VARCHAR(80),
    missing_information TEXT,
    recommended_investigations TEXT,
    recommended_treatment TEXT,
    alternatives TEXT,
    risks_and_limitations TEXT,
    expected_sequence TEXT,
    expected_duration VARCHAR(200),
    follow_up_recommendation TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(case_id, version_number),
    CONSTRAINT ck_review_status CHECK (status IN ('DRAFT','INFORMATION_REQUIRED','APPROVED','SUPERSEDED'))
);

CREATE TABLE proposals (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL UNIQUE REFERENCES medical_cases(id) ON DELETE RESTRICT,
    current_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE proposal_versions (
    id UUID PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL,
    status VARCHAR(40) NOT NULL,
    language VARCHAR(8) NOT NULL,
    clinical_review_id UUID NOT NULL REFERENCES clinical_review_versions(id) ON DELETE RESTRICT,
    operational_plan TEXT,
    currency VARCHAR(3),
    included_services TEXT,
    excluded_services TEXT,
    payment_terms TEXT,
    refund_terms TEXT,
    disclaimers TEXT,
    valid_until TIMESTAMP WITH TIME ZONE,
    clinical_approved_by VARCHAR(255),
    clinical_approved_at TIMESTAMP WITH TIME ZONE,
    operations_completed_by VARCHAR(255),
    operations_completed_at TIMESTAMP WITH TIME ZONE,
    finance_approved_by VARCHAR(255),
    finance_approved_at TIMESTAMP WITH TIME ZONE,
    released_by VARCHAR(255),
    released_at TIMESTAMP WITH TIME ZONE,
    viewed_at TIMESTAMP WITH TIME ZONE,
    superseded_at TIMESTAMP WITH TIME ZONE,
    html_snapshot TEXT,
    pdf_object_key VARCHAR(300),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(proposal_id, version_number),
    CONSTRAINT ck_proposal_status CHECK (status IN ('CLINICAL_DRAFT','CLINICALLY_APPROVED','OPERATIONS_COMPLETED','FINANCE_APPROVED','RELEASED','VIEWED','ACCEPTED','DECLINED','REVISION_REQUESTED','EXPIRED','SUPERSEDED'))
);

CREATE TABLE proposal_items (
    id UUID PRIMARY KEY,
    proposal_version_id UUID NOT NULL REFERENCES proposal_versions(id) ON DELETE CASCADE,
    category VARCHAR(40) NOT NULL,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(12,2) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    optional BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE proposal_decisions (
    id UUID PRIMARY KEY,
    proposal_version_id UUID NOT NULL REFERENCES proposal_versions(id) ON DELETE RESTRICT,
    patient_subject VARCHAR(255) NOT NULL,
    decision VARCHAR(30) NOT NULL,
    selected_optional_item_ids TEXT,
    comment TEXT,
    reauthenticated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_proposal_decision CHECK (decision IN ('ACCEPTED','DECLINED','REVISION_REQUESTED'))
);

CREATE TABLE travel_plans (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL UNIQUE REFERENCES medical_cases(id) ON DELETE RESTRICT,
    planned_arrival TIMESTAMP WITH TIME ZONE,
    confirmed_arrival TIMESTAMP WITH TIME ZONE,
    visa_status VARCHAR(80),
    flight_details TEXT,
    airport_reception TEXT,
    accommodation TEXT,
    local_transport TEXT,
    companion_details TEXT,
    facility VARCHAR(300),
    exceptions TEXT,
    responsible_subject VARCHAR(255),
    status VARCHAR(40) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE treatment_episodes (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    facility VARCHAR(300) NOT NULL,
    practitioner_id UUID REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    start_at TIMESTAMP WITH TIME ZONE,
    end_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(40) NOT NULL,
    planned_procedures TEXT,
    actual_procedures TEXT,
    milestones TEXT,
    complications TEXT,
    discharge_ready BOOLEAN NOT NULL DEFAULT FALSE,
    discharge_document_id UUID REFERENCES medical_documents(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE follow_up_plans (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    treatment_episode_id UUID REFERENCES treatment_episodes(id) ON DELETE RESTRICT,
    practitioner_id UUID REFERENCES practitioner_profiles(id) ON DELETE RESTRICT,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    mode VARCHAR(40) NOT NULL,
    required_tests TEXT,
    instructions TEXT,
    status VARCHAR(30) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    closure_reason VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_follow_up_status CHECK (status IN ('PLANNED','DUE','COMPLETED','MISSED','CANCELLED'))
);

CREATE TABLE consent_records (
    id UUID PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE RESTRICT,
    case_id UUID REFERENCES medical_cases(id) ON DELETE RESTRICT,
    consent_type VARCHAR(60) NOT NULL,
    policy_version VARCHAR(40) NOT NULL,
    language VARCHAR(8) NOT NULL,
    exact_text TEXT NOT NULL,
    purpose VARCHAR(500) NOT NULL,
    scope VARCHAR(500) NOT NULL,
    channel VARCHAR(40) NOT NULL,
    captured_by VARCHAR(255) NOT NULL,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_until TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE notification_outbox (
    id UUID PRIMARY KEY,
    notification_type VARCHAR(60) NOT NULL,
    channel VARCHAR(30) NOT NULL,
    destination VARCHAR(320) NOT NULL,
    template_key VARCHAR(100) NOT NULL,
    template_data TEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_error_code VARCHAR(100),
    provider_reference VARCHAR(255),
    idempotency_key VARCHAR(160) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    delivered_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_outbox_status CHECK (status IN ('PENDING','PROCESSING','DELIVERED','RETRY','DEAD_LETTER'))
);
CREATE INDEX idx_outbox_delivery ON notification_outbox(status, next_attempt_at);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    case_id UUID REFERENCES medical_cases(id) ON DELETE RESTRICT,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    outcome VARCHAR(30) NOT NULL,
    reason VARCHAR(1000),
    correlation_id VARCHAR(128),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_audit_case ON audit_events(case_id, occurred_at);
CREATE INDEX idx_audit_actor ON audit_events(actor_subject, occurred_at);

CREATE TABLE idempotency_records (
    id UUID PRIMARY KEY,
    actor_subject VARCHAR(255) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(160) NOT NULL,
    request_hash VARCHAR(128) NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(actor_subject, operation, idempotency_key)
);
