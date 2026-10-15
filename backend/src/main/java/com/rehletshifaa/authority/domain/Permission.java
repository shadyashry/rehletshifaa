package com.rehletshifaa.authority.domain;

/**
 * Business actions. {@code stepUp} permissions additionally need interactive authentication within ten minutes.
 * The scope a permission is exercised under is decided per grant in {@link RolePolicy}.
 */
public enum Permission {
    // cases and work
    WORK_QUEUE_VIEW(false), COORDINATION_QUEUE(false), COORDINATION_CASE_SUMMARY(false), ROUTING_READ(false), ROUTING_CONFIGURE(true), ROUTING_ASSIGN(false), ASSIGNMENT_RESPOND(false), CASE_INTAKE(false), CASE_READ(false),
    // the payment view of a case only (summary, deposit, current action): never its clinical record, documents or threads
    CASE_DEPOSIT_READ(false), CASE_COORDINATE(false), CASE_REASSIGN_COORDINATOR(false),
    CASE_MESSAGE(false), CASE_PATIENT_REPLY(false), REPLY_COVER_MANAGE(false),
    CONVERSATION_READ(false), CONVERSATION_REPLY(false), CONVERSATION_CLAIM(false), CONVERSATION_REASSIGN(false), TASK_CREATE(false), TASK_WORK(false), TASK_SUPERVISE(false), REFERRAL_DECIDE(false),
    // a patient's proposal decision, recorded by the owning coordinator after an assisted conversation (Arabic terms path)
    PROPOSAL_DECISION_RECORD(true),
    // clinical and fulfilment
    CLINICAL_REVIEW(false), SECOND_OPINION_SUBMIT(false), CLINICAL_APPROVE(true), OPERATIONS_FULFIL(false), FINANCE_SETTLE(true),
    CONSULTANT_CATALOG_MANAGE(false), COMMERCIAL_POLICY_MANAGE(true), COMMERCIAL_POLICY_READ(false), PAYMENT_RECORD(true),
    // P0-5 (B-02): facilities and their package catalogue. Consultant Operations maintains them; Finance approves a package
    // price range once, with a fresh sign-in, because an approved range later releases proposal lines without a Finance check.
    FACILITY_READ(false), FACILITY_MANAGE(false), FACILITY_PACKAGE_APPROVE(true),
    REFERENCE_DATA_READ(false),
    // patient self-service
    PATIENT_SELF_SERVICE(false), PATIENT_DECIDE(true), ACCOUNT_BINDING(false),
    /** DEP-3: the patient (or representative) enters the bank's transfer reference for their deposit; evidence, not a decision, so no step-up. */
    DEPOSIT_TRANSFER_REPORT(false),
    // P1-13 (A-06): incidents are raised by the case team or the patient, owned and resolved by a Care Coordination Manager,
    // read by managers and Compliance; a CLOSED case is reopened by a manager or the case's Consultant.
    INCIDENT_REPORT(false), INCIDENT_MANAGE(false), INCIDENT_READ(false), CASE_REOPEN(false),
    // P1-15 (D-B, D-C): the admission with the hospital. Operations reserves it and records the letter, the cashier receipt and the
    // admission number; Finance countersigns money evidence with a fresh sign-in; the case team reads the "Admission & money"
    // panel; the patient (or representative) confirms they have arrived.
    ADMISSION_READ(false), ADMISSION_MANAGE(false), EVIDENCE_COUNTERSIGN(true), ARRIVAL_REPORT(false),
    // P1-16 (D-E): treatment evidence. The Consultant (or Operations on their behalf) records milestones and the Consultant
    // countersigns Operations' with a fresh sign-in; the Consultant proposes change orders and Finance prices them (fresh sign-in).
    MILESTONE_RECORD(false), MILESTONE_COUNTERSIGN(true), CHANGE_ORDER_PROPOSE(false), CHANGE_ORDER_PRICE(true),
    // consultants, credentials, identity
    CONSULTANT_ONBOARD(true), CREDENTIAL_READ(false), CREDENTIAL_DECIDE(true), PATIENT_IDENTITY_REVIEW(true), PATIENT_IDENTITY_READ(false),
    CLINIC_MANAGE(false), CLINIC_APPROVE(true), CAPABILITY_DECIDE(true),
    // journeys
    JOURNEY_READ(false), JOURNEY_EDIT(false), JOURNEY_APPROVE(true), JOURNEY_ADMISSION_PAUSE(false),
    // platform administration
    WORKFORCE_READ(false), WORKFORCE_ADMINISTER(true), ACCESS_GOVERN(true), TEAM_MANAGE(false), STAFFING_REQUEST(false),
    AUDIT_READ(false), IDENTITY_OPERATIONS_READ(false), IDENTITY_OPERATIONS_MANAGE(true), SUPPORT_ACCOUNT(false),
    MFA_RESET_REQUEST(false), RECERTIFY(true);

    private final boolean stepUp;

    Permission(boolean stepUp) { this.stepUp = stepUp; }

    public boolean stepUp() { return stepUp; }
}
