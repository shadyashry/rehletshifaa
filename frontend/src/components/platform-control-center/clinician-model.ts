"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { clinicianStatusLabel, personRoleLabel, type Tone } from "./admin-labels";
import { COMMERCIAL_ACCEPTANCE_IN_RELEASE, COMMERCIAL_ACCEPTANCE_MISSING, type Readiness } from "./consultant-setup";

/**
 * One way of presenting clinicians across the two engagement models, which stay separate on the backend:
 * - Through a Provider Organization — `GET /admin/providers/clinicians` (one bounded read, organizations the caller can view);
 * - Direct with RehletShifaa — `GET /admin/practitioners` (legacy administration roles).
 * Every label below is derived from a stored backend fact; nothing is computed that the backend does not report.
 */

/** A row of `GET /admin/providers/clinicians`. `providerCredentialing` is the backend's engagement switch (credential-policy cutover). */
export type ProviderClinicianRow = {
  organizationId: string; organizationName: string; organizationStatus: string; organizationLegacyMapping: boolean;
  practitionerId: string; displayName: string | null; clinicianType: string; onboardingStatus: string; membershipStatus: string;
  providerCredentialing: boolean; credentialsRequired: number | null; credentialStatuses: Record<string, number>;
};
/** A row of `GET /admin/practitioners`. `providerCredentialing`: the Direct approval no longer applies (the backend refuses it). */
export type DirectConsultant = { id: string; displayName?: string; specialty?: string; subspecialty?: string; careCategory?: string; credentialingStatus?: string; availabilityStatus?: string; email?: string; accountStatus?: "INVITED" | "ACTIVE" | "DISABLED"; invitedAt?: string; providerCredentialing?: boolean };

export type Engagement = "direct" | "provider";
export type Badge = { label: string; tone: Tone; detail?: string };
export type SetupBucket = "progress" | "complete" | "inactive";
export type ClinicianEntry = {
  key: string; engagement: Engagement; name: string; clinicianType: string; specialty?: string;
  organizationId: string | null; organizationName: string; href: string;
  setup: Badge & { bucket: SetupBucket }; credentials: Badge; eligibility: Badge;
  /** Shown only while setup is genuinely in progress. */
  continueHref?: string;
  /** A Direct clinician's provider record that has not been adopted yet (legacy mapping awaiting review). */
  alsoLinked?: { organizationName: string; href: string }[];
};

// ---- Routes (UX-3). Older /providers/consultants/** and /providers/onboarding/new URLs redirect here. ----
export const cliniciansHref = (locale: Locale) => ccHref(locale, "/providers/clinicians");
export const clinicianHref = (locale: Locale, orgId: string, practitionerId: string, tab?: string) => ccHref(locale, `/providers/clinicians/${orgId}/${practitionerId}${tab ? `?tab=${tab}` : ""}`);
export const directClinicianHref = (locale: Locale, id: string, tab?: string) => ccHref(locale, `/providers/clinicians/direct/${id}${tab ? `?tab=${tab}` : ""}`);
export const addClinicianHref = (locale: Locale, orgId?: string) => ccHref(locale, `/providers/clinicians/new${orgId ? `?org=${orgId}` : ""}`);

const t = (locale: Locale, en: string, ar: string) => (locale === "ar" ? ar : en);
export const RS_NAME = { en: "RehletShifaa", ar: "رحلة شفاء" };
export const engagementLabel = (e: Engagement, locale: Locale) => e === "direct" ? t(locale, "Direct with RehletShifaa", "مباشرة مع رحلة شفاء") : t(locale, "Through a Provider Organization", "من خلال جهة طبية");

