import type { Page } from "@playwright/test";

import type { Me, TeamFact } from "../src/lib/access";
import { API } from "./env";

/**
 * Synthetic `GET /api/v1/me` answers. The portal decides what to show from this response (never from the identity
 * token), so every mocked page needs one. The tables mirror the backend's single policy,
 * `backend/.../authority/domain/RolePolicy.java` (platform-scope grants and workspaces per role, `Permission.stepUp`):
 * keep them in step with it.
 */
const PLATFORM_PERMISSIONS: Record<string, string[]> = {
  COORDINATOR: ["WORK_QUEUE_VIEW", "COORDINATION_QUEUE", "REFERENCE_DATA_READ"],
  OPERATIONS: ["WORK_QUEUE_VIEW", "REFERENCE_DATA_READ"],
  FINANCE: ["WORK_QUEUE_VIEW", "COMMERCIAL_POLICY_MANAGE", "COMMERCIAL_POLICY_READ", "PAYMENT_RECORD", "REFERENCE_DATA_READ"],
  CONSULTANT: ["WORK_QUEUE_VIEW", "REFERENCE_DATA_READ"],
  CARE_COORDINATION_MANAGER: ["REFERENCE_DATA_READ", "TEAM_MANAGE", "STAFFING_REQUEST", "WORK_QUEUE_VIEW", "COORDINATION_QUEUE",
    "COORDINATION_CASE_SUMMARY", "ROUTING_READ", "ROUTING_CONFIGURE", "ROUTING_ASSIGN"],
  CONSULTANT_OPERATIONS_MANAGER: ["REFERENCE_DATA_READ", "COMMERCIAL_POLICY_READ", "CONSULTANT_ONBOARD", "CONSULTANT_CATALOG_MANAGE",
    "CREDENTIAL_READ", "TEAM_MANAGE", "STAFFING_REQUEST"],
  CREDENTIAL_VERIFIER: ["CREDENTIAL_READ", "CREDENTIAL_DECIDE", "CAPABILITY_DECIDE"],
  PATIENT_IDENTITY_REVIEWER: ["PATIENT_IDENTITY_REVIEW", "PATIENT_IDENTITY_READ"],
  OPERATIONS_MANAGER: ["TEAM_MANAGE", "STAFFING_REQUEST"],
  FINANCE_MANAGER: ["TEAM_MANAGE", "STAFFING_REQUEST"],
  CREDENTIALING_MANAGER: ["TEAM_MANAGE", "STAFFING_REQUEST"],
  SUPPORT_MANAGER: ["TEAM_MANAGE", "STAFFING_REQUEST"],
  JOURNEY_MANAGER: ["JOURNEY_READ", "JOURNEY_EDIT", "JOURNEY_ADMISSION_PAUSE", "TEAM_MANAGE", "STAFFING_REQUEST"],
  JOURNEY_APPROVER: ["JOURNEY_READ", "JOURNEY_APPROVE", "JOURNEY_ADMISSION_PAUSE"],
  SYSTEM_ADMINISTRATOR: ["WORKFORCE_READ", "WORKFORCE_ADMINISTER", "ACCESS_GOVERN", "AUDIT_READ", "IDENTITY_OPERATIONS_READ",
    "IDENTITY_OPERATIONS_MANAGE", "RECERTIFY"],
  COMPLIANCE_AUDITOR: ["COMMERCIAL_POLICY_READ", "WORKFORCE_READ", "AUDIT_READ", "IDENTITY_OPERATIONS_READ", "CREDENTIAL_READ",
    "JOURNEY_READ", "ROUTING_READ"],
  SUPPORT_AGENT: ["SUPPORT_ACCOUNT", "MFA_RESET_REQUEST"],
};

const WORKSPACES: Record<string, Me["workspaces"]> = {
  COORDINATOR: ["COORDINATION"], CARE_COORDINATION_MANAGER: ["COORDINATION", "CONTROL_CENTER"], OPERATIONS: ["OPERATIONS"],
  OPERATIONS_MANAGER: ["CONTROL_CENTER"], FINANCE: ["FINANCE"], FINANCE_MANAGER: ["CONTROL_CENTER"], CREDENTIAL_VERIFIER: ["CREDENTIALING"],
  CREDENTIALING_MANAGER: ["CONTROL_CENTER"], CONSULTANT_OPERATIONS_MANAGER: ["CREDENTIALING", "CONTROL_CENTER"],
  PATIENT_IDENTITY_REVIEWER: ["IDENTITY_REVIEW"], JOURNEY_MANAGER: ["JOURNEY_GOVERNANCE"], JOURNEY_APPROVER: ["JOURNEY_GOVERNANCE"],
  SYSTEM_ADMINISTRATOR: ["CONTROL_CENTER"], COMPLIANCE_AUDITOR: ["CONTROL_CENTER"], SUPPORT_AGENT: ["SUPPORT"], SUPPORT_MANAGER: ["CONTROL_CENTER"],
  CONSULTANT: ["CONSULTANT"], PRACTICE_MANAGER: ["CLINIC_DELEGATE"], PATIENT: ["PATIENT"], PATIENT_REPRESENTATIVE: ["PATIENT"],
};

