import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Home, Route, ShieldCheck, Stethoscope, Tags, Users, Workflow } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { ControlCenterAccess } from "./control-center-access";

/**
 * The Control Center information architecture — one definition for the sidebar, the breadcrumbs and the route map.
 * Visibility uses the platform permissions `/api/v1/me` reports; it only hides what the caller cannot use — the
 * backend authorizes every page and every call. Navigation is never an authorization boundary.
 *
 * Labels are business labels only; backend enums, permission keys and API paths keep their names.
 * Arabic labels follow the UX-0 draft glossary and still need native healthcare-operations review (plan V-9).
 */
export type NavKey =
  | "overview" | "consultants"
  | "identity"
  | "pricing" | "exchangeRates" | "marginDeposit"
  | "coordination"
  | "journeys"
  | "people" | "workforceIdentity" | "teams" | "staffing" | "administrators" | "ownership" | "support" | "recertification" | "serviceAccounts" | "audit";

export type NavItem = {
  key: NavKey; path: string; label: [string, string]; summary: [string, string];
  visible: (a: ControlCenterAccess) => boolean;
  /** A page that belongs under another section item (breadcrumb and active state follow the parent). */
  parent?: NavKey;
  /** Whether the item has its own sidebar line. Defaults to true, or false for a page with a parent. */
  sidebar?: (a: ControlCenterAccess) => boolean;
};
export type NavGroup = { key: string; label: [string, string]; icon: LucideIcon; items: NavItem[] };

export const ccBase = (locale: Locale) => `/${locale}/portal/control-center`;
export const ccHref = (locale: Locale, path = "") => ccBase(locale) + path;

