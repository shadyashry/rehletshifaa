"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

/**
 * Provider Workspace (UX-4) model. Everything here is composition and presentation: which sections a person sees is
 * derived from the V-11 self read (`/provider-workspace/me`), which reports the existing AuthorizationService decisions
 * for the caller's own clinician record, the clinicians they manage and their organization. It never authorizes
 * anything — every read and write the workspace makes is authorized again by its own endpoint.
 */

export type Capability = { permission: string; allowed: boolean; recentAuthentication: boolean };
export type OwnClinician = { practitionerId: string; displayName: string; clinicianType: "CONSULTANT" | "ASSOCIATE_DOCTOR" | string; setupStatus: string; providerCredentialing: boolean; capabilities: Capability[] };
export type Relationship = { type: "MANAGES" | "ASSISTS" | "SUPERVISES" | string; direction: "OUTGOING" | "INCOMING"; counterpartName: string | null; status: string; effectiveFrom: string | null; effectiveTo: string | null };
export type ManagedClinician = { practitionerId: string; displayName: string; clinicianType: string; setupStatus: string; membershipStatus: string | null; capabilities: Capability[] };
export type Practice = {
  organizationId: string; organizationName: string; organizationStatus: string; roles: string[];
  clinician: OwnClinician | null; relationships: Relationship[]; managedClinicians: ManagedClinician[]; managedCliniciansTruncated: boolean;
  organizationCapabilities: Capability[];
};
export type PracticeView = { practices: Practice[]; truncated: boolean };

/** V-3: one assigned case, the approved summary fields only (the server sends nothing else). */
export type CaseSummary = { caseNumber: string; patientDisplayName: string; caseStatus: string; assignmentStatus: "PENDING" | "ACTIVE" | string; assignedAt: string; proposalStage: string; proposalDocumentType: string | null };
export type CasePage = { items: CaseSummary[]; page: number; hasMore: boolean };

export type SectionKey = "home" | "cases" | "credentials" | "schedule" | "prices" | "clinicians";

export const allowed = (capabilities: Capability[] | undefined, permission: string) => !!capabilities?.some((c) => c.permission === permission && c.allowed);

/** Organization administration keys that make *Manage organization* worth offering to an owner or practice manager. */
const ADMINISTRATION = ["provider.update", "provider.member.invite", "provider.clinician.invite", "provider.practice_staff.manage", "provider.relationship.manage"];
const ADMINISTERING_ROLES = ["ORGANIZATION_OWNER", "PRACTICE_MANAGER"];

/**
 * *Manage organization* — the one entry into the scoped Control Center pages, for owners and practice managers only.
 * A consultant's seeded organization-wide relationship grant (matrix §4.4) never earns them this link.
 */
export function canManageOrganization(practice: Practice) {
  return practice.roles.some((r) => ADMINISTERING_ROLES.includes(r)) && ADMINISTRATION.some((k) => allowed(practice.organizationCapabilities, k));
}

/**
 * Workspace sections for one practice context, from the caller's own facts only. A section appears only when the backend
 * would serve its read: own credentials/schedule/prices need the decision on the caller's own clinician record; *My
 * clinicians* needs the practice-manager role or at least one managed clinician; *My cases* needs a clinician enrollment
 * (the V-3 read is scoped to the caller's own assignments). Nothing appears because of a job title alone.
 */
export function sections(practice: Practice): SectionKey[] {
  const own = practice.clinician;
  const out: SectionKey[] = ["home"];
  if (own) out.push("cases");
  if (own && allowed(own.capabilities, "credential.view")) out.push("credentials");
  if (own && allowed(own.capabilities, "availability.view")) out.push("schedule");
  if (own && allowed(own.capabilities, "price_list.view")) out.push("prices");
  if (practice.roles.includes("PRACTICE_MANAGER") || practice.managedClinicians.length) out.push("clinicians");
  return out;
}

export type Persona = "consultant" | "associate" | "manager" | "assistant" | "owner";
/** Presentation only (V-2): the persona label never opens a section; `sections` does. */
export function personas(practice: Practice): Persona[] {
  const map: Record<string, Persona> = { CONSULTANT: "consultant", ASSOCIATE_DOCTOR: "associate", PRACTICE_MANAGER: "manager", CONSULTANT_ASSISTANT: "assistant", ORGANIZATION_OWNER: "owner" };
  const order: Persona[] = ["consultant", "associate", "manager", "assistant", "owner"];
  const held = new Set(practice.roles.map((r) => map[r]).filter(Boolean));
  return order.filter((p) => held.has(p));
}

