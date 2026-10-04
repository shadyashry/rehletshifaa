package com.rehletshifaa.authority.domain;

/**
 * Business actions. {@code stepUp} permissions additionally need interactive authentication within ten minutes.
 * The scope a permission is exercised under is decided per grant in {@link RolePolicy}.
 */
public enum Permission {
    // cases and work
    WORK_QUEUE_VIEW(false), COORDINATION_QUEUE(false), ROUTING_READ(false), ROUTING_CONFIGURE(true), ROUTING_ASSIGN(false), ASSIGNMENT_RESPOND(false), CASE_INTAKE(false), CASE_READ(false), CASE_COORDINATE(false), CASE_REASSIGN_COORDINATOR(false),
    CASE_MESSAGE(false), TASK_CREATE(false), TASK_WORK(false), TASK_SUPERVISE(false), REFERRAL_DECIDE(false),
    // clinical and fulfilment
    CLINICAL_REVIEW(false), SECOND_OPINION_SUBMIT(false), CLINICAL_APPROVE(true), OPERATIONS_FULFIL(false), FINANCE_SETTLE(true),
    CONSULTANT_CATALOG_MANAGE(false), COMMERCIAL_POLICY_MANAGE(true), COMMERCIAL_POLICY_READ(false), PAYMENT_RECORD(true),
    REFERENCE_DATA_READ(false),
    // patient self-service
    PATIENT_SELF_SERVICE(false), PATIENT_DECIDE(true), ACCOUNT_BINDING(false),
    // consultants, credentials, identity
    CONSULTANT_ONBOARD(true), CREDENTIAL_READ(false), CREDENTIAL_DECIDE(true), PATIENT_IDENTITY_REVIEW(true), PATIENT_IDENTITY_READ(false),
    CLINIC_MANAGE(false), CLINIC_APPROVE(true), CAPABILITY_DECIDE(true),
    // journeys
    JOURNEY_READ(false), JOURNEY_EDIT(false), JOURNEY_APPROVE(true),
    // platform administration
    WORKFORCE_READ(false), WORKFORCE_ADMINISTER(true), ACCESS_GOVERN(true), TEAM_MANAGE(false), STAFFING_REQUEST(false),
    AUDIT_READ(false), IDENTITY_OPERATIONS_READ(false), IDENTITY_OPERATIONS_MANAGE(true), SUPPORT_ACCOUNT(false),
    MFA_RESET_REQUEST(false), RECERTIFY(true),
    // Platform Account Owner relationship (never assignable as a role)
    EXECUTIVE_OVERVIEW_VIEW(false), EXECUTIVE_REVENUE_VIEW(false), EXECUTIVE_JOURNEY_ANALYTICS_VIEW(false),
    EXECUTIVE_CONSULTANT_ANALYTICS_VIEW(false), EXECUTIVE_OPERATIONS_ANALYTICS_VIEW(false),
    EXECUTIVE_WORKFORCE_ANALYTICS_VIEW(false), EXECUTIVE_PATIENT_EXPERIENCE_VIEW(false),
    EXECUTIVE_RISK_COMPLIANCE_VIEW(false), PLATFORM_GOVERNANCE_VIEW(false),
    ADMINISTRATOR_CHANGE_APPROVE(true), OWNER_TRANSFER_INITIATE(true), OWNER_RECOVERY_PARTICIPATE(true);

    private final boolean stepUp;

    Permission(boolean stepUp) { this.stepUp = stepUp; }

    public boolean stepUp() { return stepUp; }
}
