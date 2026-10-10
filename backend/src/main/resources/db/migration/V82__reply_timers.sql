-- S5 of patient WhatsApp communication (docs/patient-communication-whatsapp-design.md §4.6–4.8): service levels, reply
-- timers on working time, the out-of-hours auto-reply and idle close of intake conversations.

-- One row: when the team works and how fast a waiting patient must be answered (R10, R11).
CREATE TABLE conversation_settings (
    id INTEGER PRIMARY KEY,
    business_hours TEXT NOT NULL,
    time_zone VARCHAR(64) NOT NULL,
    first_response_minutes INTEGER NOT NULL,
    escalation_minutes INTEGER NOT NULL,
    idle_close_hours INTEGER NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_conversation_settings_single CHECK (id = 1),
    CONSTRAINT ck_conversation_settings_times CHECK (first_response_minutes > 0 AND escalation_minutes > first_response_minutes AND idle_close_hours > 0)
);
INSERT INTO conversation_settings(id, business_hours, time_zone, first_response_minutes, escalation_minutes, idle_close_hours, updated_by, updated_at, revision)
VALUES (1, '{"SATURDAY":["10:00-20:00"],"SUNDAY":["10:00-20:00"],"MONDAY":["10:00-20:00"],"TUESDAY":["10:00-20:00"],"WEDNESDAY":["10:00-20:00"],"THURSDAY":["10:00-20:00"]}',
        'Africa/Cairo', 30, 60, 72, 'SYSTEM', CURRENT_TIMESTAMP, 0);

-- "A patient is waiting for an answer": one row per conversation (a case's patient thread or an intake conversation),
-- open while resolved_at is null; reminder and escalation times are on working time.
CREATE TABLE reply_obligations (
    id UUID PRIMARY KEY,
    target_type VARCHAR(10) NOT NULL,
    target_id UUID NOT NULL,
    awaiting_since TIMESTAMP WITH TIME ZONE NOT NULL,
    remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
    escalate_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reminded_at TIMESTAMP WITH TIME ZONE,
    escalated_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_reply_obligation_target UNIQUE (target_type, target_id),
    CONSTRAINT ck_reply_obligation_target CHECK (target_type IN ('CASE','INTAKE'))
);
CREATE INDEX ix_reply_obligations_remind ON reply_obligations(resolved_at, remind_at);
CREATE INDEX ix_reply_obligations_escalate ON reply_obligations(resolved_at, escalate_at);

ALTER TABLE intake_conversations ADD COLUMN last_auto_reply_at TIMESTAMP WITH TIME ZONE;
