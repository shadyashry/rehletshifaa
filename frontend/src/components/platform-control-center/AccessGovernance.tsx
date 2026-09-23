"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Minus, Plus, Search } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { accessCopy, businessLabel, familyLabel, permissionLabel, roleLabel } from "./access-copy";
import "./access-governance.css";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref, type NavKey } from "./control-center-nav";
import { ActionMenu, EmptyState, ErrorNotice, Facts, Field, StatusBadge, SuccessNotice, TechnicalDetails, WizardProgress } from "./cc-ui";
import { personName, useProviderDirectory } from "./provider-directory";

type Permission = { key: string; name: string; description: string; family: string; risk: string; scopes: string[]; actors: string[]; channels: string[]; dependencies: string[]; conflicts: string[]; executable: boolean; workflowGated: boolean; recentAuthentication: boolean };
type Role = { id: string; key: string; name: string; description: string; purpose: string; family: string; systemTemplate: boolean };
type Grant = { permission: string; scope: string; relationship: string | null };
type Version = { id: string; number: number; status: string; revision: number; actorType: string; channel: string; effectiveFrom: string | null; createdBy: string; publishedBy: string | null };
type VersionDetail = { version: Version; grants: Grant[] };
type Detail = { role: Role; versions: VersionDetail[] };
type Decision = { allowed: boolean; reason: string; permission: string; roleVersionId: string | null; scope: string | null; relationship: string | null };
type Assignment = { id: string; subject: string; organizationId: string; status: string; scope: string; source: string; revision: number; effectiveFrom: string; effectiveTo: string | null };
type Effective = { subject: string; organizationId: string; membership?: { status: string; accountActive: boolean } | null; sources: { assignment: Assignment; roleName: string; version: Version; grants: Grant[] }[]; decisions: Decision[]; relationships: { id: string; type: string; targetId: string; status: string }[] };
type Audit = { actor: string; entity: string; action: string; outcome: string; reason: string; occurredAt: string };
export type AccessView = "users" | "roles" | "effective" | "permissions" | "audit";
type PersonRef = { subject: string; organizationId: string; name?: string; context?: string };

const PLATFORM = "00000000-0000-0000-0000-000000000001";
const actors = ["GOVERNANCE", "PRACTICE_OPERATIONS", "CONSULTANT", "ASSOCIATE_DOCTOR", "CLINICAL_SUPPORT", "COORDINATOR", "OPERATIONS", "FINANCE", "SERVICE"];
const channels = ["ADMIN_WEB", "STAFF_WEB", "CONSULTANT_WEB", "CONSULTANT_MOBILE", "PRACTICE_MOBILE", "API"];
const relationships = ["MANAGES", "ASSISTS", "SUPERVISES", "COORDINATES", "ASSIGNED_TO", "VERIFIES"];
const identity = (g: Grant) => JSON.stringify(g);
const navFor: Record<AccessView, NavKey> = { users: "accessUsers", roles: "accessRoles", effective: "accessEffective", permissions: "accessPermissions", audit: "accessAudit" };

/**
 * Access & governance inside the Control Center. The same accepted backend (`/admin/access/**`) and the same
 * role lifecycle — organised around people's questions: who needs access, what can this person do, why, and how
 * is a role defined. Authorization is never reconstructed here; every explanation is the backend's own decision.
 */