/** The workforce function a manager role manages (its TEAM_MANAGE grant). */
const MANAGED_FUNCTION: Record<string, string> = {
  CARE_COORDINATION_MANAGER: "CARE_COORDINATION", CONSULTANT_OPERATIONS_MANAGER: "CONSULTANT_OPERATIONS", OPERATIONS_MANAGER: "OPERATIONS",
  FINANCE_MANAGER: "FINANCE", CREDENTIALING_MANAGER: "CREDENTIALING", SUPPORT_MANAGER: "SUPPORT", JOURNEY_MANAGER: "CARE_JOURNEY",
};

const STEP_UP = new Set(["ROUTING_CONFIGURE", "CLINICAL_APPROVE", "FINANCE_SETTLE", "COMMERCIAL_POLICY_MANAGE", "PAYMENT_RECORD", "PATIENT_DECIDE",
  "CONSULTANT_ONBOARD", "CREDENTIAL_DECIDE", "PATIENT_IDENTITY_REVIEW", "CLINIC_APPROVE", "CAPABILITY_DECIDE", "JOURNEY_APPROVE",
  "WORKFORCE_ADMINISTER", "ACCESS_GOVERN", "IDENTITY_OPERATIONS_MANAGE", "RECERTIFY"]);

const WORKFORCE_FUNCTION: Record<string, string> = {
  COORDINATOR: "CARE_COORDINATION", CARE_COORDINATION_MANAGER: "CARE_COORDINATION", OPERATIONS: "OPERATIONS", OPERATIONS_MANAGER: "OPERATIONS",
  FINANCE: "FINANCE", FINANCE_MANAGER: "FINANCE", CREDENTIAL_VERIFIER: "CREDENTIALING", CREDENTIALING_MANAGER: "CREDENTIALING",
  CONSULTANT_OPERATIONS_MANAGER: "CONSULTANT_OPERATIONS", PATIENT_IDENTITY_REVIEWER: "PATIENT_IDENTITY", JOURNEY_MANAGER: "CARE_JOURNEY",
  JOURNEY_APPROVER: "CARE_JOURNEY", SYSTEM_ADMINISTRATOR: "PLATFORM_ADMINISTRATION", COMPLIANCE_AUDITOR: "COMPLIANCE",
  SUPPORT_AGENT: "SUPPORT", SUPPORT_MANAGER: "SUPPORT",
};

/** What `/me` reports for a person holding these platform roles (the account-holder role is always present). */
export function meFor(subject: string, roles: string[], options: { displayName?: string; teams?: TeamFact[] } = {}): Me {
  const unique = [...new Set(roles)];
  const permissions = [...new Set(unique.flatMap((role) => PLATFORM_PERMISSIONS[role] ?? []))].sort();
  const functions = [...new Set(unique.map((role) => WORKFORCE_FUNCTION[role]).filter(Boolean))].sort();
  return {
    subject,
    roles: [...unique, "ACCOUNT_HOLDER"],
    permissions,
    reauthenticate: permissions.filter((p) => STEP_UP.has(p)),
    workspaces: [...new Set(unique.flatMap((role) => WORKSPACES[role] ?? []))],
    managedFunctions: [...new Set(unique.map((role) => MANAGED_FUNCTION[role]).filter(Boolean))].sort(),
    platformAccountOwner: false,
    workforce: functions.length ? {
      subject, displayName: options.displayName ?? null, lifecycleStatus: "ACTIVE", mfaEnrolled: true, phishingResistantMfaEnrolled: false,
      functions, teams: options.teams ?? [],
    } : null,
    pendingActions: [],
  };
}

/** A care-coordination team the person leads (shows the lead-only tools; the backend still decides every action). */
export const leadsCoordinationTeam: TeamFact[] = [{ teamId: "team-coordination", function: "CARE_COORDINATION", name: "Care coordination", lead: true }];

/** Answers `GET /api/v1/me` with this access. Register after any catch-all API route so it takes precedence. */
export async function routeMe(page: Page, me: Me) {
  await page.route(`${API}/me`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204 })
    : route.fulfill({ contentType: "application/json", body: JSON.stringify(me) }));
}
