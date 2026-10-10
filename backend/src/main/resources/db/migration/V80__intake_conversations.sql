-- S3 of patient WhatsApp communication (docs/patient-communication-whatsapp-design.md §4.1–4.2): a WhatsApp conversation
-- with someone who has no open case. Each has at most one owner coordinator (chosen by intake routing, claimed from the
-- intake queue, or reassigned by a lead or manager); only the owner, or their reply cover, answers.

-- Which coordinators take intake conversations, how many at once, and when they are working.
CREATE TABLE coordinator_intake_settings (
    subject VARCHAR(255) PRIMARY KEY REFERENCES workforce_people(subject),
    intake_eligible BOOLEAN NOT NULL,
    max_intake INTEGER NOT NULL,
    schedule TEXT,
    time_zone VARCHAR(64),
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_intake_settings_maximum CHECK (max_intake BETWEEN 0 AND 1000)
);

CREATE TABLE intake_conversations (
    id UUID PRIMARY KEY,
    wa_digits VARCHAR(20) NOT NULL,
    profile_name TEXT,
    language VARCHAR(8) NOT NULL,
    status VARCHAR(20) NOT NULL,
    owner_subject VARCHAR(255) REFERENCES workforce_people(subject),
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_inbound_at TIMESTAMP WITH TIME ZONE,
    last_outbound_at TIMESTAMP WITH TIME ZONE,
    window_expires_at TIMESTAMP WITH TIME ZONE,
    linked_case_id UUID REFERENCES medical_cases(id),
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_reason VARCHAR(40),
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_intake_conversation_status CHECK (status IN ('OPEN','CLOSED','LINKED'))
);
CREATE INDEX ix_intake_conversations_sender ON intake_conversations(wa_digits, status);
CREATE INDEX ix_intake_conversations_owner ON intake_conversations(owner_subject, status);

-- Files received in an intake conversation: inspected and stored before anyone can open them; they become case
-- documents when the conversation is linked to a case.
CREATE TABLE conversation_media (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES intake_conversations(id),
    object_key VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE intake_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES intake_conversations(id),
    direction VARCHAR(10) NOT NULL,
    sender_subject VARCHAR(255),
    kind VARCHAR(20) NOT NULL,
    body TEXT NOT NULL,
    language VARCHAR(8) NOT NULL,
    external_message_id VARCHAR(255),
    media_id UUID REFERENCES conversation_media(id),
    attachment_status VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_intake_message_direction CHECK (direction IN ('IN','OUT')),
    CONSTRAINT ck_intake_message_kind CHECK (kind IN ('TEXT','TEMPLATE'))
);
CREATE UNIQUE INDEX uq_intake_messages_external ON intake_messages(external_message_id);
CREATE INDEX ix_intake_messages_conversation ON intake_messages(conversation_id, created_at);

-- Messages kept UNMATCHED before intake conversations existed are filed now.
UPDATE whatsapp_inbound_messages SET status = 'PENDING', next_attempt_at = received_at WHERE status = 'UNMATCHED';