export function AccessGovernance({ locale, view: requested, initialTab, initialSubject, initialOrganization }: { locale: Locale; view?: AccessView; initialTab?: AccessView; initialSubject?: string; initialOrganization?: string }) {
  const view: AccessView = requested ?? initialTab ?? "roles";
  const t = accessCopy[locale]; const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const rawApi = useAdminApi();
  const api = useCallback(<T,>(path: string, method = "GET", body?: unknown) => rawApi<T>("/admin/access" + path, { method, body }), [rawApi]);
  const can = access.can;
  const [roles, setRoles] = useState<Role[]>([]); const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loaded, setLoaded] = useState(false); const [page, setPage] = useState(0);
  const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(null); setNotice(""); try { await work(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const canView = can("access.role.view");
  const reload = useCallback(async () => {
    setError(null);
    try { const [r, p] = await Promise.all([api<Role[]>("/roles?offset=" + page * 100), api<Permission[]>("/permissions")]); setRoles(r); setPermissions(p); }
    catch (e) { setError(e); } finally { setLoaded(true); }
  }, [api, page]);
  // Reads happen once per signed-in subject; a silent token renewal must not discard an open form (Phase 5B).
  useEffect(() => { if (user && canView) void reload(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile?.sub, canView, page]);
  const label = useCallback((key: string) => { const p = permissions.find((x) => x.key === key); return p ? permissionLabel(p, locale) : t.technical; }, [permissions, locale, t.technical]);

  const titles: Record<AccessView, [string, string, string, string]> = {
    users: ["User access", "وصول المستخدمين", "Find a person, see what they can do, and give or remove access.", "ابحث عن شخص، واعرف ما يستطيع فعله، وامنح الوصول أو أزله."],
    roles: ["Roles", "الأدوار", "Job roles define what people can do. Changes are drafted, checked and published by an independent reviewer.", "تحدد الأدوار الوظيفية ما يستطيع الأشخاص فعله. تُعد التغييرات كمسودة وتُفحص ثم ينشرها مراجع مستقل."],
    effective: ["Effective access", "الوصول الفعلي", "Why a person can — or cannot — do something, explained by the platform itself.", "لماذا يستطيع الشخص — أو لا يستطيع — القيام بإجراء، كما تشرحه المنصة نفسها."],
    permissions: ["Permissions", "الصلاحيات", "Everything a role can grant, grouped by area.", "كل ما يمكن أن يمنحه الدور، مجمّعًا حسب المجال."],
    audit: ["Audit", "سجل التدقيق", "Every access change and decision, newest first.", "كل تغيير وقرار في الوصول، الأحدث أولًا."],
  };
  const [en, arTitle, enIntro, arIntro] = titles[view];
  const title = ar ? arTitle : en;
  const crumbs = ccCrumbs(locale, { label: t.title, href: ccHref(locale, "/access/users") }, { label: title });
  const shell = (body: React.ReactNode, actions?: React.ReactNode) => <ControlCenterShell locale={locale} active={navFor[view]} crumbs={crumbs} title={title} intro={ar ? arIntro : enIntro} actions={actions}><div className="ag ag-embedded" dir={ar ? "rtl" : "ltr"}>{body}</div></ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{t.loading}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{t.signin}</button>);
  if (!canView) return shell(<EmptyState title={t.denied} />);
  if (!loaded && !error) return shell(<p role="status">{t.loading}</p>);
  const recentAuth = access.decisions.some((d) => d.permission.startsWith("access.") && access.needsFreshSignIn(d.permission));
  const common = <>
    <ErrorNotice error={error} locale={locale} action={loaded && roles.length ? "save" : "load"} onRetry={() => void reload()} />
    <SuccessNotice>{notice || null}</SuccessNotice>
    {recentAuth && <p className="cc-notice cc-notice-info">{t.recent} <button type="button" className="cc-secondary cc-small" onClick={() => void signIn(true)}>{t.signin}</button></p>}
  </>;
  const props = { locale, api, can, roles, permissions, label, run, busy, setNotice };
  if (view === "roles") return <RolesView {...props} shell={shell} common={common} page={page} setPage={setPage} userSubject={user.profile.sub} />;
  if (view === "permissions") return shell(<>{common}<PermissionsView locale={locale} permissions={permissions} label={label} /></>);
  if (view === "audit") return shell(<>{common}{can("access.audit.view") ? <AuditView locale={locale} api={api} /> : <EmptyState title={t.denied} />}</>);
  if (!can("access.effective_access.view")) return shell(<>{common}<EmptyState title={t.denied} /></>);
  return shell(<>{common}<PeopleAccess {...props} mode={view === "users" ? "users" : "effective"} initial={initialSubject ? { subject: initialSubject, organizationId: initialOrganization ?? PLATFORM } : undefined} /></>);
}

type ViewProps = { locale: Locale; api: <T>(path: string, method?: string, body?: unknown) => Promise<T>; can: (k: string) => boolean; roles: Role[]; permissions: Permission[]; label: (k: string) => string; run: (w: () => Promise<void>) => Promise<void>; busy: boolean; setNotice: (s: string) => void };

/* ───────────────────────── People: User access + Effective access ───────────────────────── */

/** Pick a real person — provider members and care staff by name — with an advanced fallback for an account identifier. */
function PersonPicker({ locale, onSelect }: { locale: Locale; onSelect: (p: PersonRef) => void }) {
  const ar = locale === "ar"; const t = accessCopy[locale];
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const directory = useProviderDirectory(access.can("provider.view"));
  const [staff, setStaff] = useState<{ subject: string; name: string; role: string }[]>([]);
  useEffect(() => { if (access.legacy.admin) void api<{ subject: string; name: string; role: string }[]>("/admin/staff-teams").then(setStaff).catch(() => setStaff([])); }, [access.legacy.admin, api]);
  const [query, setQuery] = useState(""); const [subject, setSubject] = useState(""); const [organization, setOrganization] = useState(PLATFORM);
  const people: PersonRef[] = useMemo(() => [
    ...directory.people.map((p) => ({ subject: p.subject, organizationId: p.organization.id, name: personName(p, locale), context: p.organization.displayName })),
    ...staff.map((s) => ({ subject: s.subject, organizationId: PLATFORM, name: s.name, context: ar ? "فريق رحلة الشفاء" : "RehletShifaa team" })),
  ], [directory.people, staff, locale, ar]);
  const matches = query.trim().length < 1 ? [] : people.filter((p) => `${p.name} ${p.context}`.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  return (
    <div className="cc-card" style={{ marginBottom: 20 }}>
      <Field label={ar ? "ابحث عن شخص" : "Find a person"} hint={ar ? "اكتب اسمًا أو اسم مؤسسة." : "Type a name or an organization."}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-controls="person-results" />
      </Field>
      {directory.loading && <p role="status" className="cc-meta">{ar ? "جارٍ تحميل الأشخاص…" : "Loading people…"}</p>}
      {query && <ul id="person-results" className="cc-list" aria-label={ar ? "النتائج" : "Results"}>
        {!matches.length ? <li><span className="cc-meta">{ar ? "لا يوجد أشخاص مطابقون. جرّب اسمًا آخر أو استخدم معرّف الحساب أدناه." : "Nobody matches. Try another name, or use an account identifier below."}</span></li>
          : matches.map((p) => <li key={p.organizationId + p.subject}><span><strong>{p.name}</strong><span className="cc-row-sub">{p.context}</span></span><span /><span /><span className="cc-row-actions"><button type="button" className="cc-secondary cc-small" onClick={() => onSelect(p)}>{ar ? "اختيار" : "Select"}</button></span></li>)}
      </ul>}
      <details className="cc-technical">
        <summary>{ar ? "استخدام معرّف حساب بدلًا من ذلك" : "Use an account identifier instead"}</summary>
        <form className="ag-effective-form" onSubmit={(e) => { e.preventDefault(); if (subject.trim()) onSelect({ subject: subject.trim(), organizationId: organization.trim() || PLATFORM }); }}>
          <label>{t.subject}<input required maxLength={255} dir="ltr" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>{t.organization}<input required dir="ltr" value={organization} onChange={(e) => setOrganization(e.target.value)} /></label>
          <button className="cc-secondary">{t.inspect}</button>
        </form>
      </details>
    </div>
  );
}

function PeopleAccess({ locale, api, can, roles, label, mode, initial }: ViewProps & { mode: "users" | "effective"; initial?: PersonRef }) {
  const ar = locale === "ar"; const t = accessCopy[locale];
  const [person, setPerson] = useState<PersonRef | null>(initial ?? null);
  // A deep link carries only the account identifier; show the person by name whenever the directory knows them.
  const directory = useProviderDirectory(can("provider.view"));
  const known = person && !person.name ? directory.people.find((p) => p.subject === person.subject && p.organization.id === person.organizationId) : undefined;
  const shown = known ? { name: personName(known, locale), context: known.organization.displayName } : { name: person?.name, context: person?.context };
  const [effective, setEffective] = useState<Effective | null>(null); const [error, setError] = useState<unknown>(null); const [loading, setLoading] = useState(false);
  const [granting, setGranting] = useState(false); const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState(""); const [show, setShow] = useState<"all" | "allowed" | "denied">("all");
  const load = useCallback(async (p: PersonRef) => {
    setLoading(true); setError(null);
    try { setEffective(await api<Effective>("/effective-access?subject=" + encodeURIComponent(p.subject) + "&organization=" + encodeURIComponent(p.organizationId))); }
    catch (e) { setError(e); setEffective(null); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { if (person) void load(person); }, [person, load]);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = (iso: string) => new Date(iso).toLocaleString(ar ? "ar-AE" : "en-GB") + " (" + zone + ")";
  const roleOfVersion = (id: string | null) => effective?.sources.find((s) => s.version.id === id)?.roleName;
  const decisions = (effective?.decisions ?? []).filter((d) => (show === "all" || (show === "allowed") === d.allowed) && label(d.permission).toLowerCase().includes(filter.toLowerCase()));
  const manage = can("access.assignment.manage");
  const other = mode === "users" ? "/access/effective" : "/access/users";
  const personLink = person ? ccHref(locale, `${other}?subject=${encodeURIComponent(person.subject)}&organization=${encodeURIComponent(person.organizationId)}`) : "";
  const revoke = async (a: Assignment, reason: string) => {
    await api("/assignments/" + a.id + "/revoke?organization=" + encodeURIComponent(a.organizationId), "POST", { revision: a.revision, reason });
    setNotice(ar ? "أُزيل الوصول." : "Access removed."); if (person) await load(person);
  };
  return (
    <>
      {!person ? <PersonPicker locale={locale} onSelect={(p) => { setPerson(p); setGranting(false); setNotice(""); }} /> : (
        <div className="cc-section-head" style={{ marginBottom: 18 }}>
          <div><h2>{shown.name ?? (ar ? "الشخص المحدد" : "Selected person")}</h2>{shown.context && <p>{shown.context}</p>}{!shown.name && <TechnicalDetails locale={locale} items={[[t.subject, person.subject], [t.organization, person.organizationId]]} />}</div>
          <div className="cc-section-actions">
            {mode === "users" && manage && !granting && <button type="button" onClick={() => setGranting(true)}><Plus size={16} aria-hidden />{ar ? "منح وصول" : "Give access"}</button>}
            <Link className="cc-secondary" href={personLink}>{mode === "users" ? (ar ? "لماذا يملك هذا الوصول؟" : "Why do they have this access?") : (ar ? "تغيير وصول هذا الشخص" : "Change this person's access")}</Link>
            <button type="button" className="cc-ghost" onClick={() => { setPerson(null); setEffective(null); setGranting(false); }}><Search size={16} aria-hidden />{ar ? "شخص آخر" : "Another person"}</button>
          </div>
        </div>
      )}
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} action="load" onRetry={() => person && void load(person)} />
      {loading && <p role="status">{t.loading}</p>}
      {person && effective && !loading && <>
        {granting && <GrantAccess locale={locale} api={api} roles={roles} person={{ ...person, name: shown.name }} onCancel={() => setGranting(false)} onGranted={async (status) => { setGranting(false); setNotice((ar ? "تم حفظ الوصول: " : "Access saved: ") + businessLabel(status, locale)); await load(person); }} />}
        {can("access.effective_access.view") && <WorkspaceRolesBlock key={person.subject} locale={locale} api={api} subject={person.subject} />}
        <h3>{ar ? "الوصول إلى أعمال رحلة شفاء" : "Business access"}</h3>
        <p className="cc-meta">{ar ? "تديرها رحلة شفاء · أدوار الأعمال المسندة لهذا الشخص" : "Managed by RehletShifaa · business roles assigned to this person"}</p>
        {effective.membership && <p className="cc-meta">{businessLabel(effective.membership.status, locale)} · {effective.membership.accountActive ? (ar ? "الحساب نشط" : "Account active") : (ar ? "الحساب غير نشط" : "Account inactive")}</p>}
        {!effective.sources.length ? <EmptyState title={ar ? "لا توجد أدوار أعمال مسندة" : "No RehletShifaa business roles assigned"} body={mode === "users" && manage ? (ar ? "امنح هذا الشخص دورًا إذا كان يحتاج إلى وصول إلى أعمال رحلة شفاء. مساحات العمل أعلاه منفصلة." : "Give this person a role if they need RehletShifaa business access. Workspace roles above are separate.") : undefined} /> : (
          <ul className="ag-capabilities">{effective.sources.map((s) => {
            const a = s.assignment;
            return (
              <li key={a.id}><div>
                <strong>{s.roleName}</strong>
                <p>{businessLabel(a.scope, locale)} · <StatusBadge tone={a.status === "ACTIVE" ? "success" : a.status === "PENDING" ? "warning" : "neutral"}>{businessLabel(a.status, locale)}</StatusBadge></p>
                <p>{(ar ? "يبدأ في " : "Starts at ") + when(a.effectiveFrom)}</p>
                <p>{a.effectiveTo ? (ar ? "ينتهي في " : "Expires at ") + when(a.effectiveTo) : (ar ? "بلا تاريخ انتهاء" : "No expiry")}</p>
                <TechnicalDetails locale={locale} items={[[t.version, String(s.version.number)], [ar ? "المصدر" : "Source", businessLabel(a.source, locale)], [t.revision, String(a.revision)]]} />
              </div>
              {mode === "users" && manage && a.status !== "REVOKED" && <RevokeMenu locale={locale} name={s.roleName} onRevoke={(reason) => revoke(a, reason)} />}
              </li>
            );
          })}</ul>
        )}
        {mode === "effective" && <>
          {effective.relationships.length > 0 && <><h3>{t.relationship}</h3><ul>{effective.relationships.map((r) => <li key={r.id}>{businessLabel(r.type, locale)} · {businessLabel(r.status, locale)}</li>)}</ul></>}
          <h3>{ar ? "ما يستطيع فعله — ولماذا" : "What they can do — and why"}</h3>
          <div className="cc-filterbar">
            <label>{ar ? "ابحث عن إجراء" : "Find an action"}<input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
            <label>{ar ? "عرض" : "Show"}<select value={show} onChange={(e) => setShow(e.target.value as typeof show)}><option value="all">{ar ? "الكل" : "Everything"}</option><option value="allowed">{t.allowed}</option><option value="denied">{t.deniedAction}</option></select></label>
          </div>
          <ul className="ag-decisions">{decisions.map((d) => (
            <li key={d.permission}>
              <span className={d.allowed ? "ag-allow" : "ag-deny"}>{d.allowed ? <Check size={16} aria-hidden /> : <Minus size={16} aria-hidden />} {d.allowed ? t.allowed : t.deniedAction}</span>
              <div><strong>{label(d.permission)}</strong>
                <details><summary>{d.allowed ? (ar ? "لماذا يستطيع؟" : "Why can they?") : (ar ? "لماذا لا يستطيع؟" : "Why can't they?")}</summary>
                  <p>{businessLabel(d.reason, locale)}</p>
                  {(d.scope || d.relationship || d.roleVersionId) && <Facts items={[[ar ? "الدور" : "Role", roleOfVersion(d.roleVersionId) ?? ""], [t.scope, d.scope ? businessLabel(d.scope, locale) : ""], [t.relationship, d.relationship ? businessLabel(d.relationship, locale) : ""]]} />}
                </details></div>
            </li>))}</ul>
          {!decisions.length && <EmptyState title={t.empty} />}
        </>}
      </>}
    </>
  );
}

type WorkspaceRoles = { subject: string; source: "IDENTITY_SYSTEM"; available: boolean; accountStatus: string | null; roles: string[] };
/** Identity-system (realm) roles and the portal workspace each one opens. Read-only here: they are managed where staff accounts are managed. */
const WORKSPACES: Record<string, [string, string, string, string]> = {
  COORDINATOR: ["Coordinator", "Staff Portal", "منسق", "بوابة الموظفين"], COORDINATOR_LEAD: ["Coordination lead", "Staff Portal", "قائد التنسيق", "بوابة الموظفين"],
  OPERATIONS: ["Operations", "Staff Portal", "العمليات", "بوابة الموظفين"], OPERATIONS_LEAD: ["Operations lead", "Staff Portal", "قائد العمليات", "بوابة الموظفين"],
  FINANCE: ["Finance", "Staff Portal", "المالية", "بوابة الموظفين"], FINANCE_LEAD: ["Finance lead", "Staff Portal", "قائد المالية", "بوابة الموظفين"],
  DOCTOR: ["Consultant (direct)", "Staff Portal — clinical work", "استشاري (مباشر)", "بوابة الموظفين — العمل السريري"],
  CREDENTIALING_ADMIN: ["Credentialing administrator", "Control Center", "مسؤول الاعتمادات", "مركز التحكم"], SYSTEM_ADMIN: ["System administrator", "Control Center", "مسؤول النظام", "مركز التحكم"],
  AUDITOR: ["Auditor (read-only)", "Control Center", "مدقق (قراءة فقط)", "مركز التحكم"], PATIENT_IDENTITY_REVIEWER: ["Identity reviewer", "Identity checks", "مراجع الهوية", "التحقق من الهوية"],
  PATIENT: ["Patient", "My Care", "مريض", "رعايتي"], PATIENT_REPRESENTATIVE: ["Patient representative", "My Care", "ممثل المريض", "رعايتي"],
};
const ACCOUNT_STATUS: Record<string, [string, string]> = { ACTIVE: ["Account active", "الحساب نشط"], INVITED: ["Invitation not yet accepted", "لم تُقبل الدعوة بعد"], DISABLED: ["Account disabled — cannot sign in", "الحساب معطّل — لا يمكن تسجيل الدخول"], NOT_FOUND: ["No sign-in account found", "لا يوجد حساب دخول"] };

/**
 * ACCOUNT & WORKSPACES — what the identity system says about this person's sign-in account. Shown beside, and never
 * merged with, RehletShifaa business access. It offers no controls: nothing here changes identity-system roles.
 */
function WorkspaceRolesBlock({ locale, api, subject }: { locale: Locale; api: ViewProps["api"]; subject: string }) {
  const ar = locale === "ar";
  const [value, setValue] = useState<WorkspaceRoles | null>(null); const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    api<WorkspaceRoles>("/workspace-roles?subject=" + encodeURIComponent(subject)).then((v) => { if (live) setValue(v); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, subject]);
  return (
    <section className="ag-source" aria-labelledby="workspace-roles-title">
      <h3 id="workspace-roles-title">{ar ? "الحساب ومساحات العمل" : "Account & workspaces"}</h3>
      <p className="cc-meta">{ar ? "يديرها نظام الهوية · للقراءة فقط" : "Managed by the identity system · read-only"}</p>
      {error ? <ErrorNotice error={error} locale={locale} action="load" />
        : !value ? <p role="status" className="cc-meta">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
        : !value.available ? <p className="cc-meta">{ar ? "تعذّر سؤال نظام الهوية الآن، لذا لا تُعرض مساحات العمل. هذا لا يعني أن الشخص لا يملك أيًا منها." : "The identity system couldn't be asked right now, so workspaces aren't shown. This doesn't mean the person has none."}</p>
        : <>
          {value.accountStatus && ACCOUNT_STATUS[value.accountStatus] && <p className="cc-meta">{ACCOUNT_STATUS[value.accountStatus][ar ? 1 : 0]}</p>}
          {!value.roles.length ? <p className="cc-meta">{ar ? "لا توجد مساحة عمل في البوابة لهذا الحساب." : "This account has no portal workspace role."}</p>
            : <ul className="ag-capabilities">{value.roles.map((r) => { const w = WORKSPACES[r]; return <li key={r}><div><strong>{w ? w[ar ? 2 : 0] : r}</strong><p>{w ? w[ar ? 3 : 1] : ""}</p></div></li>; })}</ul>}
        </>}
    </section>
  );
}

function RevokeMenu({ locale, name, onRevoke }: { locale: Locale; name: string; onRevoke: (reason: string) => Promise<void> }) {
  const ar = locale === "ar";
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  if (!open) return <ActionMenu label={(ar ? "إجراءات: " : "Actions: ") + name} actions={[{ label: ar ? "إزالة هذا الوصول" : "Remove this access", destructive: true, onSelect: () => setOpen(true) }]} />;
  return (
    <form className="cc-card" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) return; setBusy(true); setError(null); void onRevoke(reason.trim()).catch(setError).finally(() => setBusy(false)); }}>
      <ErrorNotice error={error} locale={locale} />
      <p><strong>{ar ? `إزالة دور «${name}»؟` : `Remove the ${name} role?`}</strong> {ar ? "يفقد هذا الشخص كل ما يمنحه هذا الدور فورًا. يُسجَّل التغيير في سجل التدقيق." : "This person loses everything this role allows, immediately. The change is recorded in the audit log."}</p>
      <Field label={ar ? "سبب الإزالة" : "Reason for removing access"} required><input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="cc-form-actions"><button className="cc-danger-button" disabled={busy || !reason.trim()}>{ar ? "إزالة الوصول" : "Remove access"}</button><button type="button" className="cc-secondary" onClick={() => setOpen(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
    </form>
  );
}

/** Give access: role → scope → validity → review & confirm. The newest published version is used unless changed under Advanced. */
function GrantAccess({ locale, api, roles, person, onCancel, onGranted }: { locale: Locale; api: ViewProps["api"]; roles: Role[]; person: PersonRef; onCancel: () => void; onGranted: (status: string) => Promise<void> }) {
  const ar = locale === "ar";
  const [step, setStep] = useState(0);
  const [role, setRole] = useState(""); const [versions, setVersions] = useState<VersionDetail[]>([]); const [version, setVersion] = useState("");
  const [scope, setScope] = useState(""); const [targetType, setTargetType] = useState(""); const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [query, setQuery] = useState("");
  const pickRole = async (id: string) => {
    setRole(id); setVersion(""); setScope(""); setVersions([]); setError(null);
    try { const d = await api<Detail>("/roles/" + id); const published = d.versions.filter((v) => v.version.status === "PUBLISHED").sort((a, b) => b.version.number - a.version.number); setVersions(published); setVersion(published[0]?.version.id ?? ""); }
    catch (e) { setError(e); }
  };
  const current = versions.find((v) => v.version.id === version);
  const scopes = useMemo(() => [...new Set(current?.grants.map((g) => g.scope) ?? [])], [current]);
  useEffect(() => { if (scopes.length === 1 && !scope) setScope(scopes[0]); }, [scopes, scope]);
  const roleName = roles.find((r) => r.id === role);
  const steps = [{ key: "role", label: ar ? "الدور" : "Role" }, { key: "scope", label: ar ? "النطاق" : "Scope" }, { key: "when", label: ar ? "المدة" : "Validity" }, { key: "review", label: ar ? "المراجعة" : "Review" }];
  const canNext = step === 0 ? !!role && !!version : step === 1 ? !!scope && (scope !== "SPECIFIC_RESOURCE" || (!!targetType && !!targetId)) : true;
  const confirm = async () => {
    if (!reason.trim()) return; setBusy(true); setError(null);
    try {
      const result = await api<{ status: string }>("/assignments", "POST", { subject: person.subject, organizationId: person.organizationId, versionId: version, scope, targetType: scope === "SPECIFIC_RESOURCE" ? targetType : null, targetId: scope === "SPECIFIC_RESOURCE" ? targetId : null, effectiveFrom: from ? new Date(from).toISOString() : new Date().toISOString(), effectiveTo: to ? new Date(to).toISOString() : null, reason: reason.trim() });
      await onGranted(result.status);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <section className="cc-card" aria-label={ar ? "منح وصول" : "Give access"} style={{ marginBottom: 22 }}>
      <h3 style={{ marginTop: 0 }}>{ar ? `منح وصول إلى ${person.name ?? ""}` : `Give ${person.name ?? "this person"} access`}</h3>
      <WizardProgress locale={locale} current={step} steps={steps.map((s, i) => ({ ...s, done: i < step }))} />
      <ErrorNotice error={error} locale={locale} />
      {step === 0 && <>
        <Field label={ar ? "ابحث عن دور" : "Find a role"}><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <div className="cc-choices" role="radiogroup" aria-label={ar ? "الأدوار" : "Roles"}>{roles.filter((r) => `${roleLabel(r, locale)} ${r.purpose}`.toLowerCase().includes(query.toLowerCase())).map((r) => (
          <label key={r.id} className="cc-choice"><input type="radio" name="role" checked={role === r.id} onChange={() => void pickRole(r.id)} /><span><strong>{roleLabel(r, locale)}</strong><small>{r.purpose}</small></span></label>))}</div>
        {role && !versions.length && <p className="cc-issue">{ar ? "لا يوجد إصدار منشور لهذا الدور بعد." : "This role has no published version yet."}</p>}
        {versions.length > 1 && <details className="cc-technical"><summary>{ar ? "متقدم: إصدار الدور" : "Advanced: role version"}</summary><label>{ar ? "الإصدار المنشور" : "Published version"}<select value={version} onChange={(e) => { setVersion(e.target.value); setScope(""); }}>{versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.version.number}</option>)}</select></label></details>}
      </>}
      {step === 1 && <>
        <div className="cc-choices" role="radiogroup" aria-label={ar ? "النطاق" : "Scope"}>{scopes.map((s) => <label key={s} className="cc-choice"><input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} /><span><strong>{businessLabel(s, locale)}</strong></span></label>)}</div>
        {scope === "SPECIFIC_RESOURCE" && <div className="cc-form-grid"><Field label={ar ? "نوع المورد" : "Resource type"} required><input maxLength={60} dir="ltr" value={targetType} onChange={(e) => setTargetType(e.target.value)} /></Field><Field label={ar ? "معرّف المورد" : "Resource identifier"} required><input maxLength={255} dir="ltr" value={targetId} onChange={(e) => setTargetId(e.target.value)} /></Field></div>}
        <p className="cc-meta">{ar ? "التعيينات في مؤسسات غير موثّقة تبقى معلّقة ولا تمنح وصولًا إلى بيانات المرضى." : "Access in an unverified organization stays pending and grants no patient data access."}</p>
      </>}
      {step === 2 && <div className="cc-form-grid">
        <Field label={ar ? "يبدأ في" : "Starts"} hint={ar ? "اتركه فارغًا ليبدأ الآن" : "Leave blank to start now"} optionalLabel={ar ? "اختياري" : "optional"}><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={ar ? "ينتهي في" : "Ends"} hint={ar ? "اتركه فارغًا دون انتهاء" : "Leave blank for no end date"} optionalLabel={ar ? "اختياري" : "optional"}><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>}
      {step === 3 && <>
        <Facts items={[[ar ? "الشخص" : "Person", person.name ?? person.subject], [ar ? "الدور" : "Role", roleName ? roleLabel(roleName, locale) : "—"], [ar ? "النطاق" : "Scope", businessLabel(scope, locale)], [ar ? "يبدأ" : "Starts", from ? new Date(from).toLocaleString(locale) : (ar ? "الآن" : "Now")], [ar ? "ينتهي" : "Ends", to ? new Date(to).toLocaleString(locale) : (ar ? "دون انتهاء" : "No end date")]]} />
        <Field label={ar ? "سبب منح الوصول" : "Reason for giving access"} required><input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </>}
      <div className="cc-wizard-nav">
        {step > 0 ? <button type="button" className="cc-secondary" onClick={() => setStep(step - 1)}>{ar ? "رجوع" : "Back"}</button> : <button type="button" className="cc-secondary" onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</button>}
        <div className="cc-push">{step < 3 ? <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}>{ar ? "متابعة" : "Continue"}</button> : <button type="button" disabled={busy || !reason.trim()} onClick={() => void confirm()}>{ar ? "تأكيد منح الوصول" : "Confirm access"}</button>}</div>
      </div>
    </section>
  );
}

