-- P2-24 (B-07): enforce the coordination-deposit refund window from an explicit first confirmed appointment.
ALTER TABLE deposit_policies ADD COLUMN refund_cutoff_days INTEGER NOT NULL DEFAULT 10;
ALTER TABLE deposit_policies ADD CONSTRAINT ck_deposit_policies_refund_cutoff CHECK (refund_cutoff_days BETWEEN 0 AND 365);

-- Appointment confirmation is a superseding case fact. Refund decisions use the latest fact rather than inferring it
-- from mutable itinerary text or a workflow stage.
ALTER TABLE case_evidence DROP CONSTRAINT ck_case_evidence_kind;
ALTER TABLE case_evidence ADD CONSTRAINT ck_case_evidence_kind CHECK (kind IN ('FACILITY_ADMISSION_LETTER', 'PRICE_VARIANCE_CHECK',
    'ARRIVAL_ATTESTED', 'PATIENT_ARRIVED', 'BALANCE_EVIDENCED', 'FEE_BALANCE_RECEIVED', 'ADMISSION_NUMBER', 'POINT_OF_NO_RETURN',
    'EMERGENCY_ADMISSION_OVERRIDE', 'MILESTONE_ADMITTED', 'MILESTONE_PROCEDURE_STARTED', 'MILESTONE_PROCEDURE_COMPLETED', 'MILESTONE_ICU',
    'MILESTONE_WARD', 'MILESTONE_COMPLICATION', 'MILESTONE_STABLE', 'MILESTONE_DISCHARGE_PLANNED', 'INTERIM_BILL', 'CHANGE_ORDER',
    'DISCHARGE_SUMMARY', 'MEDICATION_LIST', 'OPERATIVE_NOTE', 'IMPLANT_RECORD', 'FIT_TO_FLY', 'HANDOVER_LETTER', 'FINAL_INVOICE',
    'RECONCILIATION', 'RETURN_CONFIRMED', 'DEPARTURE_CONFIRMED', 'FOLLOW_UP_CONTACT', 'CHECK_IN', 'FOLLOW_UP_WINDOW_CLOSED',
    'FIRST_CONFIRMED_APPOINTMENT'));

-- The owner has not approved a non-zero minimum yet. Zero preserves today's pricing while making the floor an
-- explicit, versioned Finance setting rather than a future code change.
ALTER TABLE commercial_policies ADD COLUMN minimum_coordination_fee_egp NUMERIC(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_minimum_fee CHECK (minimum_coordination_fee_egp >= 0);

-- Guaranteed-refund exits must be distinguishable from patient cancellation so Finance receives the correct obligation.
ALTER TABLE case_exit_reasons DROP CONSTRAINT ck_case_exit_reasons_reason;
ALTER TABLE case_exit_reasons ADD CONSTRAINT ck_case_exit_reasons_reason CHECK (reason IN ('PATIENT_WITHDREW', 'HOSPITAL_REFUSED',
    'MEDICAL_CONTRAINDICATION', 'PATIENT_DECEASED', 'NO_SHOW', 'DEPOSIT_UNPAID', 'NO_FOLLOW_UP_NEEDED', 'INFORMATION_NOT_PROVIDED',
    'FOLLOW_UP_COMPLETED', 'PLATFORM_CANCELLED', 'CONSULTANT_CANCELLED'));
