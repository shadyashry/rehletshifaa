-- P1-6 session 2 (review 2026-10-14, A-10): an information request the patient has not answered is chased, then closed.
-- reminder_cycle_at: when the open request was last asked (created or renewed); the reminder days count from it.
-- reminder_step: how far the cycle has gone (0 none, 1 first reminder, 2 second reminder, 3 coordinator alerted), moved
-- by guarded updates so each message is sent once. Both are unused on every other task.
ALTER TABLE case_tasks ADD COLUMN reminder_cycle_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE case_tasks ADD COLUMN reminder_step INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE case_tasks ADD CONSTRAINT ck_case_tasks_reminder_step CHECK (reminder_step BETWEEN 0 AND 3);

CREATE INDEX idx_case_tasks_reminder ON case_tasks(task_type, status, reminder_cycle_at);

-- A case parked on an unanswered request is cancelled after 30 days through CaseExitService with this typed reason.
ALTER TABLE case_exit_reasons DROP CONSTRAINT ck_case_exit_reasons_reason;
ALTER TABLE case_exit_reasons ADD CONSTRAINT ck_case_exit_reasons_reason CHECK (reason IN ('PATIENT_WITHDREW', 'HOSPITAL_REFUSED',
    'MEDICAL_CONTRAINDICATION', 'PATIENT_DECEASED', 'NO_SHOW', 'DEPOSIT_UNPAID', 'NO_FOLLOW_UP_NEEDED', 'INFORMATION_NOT_PROVIDED'));
