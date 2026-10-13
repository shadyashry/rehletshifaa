package com.rehletshifaa.authority.domain;

/**
 * The single role vocabulary. Workforce roles are granted by assignment rows; population roles are implied by the
 * population record (consultant, delegation, patient link). There is no lead role: leading is a team relationship.
 */
public enum Role {
    SYSTEM_ADMINISTRATOR(Kind.WORKFORCE, "PLATFORM_ADMINISTRATION", null),
    CONSULTANT_OPERATIONS_MANAGER(Kind.WORKFORCE, "CONSULTANT_OPERATIONS", null),
    CREDENTIAL_VERIFIER(Kind.WORKFORCE, "CREDENTIALING", null),
    CARE_COORDINATION_MANAGER(Kind.WORKFORCE, "CARE_COORDINATION", null),
    COORDINATOR(Kind.WORKFORCE, "CARE_COORDINATION", "COORDINATOR"),
    OPERATIONS_MANAGER(Kind.WORKFORCE, "OPERATIONS", null),
    OPERATIONS(Kind.WORKFORCE, "OPERATIONS", "OPERATIONS"),
    FINANCE_MANAGER(Kind.WORKFORCE, "FINANCE", null),
    FINANCE(Kind.WORKFORCE, "FINANCE", "FINANCE"),
    CREDENTIALING_MANAGER(Kind.WORKFORCE, "CREDENTIALING", null),
    JOURNEY_MANAGER(Kind.WORKFORCE, "CARE_JOURNEY", null),
    JOURNEY_APPROVER(Kind.WORKFORCE, "CARE_JOURNEY", null),
    COMPLIANCE_AUDITOR(Kind.WORKFORCE, "COMPLIANCE", null),
    SUPPORT_AGENT(Kind.WORKFORCE, "SUPPORT", null),
    SUPPORT_MANAGER(Kind.WORKFORCE, "SUPPORT", null),
    PATIENT_IDENTITY_REVIEWER(Kind.WORKFORCE, "PATIENT_IDENTITY", null),
    CONSULTANT(Kind.POPULATION, null, "DOCTOR"),
    PRACTICE_MANAGER(Kind.POPULATION, null, null),
    PATIENT(Kind.POPULATION, null, null),
    PATIENT_REPRESENTATIVE(Kind.POPULATION, null, null),
    ACCOUNT_HOLDER(Kind.POPULATION, null, null);

    public enum Kind { WORKFORCE, POPULATION }

    private final Kind kind;
    private final String function;
    private final String caseAssignmentRole;

    Role(Kind kind, String function, String caseAssignmentRole) {
        this.kind = kind;
        this.function = function;
        this.caseAssignmentRole = caseAssignmentRole;
    }

    public Kind kind() { return kind; }

    /**
     * D1 / MFA-1 (owner, 2026-10-14): whoever works on cases or the platform signs in with a second factor — every workforce
     * role, Consultants and practice managers (they read medical records). Patients, representatives and bare account holders
     * do not.
     */
    public boolean secondFactorAtSignIn() { return kind == Kind.WORKFORCE || this == CONSULTANT || this == PRACTICE_MANAGER; }

    /** MFA-1: roles that hold money, credentials or the platform itself sign in and confirm with a phishing-resistant passkey. */
    public boolean privileged() {
        return this == SYSTEM_ADMINISTRATOR || this == CREDENTIAL_VERIFIER || this == CREDENTIALING_MANAGER || this == FINANCE || this == FINANCE_MANAGER;
    }
    /** The workforce function the role belongs to (WF-03); null for population roles. */
    public String function() { return function; }
    /** The case-assignment role this role works under ({@code case_assignments.assignee_role}); null if none. */
    public String caseAssignmentRole() { return caseAssignmentRole; }
}
