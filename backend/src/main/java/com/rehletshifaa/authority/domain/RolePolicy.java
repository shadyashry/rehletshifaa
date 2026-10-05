package com.rehletshifaa.authority.domain;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rehletshifaa.authority.domain.Permission.*;
import static com.rehletshifaa.authority.domain.Role.*;
import static com.rehletshifaa.authority.domain.Scope.*;

/**
 * The only place a role gains a power. Reviewed like code; there are no editable permission templates.
 * A decision passes when any grant of an effective role for the permission has a matching scope.
 *
 * <p>Deliberately absent (SOD-07/08, INV-22): System Administrators have no case, clinical, credential or commercial
 * power; the Compliance and Audit Reviewer mutates nothing; Support never sees cases; there is no lead role, only the
 * {@link Scope#SUPERVISED} scope of the base role.</p>
 */
public final class RolePolicy {
    public record Grant(Role role, Permission permission, Scope scope) {}

    private static final List<Grant> GRANTS = List.of(
            // Care coordination
            g(COORDINATOR, WORK_QUEUE_VIEW, PLATFORM), g(COORDINATOR, COORDINATION_QUEUE, PLATFORM), g(COORDINATOR, CASE_INTAKE, CASE_UNCLAIMED),
            g(COORDINATOR, CASE_READ, CASE_ASSIGNED), g(COORDINATOR, CASE_READ, SUPERVISED),
            g(COORDINATOR, CASE_COORDINATE, CASE_OWNER), g(COORDINATOR, CASE_REASSIGN_COORDINATOR, SUPERVISED),
            g(COORDINATOR, CASE_MESSAGE, CASE_ASSIGNED), g(COORDINATOR, TASK_CREATE, CASE_OWNER), g(COORDINATOR, TASK_WORK, SELF),
            g(COORDINATOR, TASK_SUPERVISE, SUPERVISED), g(COORDINATOR, REFERRAL_DECIDE, CASE_OWNER),
            // Operations and finance
            g(OPERATIONS, WORK_QUEUE_VIEW, PLATFORM), g(OPERATIONS, ASSIGNMENT_RESPOND, CASE_OFFERED), g(OPERATIONS, CASE_READ, CASE_ASSIGNED), g(OPERATIONS, CASE_READ, SUPERVISED),
            g(OPERATIONS, CASE_MESSAGE, CASE_ASSIGNED), g(OPERATIONS, TASK_CREATE, CASE_ASSIGNED), g(OPERATIONS, TASK_WORK, SELF),
            g(OPERATIONS, TASK_SUPERVISE, SUPERVISED), g(OPERATIONS, OPERATIONS_FULFIL, CASE_ASSIGNED),
            g(FINANCE, WORK_QUEUE_VIEW, PLATFORM), g(FINANCE, ASSIGNMENT_RESPOND, CASE_OFFERED), g(FINANCE, CASE_READ, CASE_ASSIGNED), g(FINANCE, CASE_READ, SUPERVISED),
            g(FINANCE, CASE_MESSAGE, CASE_ASSIGNED), g(FINANCE, TASK_WORK, SELF), g(FINANCE, TASK_SUPERVISE, SUPERVISED),
            g(FINANCE, FINANCE_SETTLE, CASE_ASSIGNED), g(FINANCE, COMMERCIAL_POLICY_MANAGE, PLATFORM),
            g(FINANCE, COMMERCIAL_POLICY_READ, PLATFORM), g(FINANCE, PAYMENT_RECORD, PLATFORM), g(FINANCE, REFERENCE_DATA_READ, PLATFORM),
            g(COORDINATOR, REFERENCE_DATA_READ, PLATFORM), g(OPERATIONS, REFERENCE_DATA_READ, PLATFORM), g(CONSULTANT, REFERENCE_DATA_READ, PLATFORM),
            g(CARE_COORDINATION_MANAGER, REFERENCE_DATA_READ, PLATFORM), g(CONSULTANT_OPERATIONS_MANAGER, REFERENCE_DATA_READ, PLATFORM),
            g(CONSULTANT_OPERATIONS_MANAGER, COMMERCIAL_POLICY_READ, PLATFORM), g(COMPLIANCE_AUDITOR, COMMERCIAL_POLICY_READ, PLATFORM),
            // Consultants and their clinics
            g(CONSULTANT, WORK_QUEUE_VIEW, PLATFORM), g(CONSULTANT, ASSIGNMENT_RESPOND, CASE_OFFERED), g(CONSULTANT, CASE_READ, CASE_OFFERED), g(CONSULTANT, CASE_MESSAGE, CASE_ASSIGNED),
            g(CONSULTANT, TASK_CREATE, CASE_ASSIGNED), g(CONSULTANT, TASK_WORK, SELF), g(CONSULTANT, CLINICAL_REVIEW, CASE_ASSIGNED), g(CONSULTANT, SECOND_OPINION_SUBMIT, CASE_CONSULTED),
            g(CONSULTANT, CLINICAL_APPROVE, CASE_ASSIGNED), g(CONSULTANT, CLINIC_MANAGE, OWN_CLINIC), g(CONSULTANT, CLINIC_APPROVE, OWN_CLINIC),
            g(PRACTICE_MANAGER, CLINIC_MANAGE, DELEGATED_CLINIC),
            // Patients and representatives
            g(PATIENT, PATIENT_SELF_SERVICE, SELF), g(PATIENT, CASE_READ, OWN_PATIENT), g(PATIENT, CASE_MESSAGE, OWN_PATIENT),
            g(PATIENT, TASK_WORK, SELF), g(PATIENT, PATIENT_DECIDE, OWN_PATIENT),
            g(PATIENT_REPRESENTATIVE, PATIENT_SELF_SERVICE, SELF), g(PATIENT_REPRESENTATIVE, CASE_READ, OWN_PATIENT),
            g(PATIENT_REPRESENTATIVE, CASE_MESSAGE, OWN_PATIENT), g(PATIENT_REPRESENTATIVE, PATIENT_DECIDE, OWN_PATIENT),
            g(ACCOUNT_HOLDER, ACCOUNT_BINDING, SELF), g(ACCOUNT_HOLDER, MFA_RESET_REQUEST, SELF),
            // Consultant operations, credentialing, identity review
            g(CONSULTANT_OPERATIONS_MANAGER, CONSULTANT_ONBOARD, PLATFORM),
            g(CONSULTANT_OPERATIONS_MANAGER, CONSULTANT_CATALOG_MANAGE, PLATFORM),
            g(CONSULTANT_OPERATIONS_MANAGER, CREDENTIAL_READ, PLATFORM), g(CONSULTANT_OPERATIONS_MANAGER, TEAM_MANAGE, PLATFORM),
            g(CONSULTANT_OPERATIONS_MANAGER, STAFFING_REQUEST, PLATFORM),
            g(CREDENTIAL_VERIFIER, CREDENTIAL_READ, PLATFORM), g(CREDENTIAL_VERIFIER, CREDENTIAL_DECIDE, PLATFORM), g(CREDENTIAL_VERIFIER, CAPABILITY_DECIDE, PLATFORM),
            g(PATIENT_IDENTITY_REVIEWER, PATIENT_IDENTITY_REVIEW, PLATFORM), g(PATIENT_IDENTITY_REVIEWER, PATIENT_IDENTITY_READ, PLATFORM),
            // Care coordination management
            g(CARE_COORDINATION_MANAGER, TEAM_MANAGE, PLATFORM), g(CARE_COORDINATION_MANAGER, STAFFING_REQUEST, PLATFORM),
            g(CARE_COORDINATION_MANAGER, WORK_QUEUE_VIEW, PLATFORM), g(CARE_COORDINATION_MANAGER, COORDINATION_QUEUE, PLATFORM),
            g(CARE_COORDINATION_MANAGER, COORDINATION_CASE_SUMMARY, PLATFORM),
            g(CARE_COORDINATION_MANAGER, ROUTING_READ, PLATFORM), g(CARE_COORDINATION_MANAGER, ROUTING_CONFIGURE, PLATFORM),
            g(CARE_COORDINATION_MANAGER, ROUTING_ASSIGN, PLATFORM),
            // Other function managers: hierarchy and staffing only; no execution, clinical or decision authority.
            g(OPERATIONS_MANAGER, TEAM_MANAGE, PLATFORM), g(OPERATIONS_MANAGER, STAFFING_REQUEST, PLATFORM),
            g(FINANCE_MANAGER, TEAM_MANAGE, PLATFORM), g(FINANCE_MANAGER, STAFFING_REQUEST, PLATFORM),
            g(CREDENTIALING_MANAGER, TEAM_MANAGE, PLATFORM), g(CREDENTIALING_MANAGER, STAFFING_REQUEST, PLATFORM),
            g(SUPPORT_MANAGER, TEAM_MANAGE, PLATFORM), g(SUPPORT_MANAGER, STAFFING_REQUEST, PLATFORM),
            // Journeys
            g(JOURNEY_MANAGER, JOURNEY_READ, PLATFORM), g(JOURNEY_MANAGER, JOURNEY_EDIT, PLATFORM), g(JOURNEY_MANAGER, JOURNEY_ADMISSION_PAUSE, PLATFORM),
            g(JOURNEY_MANAGER, TEAM_MANAGE, PLATFORM), g(JOURNEY_MANAGER, STAFFING_REQUEST, PLATFORM),
            g(JOURNEY_APPROVER, JOURNEY_READ, PLATFORM), g(JOURNEY_APPROVER, JOURNEY_APPROVE, PLATFORM), g(JOURNEY_APPROVER, JOURNEY_ADMISSION_PAUSE, PLATFORM),
            // Platform administration
            g(SYSTEM_ADMINISTRATOR, WORKFORCE_READ, PLATFORM), g(SYSTEM_ADMINISTRATOR, WORKFORCE_ADMINISTER, PLATFORM),
            g(SYSTEM_ADMINISTRATOR, ACCESS_GOVERN, PLATFORM), g(SYSTEM_ADMINISTRATOR, AUDIT_READ, PLATFORM),
            g(SYSTEM_ADMINISTRATOR, IDENTITY_OPERATIONS_READ, PLATFORM), g(SYSTEM_ADMINISTRATOR, IDENTITY_OPERATIONS_MANAGE, PLATFORM),
            g(SYSTEM_ADMINISTRATOR, RECERTIFY, PLATFORM),
            // Compliance (read-only)
            g(COMPLIANCE_AUDITOR, WORKFORCE_READ, PLATFORM), g(COMPLIANCE_AUDITOR, AUDIT_READ, PLATFORM),
            g(COMPLIANCE_AUDITOR, IDENTITY_OPERATIONS_READ, PLATFORM), g(COMPLIANCE_AUDITOR, CREDENTIAL_READ, PLATFORM),
            g(COMPLIANCE_AUDITOR, JOURNEY_READ, PLATFORM), g(COMPLIANCE_AUDITOR, ROUTING_READ, PLATFORM),
            // Support
            g(SUPPORT_AGENT, SUPPORT_ACCOUNT, PLATFORM), g(SUPPORT_AGENT, MFA_RESET_REQUEST, PLATFORM));