// ---- Provider model ----
export function providerSetupStatus(r: Pick<ProviderClinicianRow, "onboardingStatus" | "membershipStatus">, locale: Locale): ClinicianEntry["setup"] {
  if (r.membershipStatus === "REVOKED") return { label: t(locale, "Removed from organization", "أُزيل من الجهة"), tone: "neutral", bucket: "inactive" };
  switch (r.onboardingStatus) {
    case "ACTIVE": return { label: t(locale, "Active", "نشط"), tone: "success", bucket: "complete" };
    case "SUSPENDED": return { label: t(locale, "Suspended", "موقوف"), tone: "danger", bucket: "inactive" };
    case "OFFBOARDED": return { label: t(locale, "Offboarded", "منتهٍ"), tone: "neutral", bucket: "inactive" };
    case "LEGACY_UNREVIEWED": return { label: t(locale, "Review needed", "يحتاج مراجعة"), tone: "warning", bucket: "progress", detail: t(locale, "Imported from an existing record", "مستورد من سجل قائم") };
    default: return { label: t(locale, "Setup in progress", "الإعداد قيد التنفيذ"), tone: "warning", bucket: "progress", detail: clinicianStatusLabel(r.onboardingStatus, locale).label };
  }
}

const CREDENTIAL_ORDER: [string, Tone, string, string][] = [
  ["SUSPENDED", "danger", "Suspended", "موقوف"], ["REJECTED", "danger", "Rejected", "مرفوض"], ["EXPIRED", "danger", "Expired", "منتهي الصلاحية"],
  ["MORE_INFORMATION_REQUIRED", "warning", "More information required", "مطلوب مزيد من المعلومات"], ["UNDER_REVIEW", "info", "Under review", "قيد المراجعة"], ["SUBMITTED", "info", "Submitted", "مُقدَّمة"],
];
/**
 * The clinician's credentials in one status, never "complete": the most urgent state among their required credentials,
 * with how many are independently verified. Per-credential detail lives on the clinician page.
 */
export function credentialSummary(r: Pick<ProviderClinicianRow, "credentialsRequired" | "credentialStatuses">, locale: Locale): Badge {
  if (r.credentialsRequired === null) return { label: t(locale, "No requirements yet", "لا توجد متطلبات بعد"), tone: "warning", detail: t(locale, "Needs a licensing country with a credential policy", "يحتاج دولة ترخيص لها سياسة اعتماد") };
  if (r.credentialsRequired === 0) return { label: t(locale, "None required", "لا يلزم شيء"), tone: "neutral" };
  const count = (s: string) => r.credentialStatuses[s] ?? 0;
  const verified = count("VERIFIED"), missing = count("MISSING"), n = r.credentialsRequired;
  const info = count("MORE_INFORMATION_REQUIRED");
  const detail = t(locale, `${verified} of ${n} verified`, `${verified} من ${n} تم التحقق منها`) + (info ? t(locale, ` · ${info} need${info === 1 ? "s" : ""} more information`, ` · ${info} يحتاج إلى معلومات إضافية`) : "");
  const urgent = CREDENTIAL_ORDER.find(([s]) => count(s) > 0);
  if (urgent) return { label: t(locale, urgent[2], urgent[3]), tone: urgent[1], detail };
  if (missing === n) return { label: t(locale, "Not submitted", "لم تُقدَّم"), tone: "neutral", detail };
  if (missing > 0) return { label: t(locale, "Partly submitted", "مقدَّمة جزئيًا"), tone: "warning", detail };
  return { label: t(locale, "Verified", "تم التحقق"), tone: "success", detail };
}

/**
 * Whether a provider clinician can be given cases — a separate fact from their credentials. Today provider activation
 * cannot complete (Commercial & Legal Acceptance is not in this release), so nobody in setup is "ready".
 */
