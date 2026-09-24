import type { Locale } from "@/lib/i18n";
import { businessLabel } from "./access-copy";

/** Shared shapes of the `/admin/access/**` reads (UX-5). The backend decides; these only describe its answers. */
export type Permission = { key: string; name: string; description: string; family: string; risk: string; scopes: string[]; actors: string[]; channels: string[]; dependencies: string[]; conflicts: string[]; executable: boolean; workflowGated: boolean; recentAuthentication: boolean };
export type Role = { id: string; key: string; name: string; description: string; purpose: string; family: string; systemTemplate: boolean; status?: string; currentVersion?: number | null; currentSince?: string | null; draftStatus?: string | null };
export type Grant = { permission: string; scope: string; relationship: string | null };
export type Version = { id: string; number: number; status: string; revision: number; actorType: string; channel: string; effectiveFrom?: string | null; retiredAt?: string | null; createdBy: string; publishedBy?: string | null };
export type VersionDetail = { version: Version; grants: Grant[] };
export type RoleDetail = { role: Role; versions: VersionDetail[] };
export type Decision = { allowed: boolean; reason: string; permission: string; roleVersionId: string | null; scope: string | null; relationship: string | null };
export type Api = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

export type AssignmentView = { id: string; roleId: string; roleKey: string; roleName: string; versionId: string; versionNumber: number; versionStatus: string; scope: string; targetType: string | null; targetId: string | null; status: string; state: string; effectiveFrom: string; effectiveTo: string | null; source: string; revision: number };
export type RelationshipView = { id: string; type: string; targetType: string; targetId: string; targetName: string | null; status: string; effectiveFrom: string; effectiveTo: string | null };
export type OrganizationAccess = { organizationId: string; platform: boolean; organizationName: string | null; membership: { organizationId: string; status: string; accountActive: boolean; effectiveFrom: string; effectiveTo: string | null } | null; assignments: AssignmentView[]; relationships: RelationshipView[] };
export type PersonAccess = { subject: string; organizations: OrganizationAccess[]; truncated: boolean };
export type Check = { allowed: boolean; reason: string; permission: string; organizationId: string; organizationName: string | null; clinicianId: string | null; clinicianName: string | null; roleName: string | null; scope: string | null; relationship: string | null; validUntil: string | null; recentAuthentication: boolean; heldScopes: string[] };
export type WorkspaceRoles = { subject: string; source: "IDENTITY_SYSTEM"; available: boolean; accountStatus: string | null; roles: string[] };
export type PersonRef = { subject: string; name?: string; context?: string };

export const PLATFORM = "00000000-0000-0000-0000-000000000001";

const pick = (locale: Locale, en: string, ar: string) => (locale === "ar" ? ar : en);

/** "Where it applies", in words — never the scope key. */
export function whereLabel(scope: string, locale: Locale) {
  const map: Record<string, [string, string]> = {
    PLATFORM: ["Across RehletShifaa", "على مستوى رحلة شفاء"], ORGANIZATION: ["The whole organization", "المؤسسة بالكامل"],
    ASSIGNED_ORGANIZATIONS: ["Organizations assigned to them", "المؤسسات المسندة إليه"], SELF: ["Their own records", "سجلاته الشخصية"],
    MANAGED_CLINICIANS: ["Clinicians they manage", "الأطباء الذين يديرهم"], ASSIGNED_CASES: ["Cases assigned to them", "الحالات المسندة إليه"],
    SPECIFIC_RESOURCE: ["One specific item", "عنصر محدد"],
  };
  return map[scope]?.[locale === "ar" ? 1 : 0] ?? businessLabel(scope, locale);
}

/** Who manages this piece of access — the source, never an engine term. */
export function sourceLabel(source: string, scope: string, locale: Locale) {
  if (scope === "MANAGED_CLINICIANS") return pick(locale, "Professional relationship", "علاقة مهنية");
  if (source === "PROVIDER_ONBOARDING") return pick(locale, "Provider membership", "عضوية لدى مقدم الرعاية");
  return pick(locale, "Managed by RehletShifaa", "تديرها رحلة شفاء");
}

