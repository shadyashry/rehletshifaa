import type { Locale } from "@/lib/i18n";

/**
 * Business-language labels for backend states. The backend value is never changed; these only translate it
 * for people. Unknown values fall back to a readable form of the raw key so nothing is ever hidden.
 */
export type Tone = "success" | "warning" | "danger" | "neutral" | "info";
type Entry = { en: string; ar: string; tone: Tone };

const readable = (key: string) => key.charAt(0) + key.slice(1).toLowerCase().replaceAll("_", " ");
const lookup = (map: Record<string, Entry>, key: string | null | undefined, locale: Locale) => {
  if (!key) return { label: "—", tone: "neutral" as Tone };
  const e = map[key];
  return { label: e ? (locale === "ar" ? e.ar : e.en) : readable(key), tone: e?.tone ?? "neutral" };
};

const clinicianStatus: Record<string, Entry> = {
  INVITED: { en: "Invitation sent", ar: "تم إرسال الدعوة", tone: "info" },
  PROFILE_INCOMPLETE: { en: "Setup in progress", ar: "الإعداد قيد التنفيذ", tone: "warning" },
  DOCUMENTS_SUBMITTED: { en: "Credentials submitted", ar: "تم تقديم الاعتمادات", tone: "info" },
  UNDER_VERIFICATION: { en: "Credentials in review", ar: "الاعتمادات قيد المراجعة", tone: "info" },
  MORE_INFORMATION_REQUIRED: { en: "Correction requested", ar: "مطلوب تصحيح", tone: "warning" },
  VERIFIED: { en: "Credentials verified", ar: "تم التحقق من الاعتمادات", tone: "success" },
  REJECTED: { en: "Not approved", ar: "غير معتمد", tone: "danger" },
  OPERATIONAL_SETUP: { en: "Working setup in progress", ar: "إعداد العمل قيد التنفيذ", tone: "warning" },
  ACTIVE: { en: "Active", ar: "نشط", tone: "success" },
  SUSPENDED: { en: "Suspended", ar: "موقوف", tone: "danger" },
  OFFBOARDED: { en: "Offboarded", ar: "منتهٍ", tone: "neutral" },
  LEGACY_UNREVIEWED: { en: "Imported — review needed", ar: "سجل مستورد — يحتاج مراجعة", tone: "warning" },
};
const orgStatus: Record<string, Entry> = {
  DRAFT: { en: "Setup in progress", ar: "الإعداد قيد التنفيذ", tone: "warning" },
  ONBOARDING: { en: "Onboarding", ar: "قيد التهيئة", tone: "info" },
  READINESS_REVIEW: { en: "Ready for review", ar: "جاهزة للمراجعة", tone: "info" },
  ACTIVE: { en: "Active", ar: "نشطة", tone: "success" },
  SUSPENDED: { en: "Suspended", ar: "موقوفة", tone: "danger" },
  OFFBOARDED: { en: "Offboarded", ar: "منتهية", tone: "neutral" },
};
const credentialStatus: Record<string, Entry> = {
  SUBMITTED: { en: "Awaiting review", ar: "بانتظار المراجعة", tone: "warning" },
  UNDER_REVIEW: { en: "In review", ar: "قيد المراجعة", tone: "info" },
  VERIFIED: { en: "Verified", ar: "تم التحقق", tone: "success" },
  REJECTED: { en: "Rejected", ar: "مرفوض", tone: "danger" },
  MORE_INFORMATION_REQUIRED: { en: "Correction requested", ar: "مطلوب تصحيح", tone: "warning" },
  SUSPENDED: { en: "Suspended", ar: "موقوف", tone: "danger" },
};
const memberStatus: Record<string, Entry> = {
  PENDING: { en: "Invitation pending", ar: "الدعوة معلّقة", tone: "warning" },
  ACTIVE: { en: "Active", ar: "نشط", tone: "success" },
  REVOKED: { en: "Removed", ar: "أُزيل", tone: "neutral" },
};
const accountStatus: Record<string, Entry> = {
  INVITED: { en: "Invitation pending", ar: "بانتظار التفعيل", tone: "warning" },
  ACTIVE: { en: "Active", ar: "نشط", tone: "success" },
  DISABLED: { en: "Access disabled", ar: "الوصول معطّل", tone: "neutral" },
};
/** Legacy practitioner credentialing (direct consultants). */
const approvalStatus: Record<string, Entry> = {
  INVITED: { en: "Invitation sent", ar: "تم إرسال الدعوة", tone: "info" },
  PROFILE_INCOMPLETE: { en: "Profile incomplete", ar: "الملف غير مكتمل", tone: "warning" },
  UNDER_REVIEW: { en: "Awaiting approval", ar: "بانتظار الاعتماد", tone: "warning" },
  EXPIRED: { en: "Approval expired", ar: "انتهى الاعتماد", tone: "danger" },
  VERIFIED: { en: "Approved for cases", ar: "معتمد للحالات", tone: "success" },
  APPROVED: { en: "Approved for cases", ar: "معتمد للحالات", tone: "success" },
  REJECTED: { en: "Not approved", ar: "غير معتمد", tone: "danger" },
  SUSPENDED: { en: "Suspended", ar: "موقوف", tone: "danger" },
};
const priceStatus: Record<string, Entry> = {
  DRAFT: { en: "Draft — not live yet", ar: "مسودة — غير منشورة", tone: "warning" },
  ACTIVE: { en: "Live", ar: "منشور", tone: "success" },
  RETIRED: { en: "Retired", ar: "متوقف", tone: "neutral" },
};

