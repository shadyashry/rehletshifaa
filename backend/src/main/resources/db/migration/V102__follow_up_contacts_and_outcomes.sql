-- P1-18 session 1 (post-deposit design §5 stage 6, decision D-G; architecture §4.6, §5.6). Pre-production clean cutover: new
-- tables state the final design, no backfill. The plan's "V99" name was stale; V102 is the next free number.

-- 1) The ledger's follow-up kinds: a follow-up contact the Consultant recorded (held or missed), a coordinator's check-in (day 3,
--    14 or 30 after discharge; the reference is the point) and the free follow-up window closing (written by the scheduler).
ALTER TABLE case_evidence DROP CONSTRAINT ck_case_evidence_kind;
ALTER TABLE case_evidence ADD CONSTRAINT ck_case_evidence_kind CHECK (kind IN ('FACILITY_ADMISSION_LETTER', 'PRICE_VARIANCE_CHECK',
    'ARRIVAL_ATTESTED', 'PATIENT_ARRIVED', 'BALANCE_EVIDENCED', 'FEE_BALANCE_RECEIVED', 'ADMISSION_NUMBER', 'POINT_OF_NO_RETURN',
    'EMERGENCY_ADMISSION_OVERRIDE', 'MILESTONE_ADMITTED', 'MILESTONE_PROCEDURE_STARTED', 'MILESTONE_PROCEDURE_COMPLETED', 'MILESTONE_ICU',
    'MILESTONE_WARD', 'MILESTONE_COMPLICATION', 'MILESTONE_STABLE', 'MILESTONE_DISCHARGE_PLANNED', 'INTERIM_BILL', 'CHANGE_ORDER',
    'DISCHARGE_SUMMARY', 'MEDICATION_LIST', 'OPERATIVE_NOTE', 'IMPLANT_RECORD', 'FIT_TO_FLY', 'HANDOVER_LETTER', 'FINAL_INVOICE',
    'RECONCILIATION', 'RETURN_CONFIRMED', 'DEPARTURE_CONFIRMED', 'FOLLOW_UP_CONTACT', 'CHECK_IN', 'FOLLOW_UP_WINDOW_CLOSED'));

-- 2) D-G: the follow-up included in the package lasts this many days from discharge (30 by default); paid teleconsultation after
--    it is P2-25. Finance Managers change it per care area; left out it carries over. A discharged case keeps the days it was
--    discharged under (follow_up_windows.free_days).
ALTER TABLE commercial_policies ADD COLUMN follow_up_free_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE commercial_policies ADD CONSTRAINT ck_commercial_policies_follow_up_days CHECK (follow_up_free_days >= 7 AND follow_up_free_days <= 90);

-- 3) The outcome questions reach the patient on a secure link of its own purpose (the same one-time-code flow as the status link).
ALTER TABLE case_access_links DROP CONSTRAINT ck_case_access_purpose;
ALTER TABLE case_access_links ADD CONSTRAINT ck_case_access_purpose CHECK (purpose IN ('STATUS', 'INFORMATION_RESPONSE', 'ONBOARDING', 'OUTCOME'));

-- 4) A case closed once its follow-up is over (FOLLOW_UP -> CLOSED, by the scheduler) leaves its own typed exit reason.
ALTER TABLE case_exit_reasons DROP CONSTRAINT ck_case_exit_reasons_reason;
ALTER TABLE case_exit_reasons ADD CONSTRAINT ck_case_exit_reasons_reason CHECK (reason IN ('PATIENT_WITHDREW', 'HOSPITAL_REFUSED',
    'MEDICAL_CONTRAINDICATION', 'PATIENT_DECEASED', 'NO_SHOW', 'DEPOSIT_UNPAID', 'NO_FOLLOW_UP_NEEDED', 'INFORMATION_NOT_PROVIDED',
    'FOLLOW_UP_COMPLETED'));

-- 5) The CLOSURE statement: the patient's account when the case closes (refunds made since discharge included).
ALTER TABLE statements DROP CONSTRAINT ck_statements_kind;
ALTER TABLE statements ADD CONSTRAINT ck_statements_kind CHECK (kind IN ('DISCHARGE', 'CLOSURE'));

-- 6) The follow-up window of a discharged case (one per case): the day-3/14/30 check-ins and the day-30/90 outcome questions
--    count from discharged_at; the window closes at ends_at (discharged_at + free_days, frozen at discharge) unless a reported
--    complication still waits for the Consultant. completed_at: nothing more is scheduled (the day-90 question was asked, or the
--    case was cancelled).
CREATE TABLE follow_up_windows (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    discharged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    free_days INTEGER NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_follow_up_windows_case UNIQUE (case_id),
    CONSTRAINT ck_follow_up_windows_days CHECK (free_days >= 7 AND free_days <= 90 AND ends_at > discharged_at),
    CONSTRAINT ck_follow_up_windows_closed CHECK (closed_at IS NULL OR closed_at >= discharged_at)
);

