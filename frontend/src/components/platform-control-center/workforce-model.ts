import type { Locale } from "@/lib/i18n";
import type { Tone } from "./admin-labels";

/** Typed off the backend records (access.platform, workforce). Subjects are for commands only; people are names. */
export type StaffView = { subject: string; name: string | null; email: string | null; lifecycle: string; roles: string[]; activatedAt: string | null; lastSignInAt: string | null; revision: number };
export type InvitationView = { id: string; name: string; email: string; status: string; subject: string | null; expiresAt: string | null; roles: string[]; revision: number };
export type StaffDirectory = { people: StaffView[]; invitations: InvitationView[] };
export type Blocker = { code: string; count: number; detail: string };
export type Offboarding = { subject: string; lifecycle: string; blockers: Blocker[] };
export type RoleAssignment = { id: string; subject: string; role: string; function: string; effectiveFrom: string; effectiveTo: string | null; status: string; source: string; assignedBy: string; reason: string; revision: number };
export type TeamMember = { subject: string; displayName: string | null; membershipId: string; membershipRevision: number; lead: boolean; leadId: string | null; leadRevision: number | null; managerSubject: string | null; managerRevision: number | null };
export type WorkforceTeam = { id: string; function: string; name: string; status: string; revision: number; members: TeamMember[] };
export type WorkforcePerson = { subject: string; displayName: string | null; lifecycleStatus: string; roles: string[] };
export type CatalogueFunction = { key: string; displayName: string; roles: { key: string; displayName: string }[] };
export type StaffingRequest = { id: string; function: string; type: string; subject: string | null; details: string; status: string; requestedBy: string; requestedAt: string; decidedBy: string | null; decisionReason: string | null; executionReference: string | null; revision: number };
export type AdministratorAssignment = { id: string; subject: string; effectiveFrom: string; effectiveTo: string | null; revision: number };
export type ChangeRequest = { id: string; type: "APPOINT" | "REMOVE"; subject: string; effectiveFrom: string; effectiveTo: string | null; status: string; requestedBy: string; expiresAt: string; revision: number };
export type SupportView = { subject: string; name: string | null; lifecycle: string; invitationStatus: string | null; lastSignInAt: string | null; mfaEnrolled: boolean; roles: string[] };
export type MfaReset = { id: string; subject: string; requestedBy: string; reason: string; status: string; requestedAt: string; expiresAt: string; decidedBy: string | null; revision: number };
export type Campaign = { id: string; scope: string; status: string; startedBy: string; startedAt: string; dueAt: string };
export type CampaignItem = { id: string; campaignId: string; subject: string; itemType: string; assignmentId: string | null; role: string; decision: string; decidedBy: string | null; revision: number };
export type ServiceAccount = { account: { clientId: string; ownerSubject: string; purpose: string; scopes: string; secretRotatedAt: string; status: string; revision: number }; rotationOverdue: boolean };
export type AuditEntry = { actor: string; entity: string; action: string; outcome: string; reason: string | null; occurredAt: string };

/** Roles a person can be given here. System Administrator is appointed only through two-person approval. */
export const ASSIGNABLE_ROLES = [
  "CONSULTANT_OPERATIONS_MANAGER", "CREDENTIAL_VERIFIER", "CARE_COORDINATION_MANAGER", "COORDINATOR", "OPERATIONS", "FINANCE",
  "JOURNEY_MANAGER", "JOURNEY_APPROVER", "COMPLIANCE_AUDITOR", "SUPPORT_AGENT", "PATIENT_IDENTITY_REVIEWER",
] as const;

