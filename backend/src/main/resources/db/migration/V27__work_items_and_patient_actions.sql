-- Operational workflow layer: who must act next, what a staff member must do, and what exactly was
-- requested from a patient. Work items themselves stay in the existing case_tasks table.

-- Responsibility is tracked separately from the journey stage: a case waiting on the patient is still
-- in its clinical stage. Existing rows default to STAFF, which is what an in-flight case means today.
ALTER TABLE medical_cases ADD COLUMN waiting_on VARCHAR(20) NOT NULL DEFAULT 'STAFF';
ALTER TABLE medical_cases ADD COLUMN waiting_reason VARCHAR(240);
ALTER TABLE medical_cases ADD COLUMN waiting_since TIMESTAMP WITH TIME ZONE;
ALTER TABLE medical_cases ADD CONSTRAINT ck_case_waiting_on
    CHECK (waiting_on IN ('STAFF','PATIENT','CONSULTANT','HOSPITAL','TRAVEL_TEAM','PAYMENT','EXTERNAL','NONE'));
UPDATE medical_cases SET waiting_on='PATIENT', waiting_reason='Information requested from the patient'
 WHERE status='INFORMATION_REQUIRED';
UPDATE medical_cases SET waiting_on='CONSULTANT', waiting_reason='Awaiting the clinical recommendation'
 WHERE status IN ('CONSULTANT_ASSIGNMENT_PENDING','CONSULTANT_REVIEW');
UPDATE medical_cases SET waiting_on='PATIENT', waiting_reason='Awaiting the patient decision'
 WHERE status='PATIENT_DECISION';
UPDATE medical_cases SET waiting_on='PAYMENT', waiting_reason='Awaiting the coordination deposit'
 WHERE status='ACCEPTED';
UPDATE medical_cases SET waiting_on='NONE'
 WHERE status IN ('CLOSED','CANCELLED','DECLINED','CLINICALLY_NOT_SUITABLE','EXPIRED');

-- In-app staff notifications. The existing notification_outbox is a delivery queue with no recipient
-- identity or read state, so it cannot serve as the staff notification centre.
CREATE TABLE staff_notifications (
    id UUID PRIMARY KEY,
    recipient_subject VARCHAR(255) NOT NULL,
    case_id UUID REFERENCES medical_cases(id) ON DELETE CASCADE,
    task_id UUID REFERENCES case_tasks(id) ON DELETE SET NULL,
    event_type VARCHAR(60) NOT NULL,
    title TEXT NOT NULL,
    context TEXT,
    idempotency_key VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_staff_notification_key UNIQUE (idempotency_key)
);
CREATE INDEX idx_staff_notifications_inbox ON staff_notifications(recipient_subject, created_at);

-- Exactly what was requested from the patient, and exactly what came back — with provenance, because a
-- coordinator may record an answer the patient gave over WhatsApp or by phone.
CREATE TABLE patient_action_items (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES case_tasks(id) ON DELETE CASCADE,
    item_kind VARCHAR(20) NOT NULL,
    item_code VARCHAR(60) NOT NULL,
    label TEXT NOT NULL,
    required BOOLEAN NOT NULL DEFAULT TRUE,
    response_text TEXT,
    document_id UUID,
    source VARCHAR(20),
    channel VARCHAR(20),
    recorded_by VARCHAR(255),
    completed_at TIMESTAMP WITH TIME ZONE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_action_item_kind CHECK (item_kind IN ('INFORMATION','DOCUMENT')),
    CONSTRAINT ck_action_item_source CHECK (source IS NULL OR source IN ('PATIENT_PORTAL','PATIENT_REPORTED')),
    CONSTRAINT ck_action_item_channel CHECK (channel IS NULL OR channel IN ('SECURE_LINK','WHATSAPP','PHONE','ASSISTED'))
);
CREATE INDEX idx_patient_action_items_task ON patient_action_items(task_id, sort_order);