-- 7) The follow-up contacts (architecture §4.6): the schedule the Consultant keeps, the first from the follow-up plan, then as
--    they add. A contact is held (DONE) or missed (MISSED, the coordinator rebooks) with a ledger row, or cancelled; the note
--    (clinical) is encrypted. The patient is reminded once, the day before.
CREATE TABLE follow_up_contacts (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    follow_up_plan_id UUID NOT NULL REFERENCES follow_up_plans(id),
    origin VARCHAR(10) NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    mode VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    reminder_sent_at TIMESTAMP WITH TIME ZONE,
    recorded_by VARCHAR(255),
    recorded_at TIMESTAMP WITH TIME ZONE,
    note TEXT,
    evidence_id UUID REFERENCES case_evidence(id),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_follow_up_contacts_origin CHECK (origin IN ('PLAN', 'ADDED')),
    CONSTRAINT ck_follow_up_contacts_mode CHECK (mode IN ('VIDEO', 'PHONE', 'IN_PERSON')),
    CONSTRAINT ck_follow_up_contacts_status CHECK (status IN ('SCHEDULED', 'DONE', 'MISSED', 'CANCELLED')),
    CONSTRAINT ck_follow_up_contacts_recorded CHECK ((status = 'SCHEDULED') = (recorded_at IS NULL) AND (recorded_at IS NULL) = (recorded_by IS NULL)
        AND (status IN ('DONE', 'MISSED')) = (evidence_id IS NOT NULL))
);
CREATE INDEX ix_follow_up_contacts_case ON follow_up_contacts(case_id, status, due_at);
CREATE INDEX ix_follow_up_contacts_plan ON follow_up_contacts(follow_up_plan_id);

-- 8) The patient's outcome at day 30 and day 90 (architecture §4.6; PROMs-light). Health data, PDPL sensitive: read by the case's
--    Consultant (all of it) and coordinator (scores and flags, not the free text); a reported complication is also copied, as the
--    incident's summary, to the Care Coordination Manager who owns the incident and to Compliance (adverse-event governance).
--    Never copied into audit, notifications or logs; the free text (the complication, the Consultant's review) is encrypted; the
--    0-10 scores and the complication flag stay plain (pseudonymous rows keyed by case) so the schema checks them and P1-19 can
--    count them. notice_version: the purpose notice the patient was shown above the questions. reported_role is PATIENT or, when
--    someone answers for them (declared on the secure link, or a representative signed in), PATIENT_REPRESENTATIVE. The row is
--    created when the question is asked; the answer is set once. A reported complication opens an incident (incident_id) and
--    waits for the Consultant's review.
CREATE TABLE case_outcomes (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES medical_cases(id),
    point VARCHAR(4) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    link_id UUID REFERENCES case_access_links(id),
    pain_score SMALLINT,
    function_score SMALLINT,
    satisfaction_score SMALLINT,
    complication BOOLEAN,
    complication_note TEXT,
    channel VARCHAR(20),
    reported_by VARCHAR(255),
    reported_role VARCHAR(40),
    reported_at TIMESTAMP WITH TIME ZONE,
    notice_version VARCHAR(40),
    incident_id UUID REFERENCES case_incidents(id),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_note TEXT,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uk_case_outcomes_point UNIQUE (case_id, point),
    CONSTRAINT ck_case_outcomes_point CHECK (point IN ('D30', 'D90')),
    CONSTRAINT ck_case_outcomes_answered CHECK ((reported_at IS NULL) = (pain_score IS NULL) AND (reported_at IS NULL) = (function_score IS NULL)
        AND (reported_at IS NULL) = (satisfaction_score IS NULL) AND (reported_at IS NULL) = (complication IS NULL)
        AND (reported_at IS NULL) = (channel IS NULL) AND (reported_at IS NULL) = (reported_by IS NULL)
        AND (reported_at IS NULL) = (reported_role IS NULL) AND (reported_at IS NULL) = (notice_version IS NULL)),
    CONSTRAINT ck_case_outcomes_scores CHECK ((pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10))
        AND (function_score IS NULL OR (function_score >= 0 AND function_score <= 10))
        AND (satisfaction_score IS NULL OR (satisfaction_score >= 0 AND satisfaction_score <= 10))),
    CONSTRAINT ck_case_outcomes_channel CHECK (channel IS NULL OR channel IN ('MY_CARE', 'SECURE_LINK')),
    CONSTRAINT ck_case_outcomes_role CHECK (reported_role IS NULL OR reported_role IN ('PATIENT', 'PATIENT_REPRESENTATIVE')),
    -- A complication says what happened, and only a complication is reviewed.
    CONSTRAINT ck_case_outcomes_complication CHECK ((complication IS NULL OR complication = FALSE OR complication_note IS NOT NULL)
        AND (complication = TRUE OR (incident_id IS NULL AND reviewed_at IS NULL))),
    CONSTRAINT ck_case_outcomes_reviewed CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL) AND (reviewed_at IS NULL) = (review_note IS NULL))
);
