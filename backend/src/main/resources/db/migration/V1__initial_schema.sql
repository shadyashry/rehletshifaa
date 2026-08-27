CREATE SEQUENCE case_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE medical_cases (
    id UUID PRIMARY KEY,
    case_number VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    country VARCHAR(80) NOT NULL,
    whatsapp_number VARCHAR(32) NOT NULL,
    condition_description VARCHAR(2000),
    preferred_language VARCHAR(8) NOT NULL,
    status VARCHAR(40) NOT NULL,
    consent_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_case_status CHECK (status IN ('DRAFT','NEW','COORDINATOR_REVIEW','READY_FOR_CONSULTANT','CONSULTANT_REVIEW','RECOMMENDATION_READY','PATIENT_DECISION','TREATMENT_COORDINATION','CLOSED'))
);

CREATE INDEX idx_cases_status_created ON medical_cases(status, created_at);
CREATE INDEX idx_cases_created_at ON medical_cases(created_at);

CREATE TABLE medical_documents (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id) ON DELETE RESTRICT,
    object_key VARCHAR(300) NOT NULL UNIQUE,
    original_file_name VARCHAR(255) NOT NULL,
    safe_file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_document_status CHECK (status IN ('PENDING','UPLOADED','REJECTED')),
    CONSTRAINT ck_document_size CHECK (size_bytes > 0)
);

CREATE INDEX idx_documents_case_id ON medical_documents(case_id);
CREATE INDEX idx_documents_status_created ON medical_documents(status, created_at);