export const clinicianStatusLabel = (k: string | null | undefined, l: Locale) => lookup(clinicianStatus, k, l);
export const organizationStatusLabel = (k: string | null | undefined, l: Locale) => lookup(orgStatus, k, l);
export const credentialReviewStatus = (k: string | null | undefined, l: Locale) => lookup(credentialStatus, k, l);
export const membershipStatusLabel = (k: string | null | undefined, l: Locale) => lookup(memberStatus, k, l);
export const accountStatusLabel = (k: string | null | undefined, l: Locale) => lookup(accountStatus, k, l);
export const approvalStatusLabel = (k: string | null | undefined, l: Locale) => lookup(approvalStatus, k, l);
export const priceLiveStatus = (k: string | null | undefined, l: Locale) => lookup(priceStatus, k, l);

const roleNames: Record<string, [string, string]> = {
  CONSULTANT: ["Consultant", "استشاري"], ASSOCIATE_DOCTOR: ["Associate doctor", "طبيب مشارك"],
  PRACTICE_MANAGER: ["Practice manager", "مدير العيادة"], CONSULTANT_ASSISTANT: ["Consultant assistant", "مساعد الاستشاري"],
  ORGANIZATION_OWNER: ["Organization owner", "مالك المؤسسة"], PROVIDER_OPERATIONS_MANAGER: ["Provider operations manager", "مدير عمليات مقدمي الرعاية"],
};
export const personRoleLabel = (key: string, locale: Locale) => roleNames[key]?.[locale === "ar" ? 1 : 0] ?? readable(key);

/** Credential types are policy codes; show them as words when the policy's own display name is not at hand. */
const credentialTypes: Record<string, [string, string]> = {
  MEDICAL_LICENSE: ["Medical licence", "ترخيص مزاولة المهنة"], MEDICAL_LICENCE: ["Medical licence", "ترخيص مزاولة المهنة"],
  SPECIALIST_REGISTRATION: ["Specialist registration", "تسجيل التخصص"], BOARD_CERTIFICATION: ["Board certification", "شهادة البورد"],
  MALPRACTICE_INSURANCE: ["Indemnity insurance", "تأمين المسؤولية المهنية"], INDEMNITY_INSURANCE: ["Indemnity insurance", "تأمين المسؤولية المهنية"],
  IDENTITY_DOCUMENT: ["Identity document", "وثيقة الهوية"], GOOD_STANDING: ["Certificate of good standing", "شهادة حسن السيرة المهنية"],
};
export const credentialTypeLabel = (key: string, locale: Locale) => credentialTypes[key]?.[locale === "ar" ? 1 : 0] ?? readable(key);