export function providerCaseEligibility(r: Pick<ProviderClinicianRow, "onboardingStatus" | "membershipStatus" | "providerCredentialing">, locale: Locale, readiness?: Readiness | null): Badge {
  if (!r.providerCredentialing) return { label: t(locale, "Uses Direct case approval", "يخضع لاعتماد الحالات المباشر"), tone: "neutral", detail: t(locale, "This organization record hasn't been adopted yet", "لم يُعتمد سجل الجهة هذا بعد") };
  if (r.membershipStatus === "REVOKED") return { label: t(locale, "Not eligible", "غير مؤهل"), tone: "neutral", detail: t(locale, "Removed from the organization", "أُزيل من الجهة") };
  if (r.onboardingStatus === "ACTIVE") return { label: t(locale, "Activated for cases", "مفعّل لاستقبال الحالات"), tone: "success" };
  if (r.onboardingStatus === "SUSPENDED" || r.onboardingStatus === "OFFBOARDED") return { label: t(locale, "Not eligible", "غير مؤهل"), tone: "danger", detail: clinicianStatusLabel(r.onboardingStatus, locale).label };
  const releaseBlocked = readiness ? readiness.blockers.some((b) => b.code === COMMERCIAL_ACCEPTANCE_MISSING) && !COMMERCIAL_ACCEPTANCE_IN_RELEASE : !COMMERCIAL_ACCEPTANCE_IN_RELEASE;
  if (readiness?.readyForActivation) return { label: t(locale, "Ready to activate", "جاهز للتفعيل"), tone: "info", detail: t(locale, "Not receiving cases until activated", "لا يستقبل حالات قبل التفعيل") };
  return { label: t(locale, "Not ready for cases", "غير جاهز للحالات"), tone: "warning", detail: releaseBlocked ? t(locale, "Provider activation isn't available in this release", "تفعيل مقدمي الرعاية غير متاح في هذا الإصدار") : t(locale, "Setup in progress", "الإعداد قيد التنفيذ") };
}

// ---- Direct model: one decision covers the credential check and the approval for cases ----
export function directSetupStatus(d: DirectConsultant, locale: Locale): ClinicianEntry["setup"] {
  if (d.accountStatus === "DISABLED") return { label: t(locale, "Access disabled", "الوصول معطّل"), tone: "neutral", bucket: "inactive" };
  if (d.credentialingStatus === "SUSPENDED") return { label: t(locale, "Suspended", "موقوف"), tone: "danger", bucket: "inactive" };
  if (d.credentialingStatus === "REJECTED") return { label: t(locale, "Not approved", "غير معتمد"), tone: "neutral", bucket: "inactive" };
  if (d.accountStatus === "INVITED") return { label: t(locale, "Setup in progress", "الإعداد قيد التنفيذ"), tone: "warning", bucket: "progress", detail: t(locale, "Invitation not accepted yet", "لم تُقبل الدعوة بعد") };
  if (d.credentialingStatus === "UNDER_REVIEW" || !d.credentialingStatus) return { label: t(locale, "Setup in progress", "الإعداد قيد التنفيذ"), tone: "warning", bucket: "progress", detail: t(locale, "Waiting for case approval", "بانتظار اعتماد الحالات") };
  return { label: t(locale, "Setup complete", "اكتمل الإعداد"), tone: "success", bucket: "complete" };
}
export function directCredentialStatus(d: DirectConsultant, locale: Locale): Badge {
  const detail = t(locale, "Checked at case approval", "يُراجَع عند اعتماد الحالات");
  switch (d.credentialingStatus) {
    case "VERIFIED": return { label: t(locale, "Verified", "تم التحقق"), tone: "success", detail };
    case "REJECTED": return { label: t(locale, "Rejected", "مرفوض"), tone: "danger", detail };
    case "SUSPENDED": return { label: t(locale, "Suspended", "موقوف"), tone: "danger", detail };
    case "EXPIRED": return { label: t(locale, "Expired", "منتهي الصلاحية"), tone: "danger", detail };
    default: return { label: t(locale, "Awaiting review", "بانتظار المراجعة"), tone: "warning", detail };
  }
}
/** The current case workflow assigns a Direct consultant who is approved, marked available and has a care area. */
export function directCaseEligibility(d: DirectConsultant, locale: Locale): Badge {
  const notReady = (detail: string): Badge => ({ label: t(locale, "Not ready for cases", "غير جاهز للحالات"), tone: "warning", detail });
  if (d.accountStatus === "DISABLED") return notReady(t(locale, "Account access disabled", "الوصول للحساب معطّل"));
  switch (d.credentialingStatus) {
    case "VERIFIED":
      if (!d.careCategory) return notReady(t(locale, "No care area set", "لم يُحدَّد مجال الرعاية"));
      return d.availabilityStatus === "AVAILABLE" ? { label: t(locale, "Can receive cases", "يمكنه استقبال الحالات"), tone: "success" }
        : { label: t(locale, "Not taking cases", "لا يستقبل حالات"), tone: "warning", detail: t(locale, "Approved, marked unavailable", "معتمد، ومسجَّل غير متاح") };
    case "REJECTED": return { label: t(locale, "Not approved for cases", "غير معتمد للحالات"), tone: "danger" };
    case "SUSPENDED": return { label: t(locale, "Suspended", "موقوف"), tone: "danger" };
    case "EXPIRED": return notReady(t(locale, "Approval expired", "انتهى الاعتماد"));
    default: return notReady(t(locale, "Waiting for case approval", "بانتظار اعتماد الحالات"));
  }
}