/* ───────────────────────── Roles and the 5-step role wizard ───────────────────────── */

function RolesView({ locale, api, can, roles, permissions, label, run, busy, setNotice, shell, common, page, setPage, userSubject }: ViewProps & { shell: (b: React.ReactNode, a?: React.ReactNode) => React.ReactNode; common: React.ReactNode; page: number; setPage: (n: number) => void; userSubject: string | undefined }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const [detail, setDetail] = useState<Detail | null>(null); const [selectedVersion, setSelectedVersion] = useState(""); const [query, setQuery] = useState("");
  const [wizard, setWizard] = useState(false); const [step, setStep] = useState(0); const [grants, setGrants] = useState<Grant[]>([]);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [purpose, setPurpose] = useState("");
  const [actorType, setActorType] = useState("GOVERNANCE"); const [channel, setChannel] = useState("ADMIN_WEB"); const [base, setBase] = useState("");
  const [reason, setReason] = useState(""); const [effectiveDate, setEffectiveDate] = useState(""); const [validation, setValidation] = useState<string[]>([]);
  const [simSubject, setSimSubject] = useState(""); const [simulation, setSimulation] = useState<Decision | null>(null); const [simulationPermission, setSimulationPermission] = useState("access.role.view");
  const [retireReason, setRetireReason] = useState(""); const [retiring, setRetiring] = useState(false);
  const loadRole = async (id: string, versionId?: string) => { const d = await api<Detail>("/roles/" + id); setDetail(d); setSelectedVersion(versionId ?? d.versions[0]?.version.id ?? ""); return d; };
  const current = detail?.versions.find((v) => v.version.id === selectedVersion) ?? detail?.versions[0];
  const begin = (d: Detail | null, v?: VersionDetail) => {
    setWizard(true); setStep(0); setBase(""); setValidation([]); setSimulation(null); setReason(""); setEffectiveDate("");
    setName(d?.role.name ?? ""); setDescription(d?.role.description ?? ""); setPurpose(d?.role.purpose ?? "");
    setGrants(v?.grants ?? []); setActorType(v?.version.actorType ?? "GOVERNANCE"); setChannel(v?.version.channel ?? "ADMIN_WEB");
  };
  const toggle = (p: Permission, enabled: boolean) => {
    if (!enabled) { setGrants(grants.filter((g) => g.permission !== p.key)); return; }
    const next = [...grants]; const scope = p.scopes[0]; const relationship = scope === "MANAGED_CLINICIANS" ? "MANAGES" : null;
    const include = (key: string) => { if (next.some((g) => g.permission === key && g.scope === scope)) return; next.push({ permission: key, scope, relationship }); permissions.find((x) => x.key === key)?.dependencies.forEach(include); };
    include(p.key); setGrants(next); if (p.dependencies.length) setNotice(t.dependency);
  };
  const updateScope = (index: number, scope: string) => setGrants(grants.map((g, i) => (i === index ? { ...g, scope, relationship: scope === "MANAGED_CLINICIANS" ? "MANAGES" : null } : g)));
  const saveDraft = async () => {
    let d = detail; let v = current;
    if (!d) { d = await api<Detail>("/roles", "POST", { name, description, purpose, actorType, channel }); setDetail(d); v = d.versions[0]; setSelectedVersion(v.version.id); }
    if (!v) return;
    const saved = await api<VersionDetail>("/roles/" + d.role.id + "/versions/" + v.version.id, "PUT", { revision: v.version.revision, grants, reason });
    await loadRole(d.role.id, saved.version.id); setNotice(t.saved); setValidation([]);
  };
  const validate = async () => {
    if (!detail || !current) return;
    const result = await api<{ valid: boolean; errors: string[]; warnings: string[] }>("/roles/" + detail.role.id + "/versions/" + current.version.id + "/validate", "POST", { revision: current.version.revision, reason });
    setValidation(result.errors.map((e) => { const [code, key] = e.split(":"); return (ar ? "تحقق من المتطلبات والنطاق والتوافق" : "Check dependencies, scope and compatibility") + (key ? " — " + label(key) : "") + (code === "MAKER_CHECKER_SEPARATION_REQUIRED" ? " — " + t.independent : ""); }));
    setNotice(result.valid ? t.valid : t.invalid); await loadRole(detail.role.id, current.version.id);
  };
  const dirty = !!current && JSON.stringify(current.grants) !== JSON.stringify(grants);
  const published = detail?.versions.find((v) => v.version.status === "PUBLISHED");
  const sensitive = grants.filter((g) => ["HIGH", "CRITICAL"].includes(permissions.find((p) => p.key === g.permission)?.risk ?? ""));

  if (!detail && !wizard) {
    const list = roles.filter((r) => (roleLabel(r, locale) + " " + r.name + " " + r.purpose).toLowerCase().includes(query.toLowerCase()));
    return shell(<>
      {common}
      <div className="cc-filterbar"><label>{t.search}<input value={query} onChange={(e) => setQuery(e.target.value)} type="search" /></label></div>
      {!roles.length ? <EmptyState title={t.empty} /> : <ul className="ag-role-list">{list.map((r) => <li key={r.id}><button className="ag-role-link" onClick={() => void run(async () => { await loadRole(r.id); })}><span><strong>{roleLabel(r, locale)}</strong><small>{ar && r.systemTemplate ? "قالب مسؤوليات قابل للتهيئة ضمن نطاق وصول محدد" : r.purpose}</small></span><span aria-hidden>{ar ? "←" : "→"}</span></button></li>)}</ul>}
      {(page > 0 || roles.length >= 100) && <div className="cc-form-actions"><button className="cc-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>{t.previous}</button><button className="cc-secondary" disabled={roles.length < 100} onClick={() => setPage(page + 1)}>{t.next}</button></div>}
    </>, can("access.role.create") ? <button disabled={busy} onClick={() => begin(null)}><Plus size={16} aria-hidden />{t.newRole}</button> : undefined);
  }

  if (detail && !wizard && current) {
    const editAction = ["DRAFT", "VALIDATED"].includes(current.version.status)
      ? <button disabled={!can("access.role.edit_draft") || busy} onClick={() => begin(detail, current)}>{t.resume}</button>
      : <button disabled={!can("access.role.edit_draft") || busy} onClick={() => void run(async () => { const d = await api<Detail>("/roles/" + detail.role.id + "/drafts", "POST", { baseVersionId: current.version.id, reason: ar ? "مراجعة إعداد الدور" : "Review role configuration" }); setDetail(d); setSelectedVersion(d.versions[0].version.id); begin(d, d.versions[0]); })}>{t.edit}</button>;
    return shell(<>
      {common}
      <button className="cc-ghost" onClick={() => setDetail(null)}>{ar ? "→" : "←"} {t.close}</button>
      <div className="cc-section-head" style={{ marginTop: 10 }}><div><h2>{roleLabel(detail.role, locale)}</h2><p>{ar && detail.role.systemTemplate ? t.independent : detail.role.purpose}</p></div><div className="cc-section-actions">{editAction}</div></div>
      <p><StatusBadge tone={current.version.status === "PUBLISHED" ? "success" : current.version.status === "RETIRED" ? "neutral" : "warning"}>{businessLabel(current.version.status, locale)}</StatusBadge></p>
      <h3>{ar ? "ما يمنحه هذا الدور" : "What this role allows"}</h3>
      {!current.grants.length ? <p>{t.noGrants}</p> : <ul className="ag-capabilities">{current.grants.map((g, i) => <li key={i}><strong>{label(g.permission)}</strong><span>{businessLabel(g.scope, locale)}{g.relationship ? " · " + businessLabel(g.relationship, locale) : ""}</span></li>)}</ul>}
      <details className="cc-technical"><summary>{ar ? "متقدم: الإصدارات والقناة" : "Advanced: versions and channel"}</summary>
        <label>{t.history}<select value={selectedVersion} onChange={(e) => setSelectedVersion(e.target.value)}>{detail.versions.map((v) => <option key={v.version.id} value={v.version.id}>{t.version} {v.version.number} · {businessLabel(v.version.status, locale)}</option>)}</select></label>
        <p>{t.actor}: {businessLabel(current.version.actorType, locale)} · {t.channel}: {businessLabel(current.version.channel, locale)}</p>
      </details>
      {current.version.status === "PUBLISHED" && can("access.role.retire") && (!retiring ? <p style={{ marginTop: 22 }}><button type="button" className="cc-secondary cc-danger-button" onClick={() => setRetiring(true)}>{t.retire}…</button></p> : (
        <form className="cc-card" style={{ marginTop: 22 }} onSubmit={(e) => { e.preventDefault(); void run(async () => { await api("/roles/" + detail.role.id + "/versions/" + current.version.id + "/retire", "POST", { revision: current.version.revision, reason: retireReason }); await loadRole(detail.role.id, current.version.id); setRetiring(false); }); }}>
          <p>{ar ? "سيتوقف هذا الإصدار عن منح أي وصول جديد." : "This version will stop being offered for new access."}</p>
          <Field label={t.reason} required><input required maxLength={500} value={retireReason} onChange={(e) => setRetireReason(e.target.value)} /></Field>
          <div className="cc-form-actions"><button className="cc-danger-button" disabled={busy || !retireReason.trim()}>{t.retire}</button><button type="button" className="cc-secondary" onClick={() => setRetiring(false)}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </form>))}
    </>);
  }

  const preview = <section className="ag-preview" aria-label={t.preview}><h3>{t.preview}</h3><p><Check size={16} aria-hidden /> {t.can}</p><ul>{grants.map((g, i) => <li key={i}>{label(g.permission)} · {businessLabel(g.scope, locale)}{g.relationship ? " · " + businessLabel(g.relationship, locale) : ""}</li>)}</ul>{!grants.length && <p>{t.noGrants}</p>}<p><Minus size={16} aria-hidden /> {t.cannot}</p></section>;
  return shell(<>
    {common}
    <button className="cc-ghost" disabled={busy} onClick={() => setWizard(false)}>{ar ? "→" : "←"} {t.close}</button>
    <ol className="ag-steps" aria-label={t.newRole}>{t.steps.map((s, i) => <li key={s}><button aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}>{i + 1}. {s}</button></li>)}</ol>
    <div className="ag-editor"><form onSubmit={(e) => { e.preventDefault(); void run(saveDraft); }}><h2>{step + 1}. {t.steps[step]}</h2>
      {step === 0 && <>
        <label>{t.name}<input required maxLength={160} disabled={!!detail} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{t.description}<textarea required maxLength={500} disabled={!!detail} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label>{t.purpose}<textarea required maxLength={500} disabled={!!detail} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
        {!detail && <label>{t.base} <span className="cc-optional">({ar ? "اختياري" : "optional"})</span><select value={base} onChange={(e) => { setBase(e.target.value); if (e.target.value) void run(async () => { const d = await api<Detail>("/roles/" + e.target.value); const v = d.versions.find((x) => x.version.status === "PUBLISHED"); if (v) { setGrants(v.grants); setActorType(v.version.actorType); setChannel(v.version.channel); } }); }}><option value="">{t.choose}</option>{roles.map((r) => <option value={r.id} key={r.id}>{roleLabel(r, locale)}</option>)}</select></label>}
      </>}
      {step === 1 && <>
        {Object.entries(Object.groupBy(permissions, (p) => p.family)).map(([family, items]) => <fieldset key={family}><legend>{familyLabel(family, locale)}</legend>{items?.map((p) => <label className="ag-check" key={p.key}><input type="checkbox" checked={grants.some((g) => g.permission === p.key)} onChange={(e) => toggle(p, e.target.checked)} /><span>{permissionLabel(p, locale)}<small>{businessLabel(p.risk, locale)}{!p.executable ? " · " + t.future : ""}</small></span></label>)}</fieldset>)}
        {sensitive.length > 0 && <div className="cc-notice cc-notice-info"><div><p><strong>{ar ? "صلاحيات حساسة مختارة" : "Sensitive permissions selected"}</strong></p><ul>{sensitive.map((g, i) => <li key={i}>{label(g.permission)}</li>)}</ul><p>{t.recent}</p></div></div>}
      </>}
      {step === 2 && <>
        {!grants.length && <p>{t.noGrants}</p>}
        {grants.map((g, i) => <fieldset key={i}><legend>{label(g.permission)}</legend>
          <label>{t.scope}<select value={g.scope} onChange={(e) => updateScope(i, e.target.value)}>{permissions.find((p) => p.key === g.permission)?.scopes.map((s) => <option key={s} value={s}>{businessLabel(s, locale)}</option>)}</select></label>
          <label>{t.relationship}<select value={g.relationship ?? ""} onChange={(e) => setGrants(grants.map((v, n) => (n === i ? { ...v, relationship: e.target.value || null } : v)))}><option value="">{t.none}</option>{relationships.map((r) => <option key={r} value={r}>{businessLabel(r, locale)}</option>)}</select></label>
        </fieldset>)}
        <details className="cc-technical"><summary>{ar ? "متقدم: المشاركة في الرحلة وقناة الوصول" : "Advanced: journey participation and channel"}</summary>
          <label>{t.actor}<select disabled={!!detail} value={actorType} onChange={(e) => setActorType(e.target.value)}>{actors.map((a) => <option key={a} value={a}>{businessLabel(a, locale)}</option>)}</select></label>
          <label>{t.channel}<select disabled={!!detail} value={channel} onChange={(e) => setChannel(e.target.value)}>{channels.map((a) => <option key={a} value={a}>{businessLabel(a, locale)}</option>)}</select></label>
        </details>
      </>}
      {step === 3 && <>
        <p>{t.conflicts}</p><p>{t.pending}</p>
        <button type="button" disabled={busy || dirty || !reason || !current || !can("access.role.edit_draft")} onClick={() => void run(validate)}>{t.validate}</button>
        {dirty && <p className="cc-meta">{ar ? "احفظ المسودة قبل الفحص." : "Save the draft before checking it."}</p>}
        <h3>{ar ? "جرّب الدور على شخص" : "Try the role on a person"}</h3>
        <p className="cc-meta">{ar ? "تعرض المحاكاة تعيين هذا الإصدار افتراضيًا دون تغيير الوصول الفعلي." : "Simulation previews this version as a proposed assignment; it does not change live access."}</p>
        <label>{t.subject}<input value={simSubject} dir="ltr" onChange={(e) => setSimSubject(e.target.value)} maxLength={255} /></label>
        <label>{t.capabilities}<select value={simulationPermission} onChange={(e) => setSimulationPermission(e.target.value)}>{permissions.map((p) => <option key={p.key} value={p.key}>{permissionLabel(p, locale)}</option>)}</select></label>
        <button type="button" className="cc-secondary" disabled={busy || dirty || !current || !simSubject || !can("access.role.simulate")} onClick={() => void run(async () => setSimulation(await api<Decision>("/simulate", "POST", { subject: simSubject, permission: simulationPermission, resourceType: "PLATFORM", resourceId: PLATFORM, draftVersionId: current?.version.id })))}>{t.simulate}</button>
        {simulation && <p><span className={simulation.allowed ? "ag-allow" : "ag-deny"}>{simulation.allowed ? <Check size={16} aria-hidden /> : <Minus size={16} aria-hidden />} {simulation.allowed ? t.allowed : t.deniedAction}</span> — {businessLabel(simulation.reason, locale)}</p>}
      </>}
      {step === 4 && <>
        <p>{t.independent}</p>
        <h3>{t.changes}</h3>
        <ul>{grants.filter((g) => !published?.grants.some((old) => identity(old) === identity(g))).map((g, i) => <li key={i}>{t.added}: {label(g.permission)} · {businessLabel(g.scope, locale)}</li>)}{published?.grants.filter((g) => !grants.some((next) => identity(next) === identity(g))).map((g, i) => <li key={"r" + i}>{t.removed}: {label(g.permission)}</li>)}</ul>
        <label>{t.effectiveDate}<input type="datetime-local" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>
        <button type="button" disabled={busy || dirty || current?.version.status !== "VALIDATED" || !reason || !effectiveDate || !can("access.role.publish") || current?.version.createdBy === userSubject} onClick={() => void run(async () => { if (!detail || !current) return; await api("/roles/" + detail.role.id + "/versions/" + current.version.id + "/publish", "POST", { revision: current.version.revision, reason, effectiveFrom: new Date(effectiveDate).toISOString() }); await loadRole(detail.role.id, current.version.id); setWizard(false); })}>{t.publish}</button>
        {current?.version.status !== "VALIDATED" && <p className="cc-meta">{ar ? "افحص الإعداد في الخطوة ٤ قبل النشر." : "Check the configuration in step 4 before publishing."}</p>}
      </>}
      <label>{t.reason}<input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {validation.length > 0 && <ul role="alert">{validation.map((v, i) => <li key={i}>{v}</li>)}</ul>}
      <div className="cc-wizard-nav">
        <button type="button" className="cc-secondary" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>{t.previous}</button>
        <div className="cc-push">
          <button className="cc-secondary" disabled={busy || !reason || !name || !purpose || !description || !can(detail ? "access.role.edit_draft" : "access.role.create")}>{t.save}</button>
          {step < 4 && <button type="button" disabled={busy} onClick={() => setStep(step + 1)}>{t.next}</button>}
        </div>
      </div>
    </form>{preview}</div>
  </>);
}

