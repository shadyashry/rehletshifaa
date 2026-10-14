/**
 * The caller's access, exactly as `GET /api/v1/me` reports it. The browser never reads roles from the identity token:
 * the identity provider proves who the person is, and the platform's own policy (over its own records) decides what
 * they hold. Everything here only shapes navigation — every page and every API call is authorized by the backend.
 */

export type Workspace =
  | "CONTROL_CENTER" | "COORDINATION" | "OPERATIONS" | "FINANCE" | "CREDENTIALING" | "IDENTITY_REVIEW"
  | "JOURNEY_GOVERNANCE" | "SUPPORT" | "CONSULTANT" | "CLINIC_DELEGATE" | "PATIENT";

export type TeamFact = { teamId: string; function: string; name: string; lead: boolean };
export type WorkforceFacts = {
  subject: string; displayName: string | null; lifecycleStatus: string; mfaEnrolled: boolean;
  phishingResistantMfaEnrolled: boolean; functions: string[]; teams: TeamFact[];
};

export type Me = {
  subject: string;
  /** The platform roles in effect now (e.g. COORDINATOR, CONSULTANT, PATIENT, SYSTEM_ADMINISTRATOR). */
  roles: string[];
  /** Platform-scope permissions held now (e.g. WORKFORCE_READ, JOURNEY_EDIT). Case-scoped powers are decided per case. */
  permissions: string[];
  /** Held permissions that ask for a fresh sign-in when performed. */
  reauthenticate: string[];
  workspaces: Workspace[];
  managedFunctions: string[];
  platformAccountOwner: boolean;
  workforce: WorkforceFacts | null;
  pendingActions: string[];
  /** D1: the second factor this account signs in with — "2" authenticator app, "3" passkey — or null (patients). */
  signInAcr?: "2" | "3" | null;
  /** D1: the session lacks that second factor; the app finishes the sign-in before showing staff work. */
  secondFactorRequired?: boolean;
};

/** The care portal's case workspaces. The Control Center workspaces open the Control Center instead. */
export type PortalView = "patient" | "coordinator" | "doctor" | "operations" | "finance";

/** Which backend workspace opens which care-portal view — presentation routing only, in the order views are offered. */
const PORTAL_VIEWS: [Workspace, PortalView][] = [
  ["PATIENT", "patient"], ["COORDINATION", "coordinator"], ["CONSULTANT", "doctor"], ["OPERATIONS", "operations"], ["FINANCE", "finance"],
];

const CONTROL_CENTER_WORKSPACES: Workspace[] = ["CONTROL_CENTER", "CREDENTIALING", "IDENTITY_REVIEW", "JOURNEY_GOVERNANCE", "SUPPORT"];

export function portalViews(me: Me | null): PortalView[] {
  if (!me) return [];
  return PORTAL_VIEWS.filter(([workspace]) => me.workspaces.includes(workspace)).map(([, view]) => view);
}

export function opensControlCenter(me: Me | null) {
  return !!me && me.workspaces.some((w) => CONTROL_CENTER_WORKSPACES.includes(w));
}

export function holds(me: Me | null, permission: string) {
  return !!me && me.permissions.includes(permission);
}

export function hasRole(me: Me | null, role: string) {
  return !!me && me.roles.includes(role);
}

/** The Keycloak LoA requested for a sensitive action. Unknown access fails closed at the strongest level. */
export function reauthenticationAcr(me: Me | null): "2" | "3" {
  return !me || me.platformAccountOwner || me.signInAcr === "3" || me.roles.includes("SYSTEM_ADMINISTRATOR") ? "3" : "2";
}

/**
 * A2b: how strongly the session signed in, from how it happened (`amr`, RFC 8176) — 3 a passkey, 2 another second factor,
 * 1 a password only; the plain `acr` only when a token carries no `amr`. The backend reads it the same way and decides.
 */
export function sessionAssurance(amr: unknown, acr: unknown): number {
  if (Array.isArray(amr)) return amr.includes("hwk") || amr.includes("swk") ? 3 : amr.includes("otp") || amr.includes("mfa") ? 2 : 1;
  const level = typeof acr === "number" ? acr : typeof acr === "string" && /^\d+$/.test(acr) ? Number(acr) : NaN;
  return Number.isInteger(level) ? level : 0;
}

/** Whether the session proves at least the strength the platform requires of this actor's sensitive actions. */
export function satisfiesReauthenticationAcr(me: Me | null, assurance: number): boolean {
  return assurance >= Number(reauthenticationAcr(me));
}

/** The caller leads a team of this workforce function (a fact for showing supervisory tools; the backend decides). */
export function leadsTeam(me: Me | null, workforceFunction: string) {
  return !!me?.workforce?.teams.some((t) => t.lead && t.function === workforceFunction);
}