const roleNames: Record<string, [string, string]> = {
  SYSTEM_ADMINISTRATOR: ["System Administrator", "مسؤول النظام"],
  CONSULTANT_OPERATIONS_MANAGER: ["Consultant Operations Manager", "مدير عمليات الاستشاريين"],
  CREDENTIAL_VERIFIER: ["Credential Verification Officer", "مسؤول التحقق من الاعتمادات"],
  CARE_COORDINATION_MANAGER: ["Care Coordination Manager", "مدير تنسيق الرعاية"],
  COORDINATOR: ["Care Coordinator", "منسق رعاية"],
  OPERATIONS: ["Operations Specialist", "أخصائي عمليات"],
  FINANCE: ["Finance Officer", "مسؤول مالي"],
  JOURNEY_MANAGER: ["Care Journey Manager", "مدير رحلات الرعاية"],
  JOURNEY_APPROVER: ["Care Journey Approver", "معتمد رحلات الرعاية"],
  COMPLIANCE_AUDITOR: ["Compliance and Audit Reviewer", "مراجع الامتثال والتدقيق"],
  SUPPORT_AGENT: ["Support Officer", "مسؤول الدعم"],
  PATIENT_IDENTITY_REVIEWER: ["Patient Identity Reviewer", "مراجع هوية المرضى"],
};
export const platformRoleLabel = (role: string, locale: Locale) => roleNames[role]?.[locale === "ar" ? 1 : 0] ?? role;

const functionNames: Record<string, [string, string]> = {
  PLATFORM_ADMINISTRATION: ["Platform Administration", "إدارة المنصة"], CONSULTANT_OPERATIONS: ["Consultant Operations", "عمليات الاستشاريين"],
  CREDENTIALING: ["Credentialing", "الاعتماد"], CARE_COORDINATION: ["Care Coordination", "تنسيق الرعاية"], OPERATIONS: ["Operations", "العمليات"],
  FINANCE: ["Finance", "المالية"], CARE_JOURNEY: ["Care Journeys", "رحلات الرعاية"], COMPLIANCE: ["Compliance", "الامتثال"],
  SUPPORT: ["Support", "الدعم"], PATIENT_IDENTITY: ["Patient Identity", "هوية المرضى"],
};
export const functionLabel = (fn: string, locale: Locale) => functionNames[fn]?.[locale === "ar" ? 1 : 0] ?? fn;

const lifecycles: Record<string, [string, string, Tone]> = {
  INVITED: ["Invited", "مدعو", "warning"], ACTIVE: ["Active", "نشط", "success"], SIGNIN_DISABLED: ["Sign-in disabled", "الدخول معطّل", "danger"],
  OFFBOARDING: ["Offboarding", "قيد إنهاء الخدمة", "warning"], OFFBOARDED: ["Offboarded", "انتهت الخدمة", "neutral"],
  CANCELLED: ["Cancelled", "أُلغي", "neutral"], EXPIRED: ["Expired", "منتهي", "neutral"],
};
export const lifecycleBadge = (value: string, locale: Locale): { label: string; tone: Tone } => {
  const hit = lifecycles[value];
  return hit ? { label: hit[locale === "ar" ? 1 : 0], tone: hit[2] } : { label: value, tone: "neutral" };
};

export const when = (iso: string | null | undefined, locale: Locale) =>
  iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";

/** Platform ownership (GOV-04): the current owner and the three-party transfers, with what this viewer may do. */
export type OwnerParty = { subject: string; name: string | null };
export type OwnerTransferStatus = "PENDING_ACCEPTANCE" | "PENDING_VERIFICATION" | "COMPLETED" | "REJECTED" | "EXPIRED";
export type OwnerTransfer = {
  id: string; currentOwner: OwnerParty; incomingOwner: OwnerParty; status: OwnerTransferStatus; reason: string;
  initiatedAt: string; expiresAt: string; revision: number;
  canAccept: boolean; canVerify: boolean; canWithdraw: boolean; canDecline: boolean;
};
export type Ownership = { currentOwner: OwnerParty | null; viewerIsOwner: boolean; viewerIsAdministrator: boolean; canInitiate: boolean; transfers: OwnerTransfer[] };
