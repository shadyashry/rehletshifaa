"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Clock } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { CONTROL_CENTER_ROLES, portalRoles } from "@/lib/portal-role-access";
import { PortalAccount, type Preferences } from "@/components/portal/PortalAccount";
import { NoPortalWorkspace } from "@/components/portal/NoPortalWorkspace";
import { stageLabel } from "@/components/portal/JourneySnapshot";
import { useAdminApi } from "@/components/platform-control-center/admin-api";
import { CredentialRequirements } from "@/components/platform-control-center/consultant-setup";
import { PricingManagement } from "@/components/platform-control-center/PricingManagement";
import { AvailabilityManagement } from "@/components/platform-control-center/AvailabilityManagement";
import { ccHref } from "@/components/platform-control-center/control-center-nav";
import { organizationStatusLabel, personRoleLabel } from "@/components/platform-control-center/admin-labels";
import { providerSetupStatus } from "@/components/platform-control-center/clinician-model";
import "@/components/platform-control-center/control-center.css";
import {
  allowed, attention, canManageOrganization, personas, practiceHref, sections, useProviderPractice,
  type CasePage, type CaseSummary, type ManagedClinician, type Practice, type SectionKey,
} from "./provider-workspace-model";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const copy = {
  en: {
    title: "My Practice", portal: "Secure care portal", loading: "Loading your practice…", signIn: "Sign in securely", signInLead: "Sign in to open your practice workspace.",
    failed: "We couldn't load your practice. Nothing has changed.", retry: "Try again", practice: "Practice", nav: "My Practice sections", workspace: "Workspace",
    staffPortal: "Staff Portal", manage: "Manage organization", manageHint: "Organization setup, people and relationships — in the Control Center.",
    sections: { home: "Home", cases: "My cases", credentials: "My credentials", schedule: "My schedule", prices: "My prices", clinicians: "My clinicians" } as Record<SectionKey, string>,
    whoAmI: "You in this practice", roles: "Your role", organization: "Organization", setup: "Your setup", relationships: "Professional relationships", noRelationships: "No professional relationships are recorded for you here.",
    attention: "Needs your attention", open: "Open",
    noCases: "No assigned cases yet.", noCasesBody: "Cases will appear here when you are eligible for assignment and a case is assigned to you.",
    casesLead: "Cases assigned to you. Only the case number, patient name and where the case stands are shown here.", more: "Show more cases", loadingCases: "Loading your cases…", casesFailed: "Your cases couldn't be loaded.",
    offered: "Offered to you", assigned: "Assigned to you", since: "since", yourAssignment: "Your assignment", caseStatus: "Case status", proposal: "Proposal",
    directCases: "Your assigned cases are in the Consultant workspace.", directLink: "Open the Consultant workspace",
    credentialsLead: "The status of your required credentials. Independent review is done by RehletShifaa's credential review team.",
    scheduleLead: "Your weekly schedule, as your practice has set it.", pricesLead: "The prices that apply to your services, as your practice has set them.",
    cliniciansLead: "Clinicians you manage. Open their prices or schedule where your role allows.", noClinicians: "You don't manage any clinicians yet.", noCliniciansBody: "When a clinician is assigned to you to manage, they appear here.",
    truncated: "Only the first clinicians are shown. Use Manage organization for the full list.", prices: "Prices", schedule: "Schedule", back: "Back to my clinicians", nothingToManage: "Nothing to manage here for this clinician.",
    emptyAttention: { consultant: "Nothing needs your attention right now.", associate: "Nothing needs your attention right now.", manager: "No clinicians currently require your attention.", assistant: "No supported practice tasks are available right now.", owner: "Nothing needs your attention here. Organization setup is in Manage organization." },
    rel: { "MANAGES:OUTGOING": "You manage", "MANAGES:INCOMING": "Managed by", "ASSISTS:OUTGOING": "You assist", "ASSISTS:INCOMING": "Assisted by", "SUPERVISES:OUTGOING": "You supervise", "SUPERVISES:INCOMING": "Supervised by" } as Record<string, string>,
    pending: "starts when both memberships are active", unnamed: "Name not available",
    noPractice: "My Practice is for people who work with a provider organization.", yourWorkspace: "Open your workspace",
    stage: { NONE: "Not started", IN_PREPARATION: "In preparation", RELEASED: "With the patient", ACCEPTED: "Accepted", DECLINED: "Declined", REVISION_REQUESTED: "Revision requested", EXPIRED: "Expired" } as Record<string, string>,
    doc: { PRELIMINARY_ESTIMATE: "Preliminary estimate", FINAL_TREATMENT_QUOTE: "Final quote" } as Record<string, string>,
  },
  ar: {
    title: "عيادتي", portal: "بوابة الرعاية الآمنة", loading: "جارٍ تحميل عيادتك…", signIn: "تسجيل الدخول الآمن", signInLead: "سجّل الدخول لفتح مساحة عمل عيادتك.",
    failed: "تعذّر تحميل عيادتك. لم يتغيّر شيء.", retry: "إعادة المحاولة", practice: "العيادة", nav: "أقسام عيادتي", workspace: "مساحة العمل",
    staffPortal: "بوابة الفريق", manage: "إدارة الجهة", manageHint: "إعداد الجهة والأشخاص والعلاقات — في مركز التحكم.",
    sections: { home: "الرئيسية", cases: "حالاتي", credentials: "اعتماداتي", schedule: "جدولي", prices: "أسعاري", clinicians: "أطبائي" } as Record<SectionKey, string>,
    whoAmI: "أنت في هذه العيادة", roles: "دورك", organization: "الجهة", setup: "إعدادك", relationships: "العلاقات المهنية", noRelationships: "لا توجد علاقات مهنية مسجّلة لك هنا.",
    attention: "يحتاج إلى انتباهك", open: "فتح",
    noCases: "لا توجد حالات مسندة إليك بعد.", noCasesBody: "ستظهر الحالات هنا عندما تصبح مؤهلًا للإسناد وتُسند إليك حالة.",
    casesLead: "الحالات المسندة إليك. يظهر هنا رقم الحالة واسم المريض وموقف الحالة فقط.", more: "عرض مزيد من الحالات", loadingCases: "جارٍ تحميل حالاتك…", casesFailed: "تعذّر تحميل حالاتك.",
    offered: "معروضة عليك", assigned: "مسندة إليك", since: "منذ", yourAssignment: "إسنادك", caseStatus: "حالة الملف", proposal: "العرض",
    directCases: "حالاتك المسندة موجودة في مساحة عمل الاستشاري.", directLink: "فتح مساحة عمل الاستشاري",
    credentialsLead: "حالة اعتماداتك المطلوبة. يتولى فريق مراجعة الاعتمادات في رحلة شفاء المراجعة المستقلة.",
    scheduleLead: "جدولك الأسبوعي كما حددته عيادتك.", pricesLead: "الأسعار المطبقة على خدماتك كما حددتها عيادتك.",
    cliniciansLead: "الأطباء الذين تديرهم. افتح أسعارهم أو جدولهم حيث يسمح دورك.", noClinicians: "لا تدير أي طبيب بعد.", noCliniciansBody: "عندما يُسند إليك طبيب لإدارته، يظهر هنا.",
    truncated: "تظهر أوائل الأطباء فقط. استخدم «إدارة الجهة» للقائمة الكاملة.", prices: "الأسعار", schedule: "الجدول", back: "العودة إلى أطبائي", nothingToManage: "لا شيء لإدارته هنا لهذا الطبيب.",
    emptyAttention: { consultant: "لا شيء يحتاج إلى انتباهك الآن.", associate: "لا شيء يحتاج إلى انتباهك الآن.", manager: "لا يوجد أطباء يحتاجون إلى انتباهك حاليًا.", assistant: "لا توجد مهام عيادة مدعومة متاحة الآن.", owner: "لا شيء يحتاج إلى انتباهك هنا. إعداد الجهة في «إدارة الجهة»." },
    rel: { "MANAGES:OUTGOING": "تدير", "MANAGES:INCOMING": "يديرك", "ASSISTS:OUTGOING": "تساعد", "ASSISTS:INCOMING": "يساعدك", "SUPERVISES:OUTGOING": "تشرف على", "SUPERVISES:INCOMING": "يشرف عليك" } as Record<string, string>,
    pending: "تبدأ عند تفعيل العضويتين", unnamed: "الاسم غير متاح",
    noPractice: "«عيادتي» مخصّصة لمن يعملون مع جهة طبية.", yourWorkspace: "فتح مساحة عملك",
    stage: { NONE: "لم يبدأ", IN_PREPARATION: "قيد الإعداد", RELEASED: "لدى المريض", ACCEPTED: "مقبول", DECLINED: "مرفوض", REVISION_REQUESTED: "طُلب تعديل", EXPIRED: "منتهٍ" } as Record<string, string>,
    doc: { PRELIMINARY_ESTIMATE: "تقدير مبدئي", FINAL_TREATMENT_QUOTE: "عرض سعر نهائي" } as Record<string, string>,
  },
};

