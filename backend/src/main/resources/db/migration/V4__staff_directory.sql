-- Admin-managed staff directory (coordinators and other internal staff).
-- The display name is stored encrypted at rest; the row id / external subject is the
-- non-sensitive identifier used elsewhere, and the name is resolved (decrypted) on read.

CREATE TABLE staff_members (
    id UUID PRIMARY KEY,
    external_subject VARCHAR(255) UNIQUE,
    staff_role VARCHAR(40) NOT NULL,
    display_name_encrypted TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_staff_role CHECK (staff_role IN ('COORDINATOR','COORDINATOR_LEAD','OPERATIONS','FINANCE'))
);