/**
 * The directory: one entry per clinician engagement. A Direct record under provider credentialing is not shown as Direct
 * (the backend refuses Direct approval for it); an unadopted legacy organization record is shown on its Direct entry.
 */
export function buildDirectory(providerRows: ProviderClinicianRow[], directRows: DirectConsultant[], locale: Locale): ClinicianEntry[] {
  const unnamed = t(locale, "Unnamed clinician", "طبيب بلا اسم مسجّل");
  const direct = directRows.filter((d) => !d.providerCredentialing).map((d): ClinicianEntry => {
    const setup = directSetupStatus(d, locale);
    return {
      key: `direct:${d.id}`, engagement: "direct", name: d.displayName?.trim() || unnamed, clinicianType: "CONSULTANT", specialty: d.specialty || undefined,
      organizationId: null, organizationName: t(locale, RS_NAME.en, RS_NAME.ar), href: directClinicianHref(locale, d.id),
      setup, credentials: directCredentialStatus(d, locale), eligibility: directCaseEligibility(d, locale),
      continueHref: setup.bucket === "progress" ? directClinicianHref(locale, d.id) : undefined,
    };
  });
  const byDirectId = new Map(directRows.filter((d) => !d.providerCredentialing).map((d, i) => [d.id, direct[i]]));
  const provider: ClinicianEntry[] = [];
  for (const r of providerRows) {
    const linked = !r.providerCredentialing ? byDirectId.get(r.practitionerId) : undefined;
    if (linked) { (linked.alsoLinked ??= []).push({ organizationName: r.organizationName, href: clinicianHref(locale, r.organizationId, r.practitionerId) }); continue; }
    const setup = providerSetupStatus(r, locale);
    provider.push({
      key: `provider:${r.organizationId}:${r.practitionerId}`, engagement: "provider", name: r.displayName?.trim() || unnamed, clinicianType: r.clinicianType,
      organizationId: r.organizationId, organizationName: r.organizationName, href: clinicianHref(locale, r.organizationId, r.practitionerId),
      setup, credentials: credentialSummary(r, locale), eligibility: providerCaseEligibility(r, locale),
      continueHref: setup.bucket === "progress" ? clinicianHref(locale, r.organizationId, r.practitionerId, "setup") : undefined,
    });
  }
  return [...direct, ...provider].sort((a, b) => a.name.localeCompare(b.name, locale));
}

export const clinicianTypeLabel = (type: string, locale: Locale) => personRoleLabel(type, locale);
/** Both directory reads, independently: one failing source is reported, never shown as "no clinicians". */
export function useClinicianDirectory(canProvider: boolean, canDirect: boolean) {
  const { user } = useAuth();
  const api = useAdminApi();
  const [providerRows, setProviderRows] = useState<ProviderClinicianRow[]>([]);
  const [directRows, setDirectRows] = useState<DirectConsultant[]>([]);
  const [providerError, setProviderError] = useState<unknown>(null);
  const [directError, setDirectError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const signedIn = !!user;
  const load = useCallback(async () => {
    if (!signedIn) { setLoading(false); return; }
    setLoading(true); setProviderError(null); setDirectError(null);
    const [p, d] = await Promise.allSettled([
      canProvider ? api<ProviderClinicianRow[]>("/admin/providers/clinicians") : Promise.resolve([]),
      canDirect ? api<DirectConsultant[]>("/admin/practitioners") : Promise.resolve([]),
    ]);
    if (p.status === "fulfilled") setProviderRows(p.value); else { setProviderRows([]); setProviderError(p.reason); }
    if (d.status === "fulfilled") setDirectRows(d.value); else { setDirectRows([]); setDirectError(d.reason); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, canProvider, canDirect]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { void load(); }, [load]);
  return { providerRows, directRows, providerError, directError, loading, reload: load };
}