const TONE: Record<Tone, string> = { success: "text-brand-800", warning: "text-amber-800", danger: "text-alert-800", neutral: "text-ink-600", info: "text-sky-800" };
/** Status as icon + text, never colour alone. */
function Status({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" || tone === "warning" ? AlertTriangle : tone === "info" ? Clock : Circle;
  return <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${TONE[tone]}`}><Icon size={15} aria-hidden />{children}</span>;
}

const initialParams = () => typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);

export function ProviderWorkspace({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const { user, roles, loading, signIn, signOut } = useAuth();
  const practice = useProviderPractice(!!user);
  const [orgId, setOrgId] = useState<string | null>(() => initialParams().get("org"));
  const [view, setView] = useState<SectionKey>(() => (initialParams().get("view") as SectionKey) || "home");
  const [clinicianId, setClinicianId] = useState<string | null>(() => initialParams().get("clinician"));
  const [panel, setPanel] = useState<"prices" | "schedule" | null>(() => (initialParams().get("panel") as "prices" | "schedule") || null);
  const [preferences, setPreferences] = useState<Preferences>({ displayName: null, locale: null });
  const [cases, setCases] = useState<CasePage | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesFailed, setCasesFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!user) throw new Error("AUTHENTICATION_REQUIRED");
    const response = await apiFetchAs(user.access_token, path, init);
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || t.failed); }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }, [user, t.failed]);
  const adminApi = useAdminApi();
  useEffect(() => { if (user) void api<Preferences>("/account/preferences").then(setPreferences).catch(() => {}); }, [user, api]);

  const practices = practice.view?.practices ?? [];
  const current: Practice | undefined = practices.find((p) => p.organizationId === orgId) ?? practices[0];
  const available = useMemo(() => current ? sections(current) : [], [current]);
  const shown: SectionKey = available.includes(view) ? view : "home";
  const clinicianEnrolled = practices.some((p) => !!p.clinician);
  const directDoctor = roles.includes("DOCTOR");
  const staffWorkspace = portalRoles(roles).some((r) => r !== "patient" && !CONTROL_CENTER_ROLES.includes(r));
  const patientRole = portalRoles(roles).includes("patient");

  // V-3 is personal (the caller's own assignments), loaded once for a clinician; never for a manager, assistant or owner.
  const loadCases = useCallback(async (page: number) => {
    setCasesLoading(true); setCasesFailed(false);
    try {
      const next = await api<CasePage>(`/provider-workspace/cases?page=${page}`);
      setCases((prev) => page === 0 || !prev ? next : { ...next, items: [...prev.items, ...next.items] });
    } catch { setCasesFailed(true); } finally { setCasesLoading(false); }
  }, [api]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the codebase's load-on-mount idiom (see consultant-setup.tsx)
  useEffect(() => { if (user && clinicianEnrolled && !directDoctor) void loadCases(0); }, [user, clinicianEnrolled, directDoctor, loadCases]);

  const sync = (next: { org?: string | null; view?: SectionKey; clinician?: string | null; panel?: string | null }) => {
    const url = new URL(window.location.href);
    const set = (k: string, v: string | null | undefined) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); };
    set("org", next.org === undefined ? orgId : next.org); set("view", next.view ?? shown); set("clinician", next.clinician === undefined ? clinicianId : next.clinician); set("panel", next.panel === undefined ? panel : next.panel);
    if (url.searchParams.get("view") === "home") url.searchParams.delete("view");
    window.history.replaceState({}, "", url);
  };
  const go = (next: SectionKey) => { setView(next); setClinicianId(null); setPanel(null); moved.current = true; sync({ view: next, clinician: null, panel: null }); };
  const openClinician = (id: string | null, which: "prices" | "schedule" | null) => { setClinicianId(id); setPanel(which); moved.current = true; sync({ view: "clinicians", clinician: id, panel: which }); };
  const changePractice = (id: string) => { setOrgId(id); setView("home"); setClinicianId(null); setPanel(null); sync({ org: id, view: "home", clinician: null, panel: null }); requestAnimationFrame(() => heading.current?.focus()); };
  useEffect(() => { if (moved.current) { moved.current = false; sectionHeading.current?.focus(); } }, [shown, clinicianId, panel]);

  const frame = (children: React.ReactNode, title = t.title) => (
    <section className="portal-shell bg-[linear-gradient(180deg,var(--color-mist)_0%,#fff_32rem)]">
      <div className="container-site">
        {staffWorkspace && current && <WorkspaceSwitch locale={locale} />}
        <h1 ref={heading} tabIndex={-1} className="headline outline-none">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );

  if (loading || (user && practice.loading)) return frame(<p role="status" className="text-sm text-ink-500">{t.loading}</p>);
  if (!user) return frame(<div className="card max-w-xl p-6"><p className="text-sm text-ink-600">{t.signInLead}</p><button type="button" className="btn-primary mt-4" onClick={() => void signIn(false, window.location.pathname)}>{t.signIn}</button></div>);
  if (practice.failed) return frame(<p role="alert" className="rounded-xl bg-alert-50 p-4 text-sm text-alert-800">{t.failed} <button type="button" className="font-semibold underline" onClick={practice.retry}>{t.retry}</button></p>);

  const profile = user.profile as { name?: string; preferred_username?: string; email?: string };
  const account = <PortalAccount locale={locale} name={preferences.displayName || current?.clinician?.displayName || profile.name || profile.preferred_username || profile.email || ""} email={profile.email} role={current ? personas(current).map((p) => personaLabel(p, locale)).join(" · ") : ""} api={api} signOut={signOut} preferences={preferences} onSaved={setPreferences} />;

  if (!current) {
    // No provider relationship: a staff member or patient who opened this address is sent to their own workspace; an account
    // with nothing at all keeps the existing truthful landing.
    if (staffWorkspace || patientRole) return frame(<>{account}<div className="card max-w-xl p-6"><p className="text-sm text-ink-600">{t.noPractice}</p><Link className="btn-primary mt-4 inline-flex" href={`/${locale}/portal`}>{t.yourWorkspace}</Link></div></>, t.portal);
    return frame(<>{account}<NoPortalWorkspace locale={locale} /></>, t.portal);
  }

  const persona = personas(current);
  const manage = canManageOrganization(current);
  const own = current.clinician;

  return frame(<>
    {account}
    <p className="-mt-3 mb-5 text-sm text-ink-600">{persona.map((p) => personaLabel(p, locale)).join(" · ")} · <bdi>{current.organizationName}</bdi></p>
    {practices.length > 1 && (
      <div className="mb-5 max-w-sm">
        <label htmlFor="pw-practice" className="block text-sm font-semibold text-ink-800">{t.practice}</label>
        <select id="pw-practice" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-white px-3" value={current.organizationId} onChange={(e) => changePractice(e.target.value)}>
          {practices.map((p) => <option key={p.organizationId} value={p.organizationId}>{p.organizationName}</option>)}
        </select>
      </div>
    )}
    {available.length > 1 && (
      <nav aria-label={t.nav} className="mb-6 -mx-1 flex flex-wrap gap-2">
        {available.map((key) => (
          <a key={key} href={practiceHref(locale, { org: practices.length > 1 ? current.organizationId : undefined, view: key === "home" ? undefined : key })} aria-current={shown === key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${shown === key ? "bg-brand-700 text-white" : "border border-line bg-white text-brand-800 hover:bg-mist"}`}
            onClick={(e) => { e.preventDefault(); go(key); }}>{t.sections[key]}</a>
        ))}
      </nav>
    )}

    {shown === "home" && <Home locale={locale} practice={current} cases={cases} manage={manage} directDoctor={directDoctor} onOpen={(s) => go(s)} />}

    {shown === "cases" && (
      <SectionFrame title={t.sections.cases} lead={directDoctor ? undefined : t.casesLead} headingRef={sectionHeading}>
        {directDoctor
          ? <div className="card p-5"><p className="text-sm text-ink-700">{t.directCases}</p><Link className="btn-primary mt-4 inline-flex" href={`/${locale}/portal?role=doctor`}>{t.directLink}</Link></div>
          : <CaseList locale={locale} page={cases} loading={casesLoading} failed={casesFailed} onMore={() => void loadCases((cases?.page ?? 0) + 1)} onRetry={() => void loadCases(0)} />}
      </SectionFrame>
    )}

    {shown === "credentials" && own && (
      <SectionFrame title={t.sections.credentials} lead={t.credentialsLead} headingRef={sectionHeading}>
        <div className="cc cc-embedded"><CredentialRequirements locale={locale} api={adminApi} organizationId={current.organizationId} practitionerId={own.practitionerId} canSubmit={false} canReview={false} onChanged={() => {}} audience="self" /></div>
      </SectionFrame>
    )}

    {shown === "schedule" && own && (
      <SectionFrame title={t.sections.schedule} lead={t.scheduleLead} headingRef={sectionHeading}>
        <div className="cc cc-embedded"><AvailabilityManagement locale={locale} organizationId={current.organizationId} practitionerId={own.practitionerId} decisions={own.capabilities.filter((c) => c.permission === "availability.view")} /></div>
      </SectionFrame>
    )}

    {shown === "prices" && own && (
      <SectionFrame title={t.sections.prices} lead={t.pricesLead} headingRef={sectionHeading}>
        <div className="cc cc-embedded"><PricingManagement locale={locale} organizationId={current.organizationId} practitionerId={own.practitionerId} organizationName={current.organizationName} showOrder={false} appliedOnly decisions={own.capabilities.filter((c) => c.permission === "price_list.view")} /></div>
      </SectionFrame>
    )}

    {shown === "clinicians" && (
      <Clinicians locale={locale} practice={current} selected={clinicianId} panel={panel} onOpen={openClinician} headingRef={sectionHeading} />
    )}
  </>);
}

