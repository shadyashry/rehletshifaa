import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Building2, Home, Route, ShieldCheck, Tags, Workflow } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { COORDINATION_VIEW, type ControlCenterAccess } from "./control-center-access";

/**
 * The Control Center information architecture (UX-0 plan §2) — one definition for the sidebar, the breadcrumbs and
 * the route map. Visibility uses exact backend capability keys (or, for the legacy administration endpoints, the same
 * realm-role check the backend applies); it only hides what the caller cannot use — the backend authorizes every page
 * and every call. Navigation is never an authorization boundary.
 *
 * Labels are business labels only; backend enums, permission keys and API paths keep their names.
 * Arabic labels follow the UX-0 draft glossary and still need native healthcare-operations review (plan V-9).
 */
export type NavKey =
  | "overview" | "organizations" | "consultants" | "practiceTeam" | "availability"
  | "credentials" | "identity"
  | "pricing" | "exchangeRates" | "marginDeposit"
  | "staff" | "coordination"
  | "journeys"
  | "accessUsers" | "accessEffective" | "accessRoles" | "accessPermissions" | "accessAudit";

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

const access = (specific?: string) => (a: ControlCenterAccess) => a.can("access.role.view") && (!specific || a.can(specific));
const canOpenClinicians = (a: ControlCenterAccess) => a.can("provider.view") || a.legacy.admin;

