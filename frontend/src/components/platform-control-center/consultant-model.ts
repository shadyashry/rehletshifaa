import type { Locale } from "@/lib/i18n";
import { ccHref } from "./control-center-nav";
import type { Tone } from "./admin-labels";

/**
 * A Consultant as `GET /admin/practitioners` reports them. Consultants work directly with RehletShifaa: one credential
 * and case-approval decision on their own record, their own price list, and their own account. Every label below is
 * derived from a stored backend fact.
 */
export type Consultant = {
  id: string; displayName?: string; specialty?: string; subspecialty?: string; careCategory?: string;
  credentialingStatus?: string; availabilityStatus?: string; email?: string;
  accountStatus?: "INVITED" | "ACTIVE" | "DISABLED"; invitedAt?: string;
};

export type Badge = { label: string; tone: Tone; detail?: string };
export type SetupBucket = "progress" | "complete" | "inactive";

export const consultantsHref = (locale: Locale) => ccHref(locale, "/consultants");
export const consultantHref = (locale: Locale, id: string, tab?: string) => ccHref(locale, `/consultants/${id}${tab ? `?tab=${tab}` : ""}`);
export const addConsultantHref = (locale: Locale) => ccHref(locale, "/consultants/new");

const t = (locale: Locale, en: string, ar: string) => (locale === "ar" ? ar : en);

export function setupStatus(d: Consultant, locale: Locale): Badge & { bucket: SetupBucket } {
  if (d.accountStatus === "DISABLED") return { label: t(locale, "Access disabled", "الوصول معطّل"), tone: "neutral", bucket: "inactive" };
  if (d.credentialingStatus === "SUSPENDED") return { label: t(locale, "Suspended", "موقوف"), tone: "danger", bucket: "inactive" };
  if (d.credentialingStatus === "REJECTED") return { label: t(locale, "Not approved", "غير معتمد"), tone: "neutral", bucket: "inactive" };
  if (d.accountStatus === "INVITED") return { label: t(locale, "Setup in progress", "الإعداد قيد التنفيذ"), tone: "warning", bucket: "progress", detail: t(locale, "Invitation not accepted yet", "لم تُقبل الدعوة بعد") };
  if (d.credentialingStatus === "UNDER_REVIEW" || !d.credentialingStatus) return { label: t(locale, "Setup in progress", "الإعداد قيد التنفيذ"), tone: "warning", bucket: "progress", detail: t(locale, "Waiting for case approval", "بانتظار اعتماد الحالات") };
  return { label: t(locale, "Setup complete", "اكتمل الإعداد"), tone: "success", bucket: "complete" };
}

export function credentialStatus(d: Consultant, locale: Locale): Badge {
  const detail = t(locale, "Checked at case approval", "يُراجَع عند اعتماد الحالات");
  switch (d.credentialingStatus) {
    case "VERIFIED": return { label: t(locale, "Verified", "تم التحقق"), tone: "success", detail };
    case "REJECTED": return { label: t(locale, "Rejected", "مرفوض"), tone: "danger", detail };
    case "SUSPENDED": return { label: t(locale, "Suspended", "موقوف"), tone: "danger", detail };
    case "EXPIRED": return { label: t(locale, "Expired", "منتهي الصلاحية"), tone: "danger", detail };
    default: return { label: t(locale, "Awaiting review", "بانتظار المراجعة"), tone: "warning", detail };
  }
}

/** The case workflow assigns a Consultant who is approved, marked available and has a care area. */
export function caseEligibility(d: Consultant, locale: Locale): Badge {
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