export const NAV_GROUPS: NavGroup[] = [
  { key: "home", label: ["Home", "الرئيسية"], icon: Home, items: [
    { key: "overview", path: "", label: ["Home", "الرئيسية"], summary: ["What needs your attention.", "ما يحتاج إلى متابعتك."], visible: () => true },
  ] },
  { key: "consultants", label: ["Consultants", "الاستشاريون"], icon: Stethoscope, items: [
    { key: "consultants", path: "/consultants", label: ["Consultants", "الاستشاريون"], summary: ["Every consultant, their credential approval and whether they can receive cases.", "كل الاستشاريين واعتمادهم وهل يمكنهم استقبال الحالات."], visible: (a) => a.can("CREDENTIAL_READ") },
  ] },
  { key: "reviews", label: ["Reviews & Safety", "المراجعات والسلامة"], icon: BadgeCheck, items: [
    { key: "identity", path: "/identity-checks", label: ["Identity Checks", "التحقق من الهوية"], summary: ["Patient and representative identity evidence waiting for a decision.", "أدلة هوية المرضى والممثلين التي تنتظر قرارًا."], visible: (a) => a.can("PATIENT_IDENTITY_READ") },
  ] },
  { key: "commercial", label: ["Commercial", "الشؤون التجارية"], icon: Tags, items: [
    { key: "pricing", path: "/commercial/prices", label: ["Price Lists", "قوائم الأسعار"], summary: ["Consultant price lists and care-area service templates.", "قوائم أسعار الاستشاريين وقوالب الخدمات لكل مجال رعاية."], visible: (a) => a.can("CONSULTANT_CATALOG_MANAGE") },
    { key: "exchangeRates", path: "/commercial/exchange-rates", label: ["Exchange Rates", "أسعار الصرف"], summary: ["The rates used to show EGP prices in other currencies.", "الأسعار المستخدمة لعرض الأسعار بعملات غير الجنيه."], visible: (a) => a.can("REFERENCE_DATA_READ") && a.canAny(["COMMERCIAL_POLICY_READ", "COMMERCIAL_POLICY_MANAGE"]) },
    { key: "marginDeposit", path: "/commercial/margin-deposit", label: ["Margin & Deposit", "الهامش والدفعة المقدمة"], summary: ["The margin and coordination deposit applied to new cases.", "الهامش ودفعة التنسيق المقدمة المطبّقان على الحالات الجديدة."], visible: (a) => a.can("COMMERCIAL_POLICY_READ") },
  ] },
  { key: "operations", label: ["Operations", "العمليات"], icon: Workflow, items: [
    { key: "coordination", path: "/coordination", label: ["Coordination Setup", "إعداد التنسيق"], summary: ["Managed case summaries, coordinator capacity, team routing and routing rules.", "ملخصات الحالات المُدارة وسعة المنسقين وتوجيه الفرق وقواعد التوجيه."], visible: (a) => a.canAny(["ROUTING_READ", "COORDINATION_CASE_SUMMARY"]) },
  ] },
  // Journey design and publishing happen inside each journey (journey › version › design).
  { key: "journeys", label: ["Care Journeys", "رحلات الرعاية"], icon: Route, items: [
    { key: "journeys", path: "/journeys", label: ["Journeys", "الرحلات"], summary: ["Design, check and publish care journey versions.", "صمّم إصدارات رحلات الرعاية وتحقق منها وانشرها."], visible: (a) => a.can("JOURNEY_READ") },
  ] },
  { key: "workforce", label: ["Workforce", "فريق العمل"], icon: Users, items: [
    { key: "people", path: "/people", label: ["People", "الأشخاص"], summary: ["RehletShifaa staff: invitations, roles, lifecycle and offboarding.", "موظفو رحلة شفاء: الدعوات والأدوار ودورة العمل وإنهاء الخدمة."], visible: (a) => a.can("WORKFORCE_READ") },
    { key: "workforceIdentity", path: "/workforce-identity-reviews", label: ["Workforce Identity Reviews", "مراجعات هوية الموظفين"], summary: ["Resolve workforce invitation identity conflicts and track holder acceptance.", "معالجة تعارضات هوية دعوات الموظفين ومتابعة قبول صاحب الهوية."], visible: (a) => a.can("WORKFORCE_ADMINISTER") },
    { key: "teams", path: "/teams", label: ["Teams", "الفرق"], summary: ["Teams, team leads and reporting lines for each function.", "الفرق وقادتها وخطوط الإشراف لكل وظيفة."], visible: (a) => a.canAny(["WORKFORCE_READ", "TEAM_MANAGE"]) },
    { key: "staffing", path: "/staffing-requests", label: ["Staffing Requests", "طلبات التوظيف"], summary: ["Requests for new staff, decided by a system administrator.", "طلبات موظفين جدد يقررها مسؤول النظام."], visible: (a) => a.canAny(["STAFFING_REQUEST", "WORKFORCE_ADMINISTER"]) },
  ] },
  { key: "access", label: ["Access & Governance", "الصلاحيات والحوكمة"], icon: ShieldCheck, items: [
    { key: "administrators", path: "/administrators", label: ["Administrators", "مسؤولو النظام"], summary: ["System administrator changes (two-person approval) and platform ownership.", "تغييرات مسؤولي النظام (بموافقة شخصين) وملكية المنصة."], visible: (a) => a.can("ACCESS_GOVERN") || !!a.me?.platformAccountOwner },
    { key: "ownership", path: "/ownership", label: ["Platform Ownership", "ملكية المنصة"], summary: ["Who owns the platform, and handing ownership over with the incoming owner's acceptance and an independent check.", "من يملك المنصة، وتسليم الملكية بقبول المالك الجديد وتحقق مستقل."], visible: (a) => a.can("ACCESS_GOVERN") || !!a.me?.platformAccountOwner || !!a.me?.pendingActions.includes("ACCEPT_PLATFORM_OWNERSHIP") },
    { key: "support", path: "/account-support", label: ["Account Support", "دعم الحسابات"], summary: ["Verify a caller, resend an invitation, send a password reset or request an MFA reset.", "تحقق من المتصل، وأعد إرسال الدعوة، وأرسل إعادة تعيين كلمة المرور أو اطلب إعادة تعيين التحقق."], visible: (a) => a.can("SUPPORT_ACCOUNT") },
    { key: "recertification", path: "/recertification", label: ["Access Reviews", "مراجعات الصلاحيات"], summary: ["Periodic confirmation that every role is still needed; MFA reset approvals.", "تأكيد دوري لحاجة كل دور؛ والموافقة على إعادة تعيين التحقق."], visible: (a) => a.can("WORKFORCE_READ") },
    { key: "serviceAccounts", path: "/service-accounts", label: ["Service Accounts", "حسابات الخدمة"], summary: ["Machine clients, their owners and credential rotation.", "العملاء الآليون ومالكوهم وتدوير بيانات الاعتماد."], visible: (a) => a.can("WORKFORCE_READ") },
    { key: "audit", path: "/audit", label: ["Audit", "سجل التدقيق"], summary: ["Every access, workforce and journey governance change.", "كل تغيير في الصلاحيات وفريق العمل وحوكمة الرحلات."], visible: (a) => a.can("AUDIT_READ") },
  ] },
];
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const navItem = (key: NavKey) => NAV_ITEMS.find((i) => i.key === key)!;
export const navGroupOf = (key: NavKey) => NAV_GROUPS.find((g) => g.items.some((i) => i.key === key))!;
export const pick = (pair: [string, string], locale: Locale) => (locale === "ar" ? pair[1] : pair[0]);

/** Whether an item has its own sidebar line for this caller. */
export const inSidebar = (item: NavItem, a: ControlCenterAccess) => item.visible(a) && (item.sidebar ? item.sidebar(a) : !item.parent);

/** The sidebar for this caller: groups with at least one line, each keeping only the lines the caller can open. */
export function sidebarGroups(a: ControlCenterAccess) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => inSidebar(i, a)) })).filter((g) => g.items.length);
}

/** Every Control Center area this caller can open, Home excluded. Empty means the Control Center has nothing for them. */
export function openableSections(a: ControlCenterAccess) {
  return NAV_ITEMS.filter((i) => i.key !== "overview" && inSidebar(i, a));
}