export const NAV_GROUPS: NavGroup[] = [
  { key: "home", label: ["Home", "الرئيسية"], icon: Home, items: [
    { key: "overview", path: "", label: ["Home", "الرئيسية"], summary: ["What needs your attention.", "ما يحتاج إلى متابعتك."], visible: () => true },
  ] },
  { key: "providers", label: ["Providers", "مقدمو الرعاية"], icon: Building2, items: [
    { key: "organizations", path: "/providers", label: ["Organizations", "الجهات الطبية"], summary: ["Hospitals, clinics and practices that work with RehletShifaa.", "المستشفيات والعيادات والممارسات التي تعمل مع رحلة شفاء."], visible: (a) => a.can("provider.view") },
    { key: "consultants", path: "/providers/clinicians", label: ["Clinicians", "الأطباء"], summary: ["Every clinician, Direct or through a provider organization, and how far their setup has progressed.", "كل الأطباء، مباشرةً أو من خلال جهة طبية، ومدى تقدم إعدادهم."], visible: canOpenClinicians },
    { key: "practiceTeam", path: "/providers/practice-team", label: ["Practice Staff", "فريق العيادة"], summary: ["Practice managers, consultant assistants and organization owners.", "مديرو العيادات ومساعدو الاستشاريين ومالكو الجهات."], visible: (a) => a.can("provider.view") },
    // Clinician schedules live on each clinician's page (UX-3). The hub remains only for people who can read schedules
    // but cannot open Clinicians (e.g. clinical support), so they are never left without a way in.
    { key: "availability", path: "/commercial/availability", parent: "consultants", label: ["Schedules", "الجداول"], summary: ["Weekly hours, leave and clinic closures for each clinician.", "ساعات العمل الأسبوعية والإجازات وإغلاق العيادات لكل طبيب."], visible: (a) => a.can("availability.view"), sidebar: (a) => !canOpenClinicians(a) },
  ] },
  { key: "reviews", label: ["Reviews & Safety", "المراجعات والسلامة"], icon: BadgeCheck, items: [
    { key: "credentials", path: "/credentials", label: ["Credential Reviews", "مراجعة التراخيص والمؤهلات"], summary: ["Licences and certificates waiting for an independent decision.", "التراخيص والشهادات التي تنتظر قرارًا مستقلًا."], visible: (a) => a.can("credential.review") || a.legacy.admin },
    { key: "identity", path: "/identity-checks", label: ["Identity Checks", "التحقق من الهوية"], summary: ["Patient and representative identity evidence waiting for a decision.", "أدلة هوية المرضى والممثلين التي تنتظر قرارًا."], visible: (a) => a.legacy.identityReviewer },
  ] },
  { key: "commercial", label: ["Commercial", "الشؤون التجارية"], icon: Tags, items: [
    { key: "pricing", path: "/commercial/prices", label: ["Price Lists", "قوائم الأسعار"], summary: ["Service prices and how the applicable price is chosen.", "أسعار الخدمات وكيف يُختار السعر المطبّق."], visible: (a) => a.can("price_list.view") || a.legacy.admin },
    { key: "exchangeRates", path: "/commercial/exchange-rates", label: ["Exchange Rates", "أسعار الصرف"], summary: ["The rates used to show EGP prices in other currencies.", "الأسعار المستخدمة لعرض الأسعار بعملات غير الجنيه."], visible: (a) => a.legacy.admin },
    { key: "marginDeposit", path: "/commercial/margin-deposit", label: ["Margin & Deposit", "الهامش والدفعة المقدمة"], summary: ["The margin and coordination deposit applied to new cases.", "الهامش ودفعة التنسيق المقدمة المطبّقان على الحالات الجديدة."], visible: (a) => a.legacy.financePolicy },
  ] },
  { key: "operations", label: ["Operations", "العمليات"], icon: Workflow, items: [
    { key: "staff", path: "/team", label: ["RehletShifaa Staff", "فريق رحلة شفاء"], summary: ["Coordination, operations and finance staff, and their team leads.", "موظفو التنسيق والعمليات والمالية وقادة فرقهم."], visible: (a) => a.legacy.admin },
    { key: "coordination", path: "/coordination", label: ["Coordination Setup", "إعداد التنسيق"], summary: ["Coordinator teams, clinician preferences and routing rules.", "فرق المنسقين وتفضيلات الأطباء وقواعد التوجيه."], visible: (a) => a.canAny(COORDINATION_VIEW) },
  ] },
  // Journey design and publishing happen inside each journey (journey › version › design); there is no separate
  // cross-journey destination, so the group has one sidebar line.
  { key: "journeys", label: ["Care Journeys", "رحلات الرعاية"], icon: Route, items: [
    { key: "journeys", path: "/journeys", label: ["Journeys", "الرحلات"], summary: ["Design, check and publish care journey versions.", "صمّم إصدارات رحلات الرعاية وتحقق منها وانشرها."], visible: (a) => a.can("journey.view") },
  ] },
  { key: "access", label: ["Access & Governance", "الصلاحيات والحوكمة"], icon: ShieldCheck, items: [
    { key: "accessUsers", path: "/access/users", label: ["People", "الأشخاص"], summary: ["Find a person and see or change their business access.", "ابحث عن شخص واعرض صلاحياته في العمل أو غيّرها."], visible: access("access.effective_access.view") },
    { key: "accessEffective", path: "/access/effective", parent: "accessUsers", label: ["Access summary", "ملخص الصلاحيات"], summary: ["Can this person…? The platform's own answer and reason.", "هل يستطيع هذا الشخص…؟ إجابة المنصة وسببها."], visible: access("access.effective_access.view") },
    { key: "accessRoles", path: "/access/roles", label: ["Roles", "الأدوار"], summary: ["What each business role allows, and where it applies.", "ما يسمح به كل دور وأين يُطبَّق."], visible: access() },
    { key: "accessPermissions", path: "/access/permissions", parent: "accessRoles", label: ["Permission reference", "مرجع الصلاحيات"], summary: ["Everything a role can grant, grouped by area.", "كل ما يمكن أن يمنحه الدور، مجمّعًا حسب المجال."], visible: access() },
    { key: "accessAudit", path: "/access/audit", label: ["Audit", "سجل التدقيق"], summary: ["Every access change and decision.", "كل تغيير وقرار في الصلاحيات."], visible: access("access.audit.view") },
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