/**
 * Where each backend readiness blocker is fixed. The wizard and the consultant workspace show a blocker
 * next to the section that resolves it; the backend message stays available underneath.
 */
export type SetupArea = "details" | "professional" | "working" | "organization";
const blockers: Record<string, { area: SetupArea; en: string; ar: string }> = {
  IDENTITY_NOT_PROVISIONED: { area: "details", en: "The sign-in account has not been created yet.", ar: "لم يُنشأ حساب الدخول بعد." },
  MEMBERSHIP_INACTIVE: { area: "details", en: "Their organization membership is not active yet.", ar: "عضويته في المؤسسة غير نشطة بعد." },
  PROVIDER_PROFILE_INCOMPLETE: { area: "organization", en: "The organization's profile is incomplete.", ar: "ملف المؤسسة غير مكتمل." },
  CLINICIAN_PROFILE_INCOMPLETE: { area: "professional", en: "Professional details are missing.", ar: "البيانات المهنية غير مكتملة." },
  CREDENTIAL_POLICY_UNCONFIGURED: { area: "professional", en: "No credential requirements exist for this country yet — contact the platform team.", ar: "لا توجد متطلبات اعتماد لهذه الدولة بعد — تواصل مع فريق المنصة." },
  CREDENTIAL_MISSING: { area: "professional", en: "A required credential has not been added.", ar: "لم يُضف اعتماد مطلوب." },
  CREDENTIAL_AWAITING_VERIFICATION: { area: "professional", en: "A credential is waiting for review.", ar: "اعتماد بانتظار المراجعة." },
  CREDENTIAL_EXPIRED: { area: "professional", en: "A credential has expired.", ar: "انتهت صلاحية اعتماد." },
  SUPERVISION_REQUIRED: { area: "professional", en: "An associate doctor needs an active supervising consultant.", ar: "يحتاج الطبيب المشارك إلى استشاري مشرف نشط." },
  OPERATIONAL_SETUP_UNAVAILABLE: { area: "working", en: "Working setup is not available yet.", ar: "إعداد العمل غير متاح بعد." },
  SERVICES_PRICING_INCOMPLETE: { area: "working", en: "At least one live price is needed.", ar: "يلزم سعر منشور واحد على الأقل." },
  AVAILABILITY_INCOMPLETE: { area: "working", en: "Weekly availability has not been set.", ar: "لم يُحدَّد التوافر الأسبوعي." },
  ROUTING_INCOMPLETE: { area: "working", en: "A routing preference is missing (set in Care coordination).", ar: "تفضيل التوجيه غير موجود (يُضبط في تنسيق الرعاية)." },
  COMMERCIAL_ACCEPTANCE_MISSING: { area: "working", en: "Commercial or legal terms have not been accepted.", ar: "لم تُقبل الشروط التجارية أو القانونية." },
};
export const blockerInfo = (code: string, message: string, locale: Locale) => {
  const b = blockers[code];
  return { area: (b?.area ?? "working") as SetupArea, label: b ? (locale === "ar" ? b.ar : b.en) : message, detail: message };
};

/** Relationship keys stay unchanged on the wire; people see what the relationship means. */
const relationshipNames: Record<string, [string, string]> = {
  SUPERVISES: ["Supervising consultant", "الاستشاري المشرف"], MANAGES: ["Manages consultant", "يدير الاستشاري"], ASSISTS: ["Assists consultant", "يساعد الاستشاري"],
};
export const relationshipLabel = (key: string, locale: Locale) => relationshipNames[key]?.[locale === "ar" ? 1 : 0] ?? readable(key);

const careAreas: Record<string, [string, string]> = { cardiology: ["Cardiology", "أمراض القلب"], "rheumatology-rehabilitation": ["Rehabilitation & Dysphagia", "إعادة التأهيل والبلع"], orthopedics: ["Orthopedics", "العظام"] };
export const CARE_AREAS = Object.keys(careAreas);
export const careAreaLabel = (slug: string | null | undefined, locale: Locale) => (slug ? careAreas[slug]?.[locale === "ar" ? 1 : 0] ?? slug.replace(/-/g, " ") : "—");

export const formatDate = (iso: string | null | undefined, locale: Locale) => (iso ? new Date(iso).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