    private static final Map<Permission, List<Grant>> BY_PERMISSION = index();
    private static final Map<Role, Set<Workspace>> WORKSPACES = workspaces();

    private RolePolicy() {}

    public static List<Grant> grantsFor(Permission permission) { return BY_PERMISSION.getOrDefault(permission, List.of()); }

    public static List<Grant> grants() { return GRANTS; }

    public static Set<Workspace> workspaces(Role role) { return WORKSPACES.getOrDefault(role, Set.of()); }

    private static Grant g(Role role, Permission permission, Scope scope) { return new Grant(role, permission, scope); }

    private static Map<Permission, List<Grant>> index() {
        Map<Permission, List<Grant>> map = new EnumMap<>(Permission.class);
        for (Grant grant : GRANTS) map.computeIfAbsent(grant.permission(), k -> new ArrayList<>()).add(grant);
        map.replaceAll((k, v) -> List.copyOf(v));
        return map;
    }

    private static Map<Role, Set<Workspace>> workspaces() {
        Map<Role, Set<Workspace>> map = new EnumMap<>(Role.class);
        map.put(COORDINATOR, EnumSet.of(Workspace.COORDINATION));
        map.put(CARE_COORDINATION_MANAGER, EnumSet.of(Workspace.COORDINATION, Workspace.CONTROL_CENTER));
        map.put(OPERATIONS, EnumSet.of(Workspace.OPERATIONS));
        map.put(OPERATIONS_MANAGER, EnumSet.of(Workspace.CONTROL_CENTER));
        map.put(FINANCE, EnumSet.of(Workspace.FINANCE));
        map.put(FINANCE_MANAGER, EnumSet.of(Workspace.CONTROL_CENTER));
        map.put(CREDENTIAL_VERIFIER, EnumSet.of(Workspace.CREDENTIALING));
        map.put(CREDENTIALING_MANAGER, EnumSet.of(Workspace.CONTROL_CENTER));
        map.put(CONSULTANT_OPERATIONS_MANAGER, EnumSet.of(Workspace.CREDENTIALING, Workspace.CONTROL_CENTER));
        map.put(PATIENT_IDENTITY_REVIEWER, EnumSet.of(Workspace.IDENTITY_REVIEW));
        map.put(JOURNEY_MANAGER, EnumSet.of(Workspace.JOURNEY_GOVERNANCE));
        map.put(JOURNEY_APPROVER, EnumSet.of(Workspace.JOURNEY_GOVERNANCE));
        map.put(SYSTEM_ADMINISTRATOR, EnumSet.of(Workspace.CONTROL_CENTER));
        map.put(COMPLIANCE_AUDITOR, EnumSet.of(Workspace.CONTROL_CENTER));
        map.put(SUPPORT_AGENT, EnumSet.of(Workspace.SUPPORT));
        map.put(SUPPORT_MANAGER, EnumSet.of(Workspace.CONTROL_CENTER));
        map.put(CONSULTANT, EnumSet.of(Workspace.CONSULTANT));
        map.put(PRACTICE_MANAGER, EnumSet.of(Workspace.CLINIC_DELEGATE));
        map.put(PATIENT, EnumSet.of(Workspace.PATIENT));
        map.put(PATIENT_REPRESENTATIVE, EnumSet.of(Workspace.PATIENT));
        return map;
    }
}