function PermissionsView({ locale, permissions, label }: { locale: Locale; permissions: Permission[]; label: (k: string) => string }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const [query, setQuery] = useState("");
  const list = permissions.filter((p) => `${permissionLabel(p, locale)} ${familyLabel(p.family, locale)}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <p className="cc-meta">{t.futureHint}</p>
    <div className="cc-filterbar"><label>{ar ? "ابحث عن صلاحية" : "Find a permission"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    {Object.entries(Object.groupBy(list, (p) => p.family)).map(([family, items]) => <section key={family}><h2>{familyLabel(family, locale)}</h2><ul className="ag-capabilities">{items?.map((p) => <li key={p.key}><div><strong>{permissionLabel(p, locale)}</strong><p>{p.scopes.map((s) => businessLabel(s, locale)).join(" · ")}</p><details><summary>{t.advanced}</summary><p>{t.technical}: <code dir="ltr">{p.key}</code></p><p>{p.dependencies.map(label).join(" · ")}</p></details></div><span className="ag-badge">{businessLabel(p.risk, locale)}{!p.executable && <small>{t.future}</small>}</span></li>)}</ul></section>)}
    {!list.length && <EmptyState title={t.empty} />}
  </>;
}

function AuditView({ locale, api }: { locale: Locale; api: ViewProps["api"] }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const [audits, setAudits] = useState<Audit[] | null>(null); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void api<Audit[]>("/audit").then(setAudits).catch((e) => { setError(e); setAudits([]); }); }, [api]);
  if (audits === null) return <p role="status">{t.loading}</p>;
  return <>
    <ErrorNotice error={error} locale={locale} action="load" />
    {!audits.length ? <EmptyState title={ar ? "لا توجد أحداث وصول بعد" : "No access events yet"} /> : <ol className="ag-audit">{audits.map((a, i) => <li key={i}><time>{new Date(a.occurredAt).toLocaleString(ar ? "ar-AE" : "en-GB")}</time><strong>{ar ? "حدث حوكمة الوصول" : a.action.toLowerCase().replaceAll("_", " ")}</strong><StatusBadge tone={a.outcome === "DENY" ? "danger" : "success"}>{a.outcome === "DENY" ? t.deniedAction : t.allowed}</StatusBadge><details><summary>{t.advanced}</summary><p><bdi>{a.actor}</bdi> · <bdi>{a.entity}</bdi></p><p>{a.reason}</p></details></li>)}</ol>}
    {audits.length >= 100 && <button className="cc-secondary" disabled={busy} onClick={() => { setBusy(true); void api<Audit[]>("/audit?offset=" + audits.length).then((more) => setAudits([...audits, ...more])).catch(setError).finally(() => setBusy(false)); }}>{ar ? "عرض المزيد" : "Show more"}</button>}
  </>;
}
