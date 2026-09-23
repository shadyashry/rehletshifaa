import type { LucideIcon } from "lucide-react";
import { BadgeCheck, Building2, CalendarClock, Eye, Fingerprint, History, KeyRound, LayoutDashboard, Route, ShieldCheck, Stethoscope, Tags, UserCog, Users, UsersRound, Workflow } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { COORDINATION_VIEW, type ControlCenterAccess } from "./control-center-access";

/**
 * The Control Center information architecture — one definition for the sidebar, the Overview's
 * "What do you want to manage?" cards and the route map. Visibility uses exact backend capability keys
 * (or, for the legacy administration endpoints, the same realm-role check the backend applies); it only
 * hides what the caller cannot use — the backend authorizes every page and every call.
 */
export type NavKey =
  | "overview" | "organizations" | "consultants" | "practiceTeam" | "credentials" | "pricing" | "availability"
  | "staff" | "identity" | "coordination" | "journeys"
  | "accessUsers" | "accessRoles" | "accessEffective" | "accessPermissions" | "accessAudit";

export type NavItem = { key: NavKey; path: string; icon: LucideIcon; label: [string, string]; summary: [string, string]; visible: (a: ControlCenterAccess) => boolean };
export type NavGroup = { key: string; label: [string, string]; items: NavItem[] };

export const ccBase = (locale: Locale) => `/${locale}/portal/control-center`;
export const ccHref = (locale: Locale, path = "") => ccBase(locale) + path;

const access = (specific?: string) => (a: ControlCenterAccess) => a.can("access.role.view") && (!specific || a.can(specific));

export const NAV_GROUPS: NavGroup[] = [
  { key: "home", label: ["", ""], items: [
    { key: "overview", path: "", icon: LayoutDashboard, label: ["Overview", "نظرة عامة"], summary: ["What needs your attention today.", "ما يحتاج إلى متابعتك اليوم."], visible: () => true },
  ] },
  { key: "providers", label: ["Providers", "مقدمو الرعاية"], items: [
    { key: "organizations", path: "/providers", icon: Building2, label: ["Organizations", "المؤسسات"], summary: ["Hospitals, clinics and practices you work with.", "المستشفيات والعيادات والممارسات التي تتعامل معها."], visible: (a) => a.can("provider.view") },
    { key: "consultants", path: "/providers/consultants", icon: Stethoscope, label: ["Consultants", "الاستشاريون"], summary: ["Add consultants and follow their setup to activation.", "أضف الاستشاريين وتابع إعدادهم حتى التفعيل."], visible: (a) => a.can("provider.view") || a.legacy.admin },
    { key: "practiceTeam", path: "/providers/practice-team", icon: UsersRound, label: ["Practice team", "فريق العيادة"], summary: ["Practice managers and consultant assistants.", "مديرو العيادات ومساعدو الاستشاريين."], visible: (a) => a.can("provider.view") },
  ] },
  { key: "credentials", label: ["Credentials", "الاعتمادات"], items: [
    { key: "credentials", path: "/credentials", icon: BadgeCheck, label: ["Credential reviews", "مراجعة الاعتمادات"], summary: ["Check licences and certificates waiting for a decision.", "راجع التراخيص والشهادات التي تنتظر قرارًا."], visible: (a) => a.can("credential.review") || a.legacy.admin },
  ] },
  { key: "commercial", label: ["Commercial setup", "الإعداد التجاري"], items: [
    { key: "pricing", path: "/commercial/pricing", icon: Tags, label: ["Pricing", "الأسعار"], summary: ["Service prices, templates and exchange rates.", "أسعار الخدمات والقوالب وأسعار الصرف."], visible: (a) => a.can("price_list.view") || a.legacy.admin },
    { key: "availability", path: "/commercial/availability", icon: CalendarClock, label: ["Availability", "المواعيد المتاحة"], summary: ["Weekly schedules, leave and clinic closures.", "الجداول الأسبوعية والإجازات وإغلاق العيادات."], visible: (a) => a.can("availability.view") },
  ] },
  { key: "team", label: ["Care operations team", "فريق العمليات"], items: [
    { key: "staff", path: "/team", icon: UserCog, label: ["Staff & teams", "الموظفون والفرق"], summary: ["Invite coordinators, operations and finance staff; set team leads.", "ادعُ موظفي التنسيق والعمليات والمالية وحدّد قادة الفرق."], visible: (a) => a.legacy.admin },
    { key: "identity", path: "/identity-checks", icon: Fingerprint, label: ["Identity checks", "التحقق من الهوية"], summary: ["Patient and representative identity requests.", "طلبات التحقق من هوية المرضى والممثلين."], visible: (a) => a.legacy.identityReviewer },
  ] },
  { key: "coordination", label: ["Care coordination", "تنسيق الرعاية"], items: [
    { key: "coordination", path: "/coordination", icon: Workflow, label: ["Teams & routing", "الفرق والتوجيه"], summary: ["Coordinator teams, routing rules and the assignment queue.", "فرق المنسقين وقواعد التوجيه وقائمة التعيين."], visible: (a) => a.canAny(COORDINATION_VIEW) },
  ] },
  { key: "journeys", label: ["Journeys", "الرحلات"], items: [
    { key: "journeys", path: "/journeys", icon: Route, label: ["Journey library", "مكتبة الرحلات"], summary: ["Design, check and publish care journeys.", "صمّم رحلات الرعاية وتحقق منها وانشرها."], visible: (a) => a.can("journey.view") },
  ] },
  { key: "access", label: ["Access & governance", "الوصول والحوكمة"], items: [
    { key: "accessUsers", path: "/access/users", icon: Users, label: ["User access", "وصول المستخدمين"], summary: ["See and change what a person can do.", "اعرض وغيّر ما يستطيع الشخص القيام به."], visible: access("access.effective_access.view") },
    { key: "accessRoles", path: "/access/roles", icon: ShieldCheck, label: ["Roles", "الأدوار"], summary: ["Create and publish job roles.", "أنشئ الأدوار الوظيفية وانشرها."], visible: access() },
    { key: "accessEffective", path: "/access/effective", icon: Eye, label: ["Effective access", "الوصول الفعلي"], summary: ["Why a person can — or cannot — do something.", "لماذا يستطيع الشخص — أو لا يستطيع — القيام بإجراء."], visible: access("access.effective_access.view") },
    { key: "accessPermissions", path: "/access/permissions", icon: KeyRound, label: ["Permissions", "الصلاحيات"], summary: ["The catalogue of everything a role can grant.", "دليل كل ما يمكن أن يمنحه الدور."], visible: access() },
    { key: "accessAudit", path: "/access/audit", icon: History, label: ["Audit", "سجل التدقيق"], summary: ["Every access change and decision.", "كل تغيير وقرار في الوصول."], visible: access("access.audit.view") },
  ] },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const navItem = (key: NavKey) => NAV_ITEMS.find((i) => i.key === key)!;
export const pick = (pair: [string, string], locale: Locale) => (locale === "ar" ? pair[1] : pair[0]);