export type Attention = { key: string; title: string; detail: string; section: SectionKey; clinician?: string };

/**
 * Attention only for real, supported tasks: the caller's own credential needing information, assigned cases, managed
 * clinicians still in setup. No counts are invented; case counts come from the first V-3 page and say "20+" when more exist.
 */
export function attention(practice: Practice, cases: CasePage | null, locale: Locale): Attention[] {
  const ar = locale === "ar";
  const out: Attention[] = [];
  const own = practice.clinician;
  if (own && allowed(own.capabilities, "credential.view")) {
    if (own.setupStatus === "MORE_INFORMATION_REQUIRED") out.push({ key: "own-credential-info", section: "credentials", title: ar ? "مطلوب مزيد من المعلومات لاعتماداتك" : "Your credentials need more information", detail: ar ? "اطّلع على طلب المراجِع في «اعتماداتي». تُرسل النسخة الجديدة من خلال جهتك." : "See the reviewer's request in My credentials. The new version is submitted through your practice." });
    if (own.setupStatus === "REJECTED") out.push({ key: "own-credential-rejected", section: "credentials", title: ar ? "لم يُقبل أحد اعتماداتك" : "A credential was not accepted", detail: ar ? "راجع حالة اعتماداتك وتواصل مع جهتك." : "Check your credential status and contact your practice." });
  }
  if (own && cases && cases.items.length) {
    const count = cases.hasMore ? `${cases.items.length}+` : String(cases.items.length);
    out.push({ key: "assigned-cases", section: "cases", title: ar ? `حالات مسندة إليك: ${count}` : `${count} ${cases.items.length === 1 && !cases.hasMore ? "case is" : "cases are"} assigned to you`, detail: ar ? "افتح «حالاتي» لرؤية حالة كل حالة." : "Open My cases to see where each case stands." });
  }
  const inSetup = practice.managedClinicians.filter((c) => c.setupStatus !== "ACTIVE" && c.membershipStatus !== "REVOKED");
  if (inSetup.length) out.push({ key: "managed-setup", section: "clinicians", title: ar ? `أطباء تديرهم ولم يكتمل إعدادهم: ${inSetup.length}` : `${inSetup.length} ${inSetup.length === 1 ? "clinician you manage is" : "clinicians you manage are"} still in setup`, detail: ar ? "راجع الأسعار والجدول حيث يمكنك ذلك." : "Review prices and schedules where you can." });
  return out;
}

/** The one V-11 read, per signed-in subject. `enabled` lets a caller skip it (signed out, or already leaving for the Control Center). */
export function useProviderPractice(enabled = true) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const token = user?.access_token;
  // The result belongs to one signed-in subject and attempt: until THAT read has answered, the hook reports loading —
  // including the first render after sign-in, so a caller never acts on "no practice" before it has been asked.
  const key = enabled && token ? `${user?.profile?.sub ?? ""}#${attempt}` : null;
  const [result, setResult] = useState<{ key: string; view: PracticeView; failed: boolean } | null>(null);
  useEffect(() => {
    if (!key || !token) return;
    let live = true;
    void apiFetchAs(token, "/provider-workspace/me")
      .then(async (r) => (r.ok ? { v: (await r.json()) as PracticeView, bad: false } : { v: null, bad: r.status !== 401 && r.status !== 403 }))
      .catch(() => ({ v: null, bad: true }))
      .then(({ v, bad }) => { if (live) setResult({ key, view: v && Array.isArray(v.practices) ? v : { practices: [], truncated: false }, failed: bad }); });
    return () => { live = false; };
    // Re-read on a new signed-in subject or retry, not on every silent token renewal (as useControlCenterAccess does).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result && result.key === key ? result : null;
  return { view: current?.view ?? null, loading: !!key && !current, failed: !!current?.failed, retry };
}

export const practiceHref = (locale: Locale, params?: Record<string, string | undefined>) => {
  const query = new URLSearchParams(Object.entries(params ?? {}).filter(([, v]) => !!v) as [string, string][]).toString();
  return `/${locale}/portal/practice${query ? `?${query}` : ""}`;
};