export function stateLabel(state: string, locale: Locale): [string, "success" | "warning" | "neutral" | "danger"] {
  const map: Record<string, [string, string, "success" | "warning" | "neutral" | "danger"]> = {
    ACTIVE: ["Active", "نشط", "success"], SCHEDULED: ["Starts later", "يبدأ لاحقًا", "warning"], ENDED: ["Ended", "انتهى", "neutral"],
    PENDING: ["Waiting for organization verification", "بانتظار التحقق من المؤسسة", "warning"], REVOKED: ["Removed", "أُزيل", "neutral"],
  };
  const v = map[state] ?? [state, state, "neutral" as const];
  return [locale === "ar" ? v[1] : v[0], v[2]];
}

export function formatDate(iso: string, locale: Locale) {
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One card per role in one organization: the backend stores one assignment per scope, people think in roles. */
export type RoleGroup = { key: string; roleName: string; roleKey: string; organization: OrganizationAccess; assignments: AssignmentView[]; state: string; effectiveFrom: string; effectiveTo: string | null; source: string };
export function groupAssignments(organizations: OrganizationAccess[]): RoleGroup[] {
  const groups = new Map<string, RoleGroup>();
  for (const o of organizations) for (const a of o.assignments) {
    const key = `${o.organizationId}|${a.roleId}|${a.state}|${a.effectiveTo ?? ""}`;
    const g = groups.get(key);
    if (g) g.assignments.push(a);
    else groups.set(key, { key, roleName: a.roleName, roleKey: a.roleKey, organization: o, assignments: [a], state: a.state, effectiveFrom: a.effectiveFrom, effectiveTo: a.effectiveTo, source: a.source });
  }
  return [...groups.values()];
}

/** Where the organization is, in words. */
export function organizationLabel(o: Pick<OrganizationAccess, "platform" | "organizationName">, locale: Locale) {
  if (o.platform) return pick(locale, "RehletShifaa platform", "منصة رحلة شفاء");
  return o.organizationName ?? pick(locale, "A provider organization", "مؤسسة مقدم رعاية");
}

/** The backend's reason for an answer, in words. Held scopes explain a scope denial ("only for clinicians they manage"). */
export function explainCheck(c: Check, locale: Locale): { because: string | null; reason: string | null } {
  if (c.allowed) {
    const who = c.clinicianName ?? pick(locale, "this clinician", "هذا الطبيب");
    const because = c.scope === "SELF" ? pick(locale, `${who} is their own clinician record`, `${who} هو سجلّه الطبي الخاص`)
      : c.scope === "MANAGED_CLINICIANS" ? pick(locale, `They manage ${who}`, `يدير ${who}`)
      : c.scope === "ORGANIZATION" || c.scope === "ASSIGNED_ORGANIZATIONS" ? pick(locale, "Their role applies to the whole organization", "ينطبق دوره على المؤسسة بالكامل")
      : c.scope === "PLATFORM" ? pick(locale, "Their role applies across RehletShifaa", "ينطبق دوره على مستوى رحلة شفاء")
      : c.scope ? whereLabel(c.scope, locale) : null;
    return { because, reason: null };
  }
  const held = c.heldScopes ?? [];
  if ((c.reason === "SCOPE_MISMATCH" || c.reason === "RELATIONSHIP_REQUIRED" || c.reason === "NO_MATCHING_GRANT") && held.length) {
    const only = held.map((s) => whereLabel(s, locale).toLowerCase()).join(pick(locale, " or ", " أو "));
    return { because: null, reason: pick(locale, `Their role allows this only for ${only}.`, `يسمح دوره بذلك فقط لـ${only}.`) };
  }
  if (c.reason === "NO_MATCHING_GRANT") return { because: null, reason: pick(locale, "None of their roles includes this.", "لا يتضمن أي من أدواره ذلك.") };
  if (c.reason === "INVALID_CONFIGURATION") return { because: null, reason: pick(locale, "Their role version includes this, but it isn't switched on for that version. A newer role version is needed.", "يتضمن إصدار دوره ذلك، لكنه غير مفعّل لهذا الإصدار. يلزم إصدار أحدث من الدور.") };
  return { because: null, reason: businessLabel(c.reason, locale) };
}