function personaLabel(p: string, locale: Locale) {
  const key = { consultant: "CONSULTANT", associate: "ASSOCIATE_DOCTOR", manager: "PRACTICE_MANAGER", assistant: "CONSULTANT_ASSISTANT", owner: "ORGANIZATION_OWNER" }[p] ?? p;
  return personRoleLabel(key, locale);
}

/**
 * One persistent, understandable switch for RehletShifaa staff who also work with a provider. Each workspace keeps its
 * own navigation. My Care is not offered here: every identity-system account carries the default PATIENT role, so the
 * role says nothing about being a patient; a real patient reaches My Care from their patient links (`?workspace=care`).
 */
function WorkspaceSwitch({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return (
    <nav aria-label={t.workspace} className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-ink-600">{t.workspace}:</span>
      <Link className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 font-semibold text-brand-800 hover:bg-mist" href={`/${locale}/portal`}>{t.staffPortal}</Link>
      <span aria-current="page" className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-3 font-semibold text-white">{t.title}</span>
    </nav>
  );
}

function SectionFrame({ title, lead, headingRef, children }: { title: string; lead?: string; headingRef: React.RefObject<HTMLHeadingElement | null>; children: React.ReactNode }) {
  return (
    <section aria-labelledby="pw-section-title">
      <h2 id="pw-section-title" ref={headingRef} tabIndex={-1} className="title outline-none">{title}</h2>
      {lead && <p className="mt-1 mb-4 max-w-3xl text-sm leading-6 text-ink-600">{lead}</p>}
      {!lead && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Home({ locale, practice, cases, manage, directDoctor, onOpen }: { locale: Locale; practice: Practice; cases: CasePage | null; manage: boolean; directDoctor: boolean; onOpen: (s: SectionKey) => void }) {
  const t = copy[locale];
  const items = attention(practice, directDoctor ? null : cases, locale);
  const persona = personas(practice);
  const own = practice.clinician;
  const org = organizationStatusLabel(practice.organizationStatus, locale);
  const setup = own ? providerSetupStatus({ onboardingStatus: own.setupStatus, membershipStatus: "ACTIVE" }, locale) : null;
  const empty = t.emptyAttention[persona.includes("manager") ? "manager" : persona.includes("consultant") ? "consultant" : persona.includes("associate") ? "associate" : persona.includes("owner") ? "owner" : "assistant"];
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="pw-attention" className="card p-5 sm:p-6">
        <h2 id="pw-attention" className="title">{t.attention}</h2>
        {items.length ? (
          <ul className="mt-4 grid gap-3">
            {items.map((item) => (
              <li key={item.key} className="rounded-xl border border-line p-4">
                <p className="font-semibold text-ink-900">{item.title}</p>
                <p className="mt-1 text-sm text-ink-600">{item.detail}</p>
                <button type="button" className="btn-secondary mt-3 !min-h-11" onClick={() => onOpen(item.section)}>{t.open}: {t.sections[item.section]}</button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-ink-600">{empty}</p>}
        {directDoctor && own && <p className="mt-4 text-sm text-ink-700">{t.directCases} <Link className="font-semibold text-brand-700 underline underline-offset-4" href={`/${locale}/portal?role=doctor`}>{t.directLink}</Link></p>}
        {manage && (
          <div className="mt-5 border-t border-line pt-4">
            <Link className="btn-primary inline-flex" href={ccHref(locale, `/providers/${practice.organizationId}`)}>{t.manage}</Link>
            <p className="mt-2 text-sm text-ink-600">{t.manageHint}</p>
          </div>
        )}
      </section>
      <section aria-labelledby="pw-who" className="card p-5 sm:p-6">
        <h2 id="pw-who" className="title">{t.whoAmI}</h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <div><dt className="text-ink-500">{t.organization}</dt><dd className="font-semibold text-ink-900"><bdi>{practice.organizationName}</bdi> <span className="font-normal text-ink-600">· {org.label}</span></dd></div>
          <div><dt className="text-ink-500">{t.roles}</dt><dd className="font-semibold text-ink-900">{persona.map((p) => personaLabel(p, locale)).join(" · ")}</dd></div>
          {setup && <div><dt className="text-ink-500">{t.setup}</dt><dd><Status tone={setup.tone}>{setup.label}</Status>{setup.detail && <span className="block text-ink-600">{setup.detail}</span>}</dd></div>}
        </dl>
        <h3 className="mt-5 text-base font-bold text-brand-900">{t.relationships}</h3>
        {practice.relationships.length ? (
          <ul className="mt-2 grid gap-2 text-sm">
            {practice.relationships.map((r, i) => (
              <li key={i}><span className="text-ink-600">{t.rel[`${r.type}:${r.direction}`] ?? r.type}</span> <bdi className="font-semibold text-ink-900">{r.counterpartName || t.unnamed}</bdi>{r.status === "PENDING" && <span className="block text-ink-500">{t.pending}</span>}</li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-600">{t.noRelationships}</p>}
      </section>
    </div>
  );
}

function CaseList({ locale, page, loading, failed, onMore, onRetry }: { locale: Locale; page: CasePage | null; loading: boolean; failed: boolean; onMore: () => void; onRetry: () => void }) {
  const t = copy[locale];
  if (failed && !page) return <p role="alert" className="rounded-xl bg-alert-50 p-4 text-sm text-alert-800">{t.casesFailed} <button type="button" className="font-semibold underline" onClick={onRetry}>{t.retry}</button></p>;
  if (!page) return <p role="status" className="text-sm text-ink-500">{t.loadingCases}</p>;
  if (!page.items.length) return <div className="card p-6"><p className="font-semibold text-ink-900">{t.noCases}</p><p className="mt-1 text-sm text-ink-600">{t.noCasesBody}</p></div>;
  return (
    <>
      <ul className="grid gap-3" aria-label={t.sections.cases}>{page.items.map((c) => <CaseRow key={c.caseNumber} locale={locale} value={c} />)}</ul>
      {failed && <p role="alert" className="mt-3 text-sm text-alert-800">{t.casesFailed} <button type="button" className="font-semibold underline" onClick={onMore}>{t.retry}</button></p>}
      {page.hasMore && <button type="button" className="btn-secondary mt-4" disabled={loading} onClick={onMore}>{loading ? t.loadingCases : t.more}</button>}
    </>
  );
}

function CaseRow({ locale, value }: { locale: Locale; value: CaseSummary }) {
  const t = copy[locale];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value.assignedAt));
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-bold text-ink-900"><bdi>{value.patientDisplayName}</bdi></p>
        <p className="text-sm text-ink-600"><bdi dir="ltr">{value.caseNumber}</bdi></p>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-500">{t.caseStatus}</dt><dd className="font-semibold text-ink-900">{stageLabel(value.caseStatus, locale)}</dd></div>
        <div><dt className="text-ink-500">{t.proposal}</dt><dd className="font-semibold text-ink-900">{t.stage[value.proposalStage] ?? value.proposalStage}{value.proposalDocumentType && <span className="font-normal text-ink-600"> · {t.doc[value.proposalDocumentType] ?? value.proposalDocumentType}</span>}</dd></div>
        <div><dt className="sr-only">{t.yourAssignment}</dt><dd><Status tone={value.assignmentStatus === "PENDING" ? "info" : "success"}>{value.assignmentStatus === "PENDING" ? t.offered : t.assigned}</Status> <span className="text-ink-600">{t.since} {date}</span></dd></div>
      </dl>
    </li>
  );
}

function Clinicians({ locale, practice, selected, panel, onOpen, headingRef }: { locale: Locale; practice: Practice; selected: string | null; panel: "prices" | "schedule" | null; onOpen: (id: string | null, panel: "prices" | "schedule" | null) => void; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const t = copy[locale];
  const clinician = practice.managedClinicians.find((c) => c.practitionerId === selected);
  if (clinician && panel) {
    const keys = panel === "prices" ? ["price_list.view", "price_list.manage", "price_list.publish"] : ["availability.view", "availability.manage"];
    const decisions = clinician.capabilities.filter((c) => keys.includes(c.permission));
    const can = allowed(clinician.capabilities, panel === "prices" ? "price_list.view" : "availability.view");
    return (
      <SectionFrame title={`${panel === "prices" ? t.prices : t.schedule} — ${clinician.displayName}`} headingRef={headingRef}>
        <button type="button" className="btn-secondary mb-4 !min-h-11" onClick={() => onOpen(null, null)}>{t.back}</button>
        {can
          ? <div className="cc cc-embedded">{panel === "prices"
              ? <PricingManagement locale={locale} organizationId={practice.organizationId} practitionerId={clinician.practitionerId} organizationName={practice.organizationName} decisions={decisions} clinicianScopeOnly />
              : <AvailabilityManagement locale={locale} organizationId={practice.organizationId} practitionerId={clinician.practitionerId} decisions={decisions} />}</div>
          : <p className="text-sm text-ink-600">{t.nothingToManage}</p>}
      </SectionFrame>
    );
  }
  return (
    <SectionFrame title={t.sections.clinicians} lead={practice.managedClinicians.length ? t.cliniciansLead : undefined} headingRef={headingRef}>
      {practice.managedClinicians.length ? (
        <ul className="grid gap-3 md:grid-cols-2">{practice.managedClinicians.map((c) => <ClinicianCard key={c.practitionerId} locale={locale} value={c} onOpen={onOpen} />)}</ul>
      ) : <div className="card p-6"><p className="font-semibold text-ink-900">{t.noClinicians}</p><p className="mt-1 text-sm text-ink-600">{t.noCliniciansBody}</p></div>}
      {practice.managedCliniciansTruncated && <p className="mt-3 text-sm text-ink-600">{t.truncated}</p>}
    </SectionFrame>
  );
}

function ClinicianCard({ locale, value, onOpen }: { locale: Locale; value: ManagedClinician; onOpen: (id: string, panel: "prices" | "schedule") => void }) {
  const t = copy[locale];
  const setup = providerSetupStatus({ onboardingStatus: value.setupStatus, membershipStatus: value.membershipStatus ?? "ACTIVE" }, locale);
  const prices = allowed(value.capabilities, "price_list.view");
  const schedule = allowed(value.capabilities, "availability.view");
  return (
    <li className="card p-4 sm:p-5">
      <p className="font-bold text-ink-900"><bdi>{value.displayName}</bdi></p>
      <p className="text-sm text-ink-600">{personRoleLabel(value.clinicianType, locale)}</p>
      <p className="mt-2"><Status tone={setup.tone}>{setup.label}</Status>{setup.detail && <span className="block text-sm text-ink-600">{setup.detail}</span>}</p>
      {(prices || schedule) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {prices && <button type="button" className="btn-secondary !min-h-11" onClick={() => onOpen(value.practitionerId, "prices")}>{t.prices}<span className="sr-only"> — {value.displayName}</span></button>}
          {schedule && <button type="button" className="btn-secondary !min-h-11" onClick={() => onOpen(value.practitionerId, "schedule")}>{t.schedule}<span className="sr-only"> — {value.displayName}</span></button>}
        </div>
      )}
    </li>
  );
}
