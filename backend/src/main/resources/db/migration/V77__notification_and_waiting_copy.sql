-- Staff notifications and the case's "waiting for" reason carry their wording as a code too (docs/ux-redesign/STATUS.md
-- pass 3 follow-up), like work items in V76: the portal words them in the reader's language; the English text stays
-- for e-mail, audit and unknown codes. Notification parameters can hold names and quoted notes, so they are encrypted.
-- A waiting-reason code has no parameters: it names a fixed reason, a work item's code ("WORK:<code>") or a patient
-- readiness step ("PATIENT_STEP:<code>").

ALTER TABLE staff_notifications ADD COLUMN copy_code VARCHAR(80);
ALTER TABLE staff_notifications ADD COLUMN copy_params TEXT;
ALTER TABLE medical_cases ADD COLUMN waiting_reason_code VARCHAR(120);
