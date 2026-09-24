"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check as CheckIcon, Minus, Plus, Search } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { accessCopy, familyLabel, permissionLabel, roleLabel } from "./access-copy";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { useControlCenterAccess } from "./control-center-access";
import { EmptyState, ErrorNotice, Facts, Field, StatusBadge, SuccessNotice, TechnicalDetails, WizardProgress } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { personName, useProviderDirectory } from "./provider-directory";
import {
  type Api, type Check, type OrganizationAccess, type Permission, type PersonAccess, type PersonRef, type Role, type RoleDetail, type RoleGroup, type VersionDetail, type WorkspaceRoles,
  PLATFORM, explainCheck, formatDate, groupAssignments, organizationLabel, sourceLabel, stateLabel, whereLabel,
} from "./access-model";

type StaffRow = { subject: string; name: string; role: string; email?: string | null; accountStatus?: string };
type Directory = ReturnType<typeof useProviderDirectory>;

/** People known to this administrator, from reads they are already authorized for: provider members and RehletShifaa staff. */
function usePeople(locale: Locale, directory: Directory) {
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const ar = locale === "ar";
  const [staff, setStaff] = useState<StaffRow[]>([]);
  useEffect(() => { if (access.legacy.admin) void api<StaffRow[]>("/admin/staff-teams").then(setStaff).catch(() => setStaff([])); }, [access.legacy.admin, api]);
  const people = useMemo(() => {
    const bySubject = new Map<string, { subject: string; name: string; contexts: string[]; email?: string | null; staff: boolean }>();
    for (const p of directory.people) {
      const row = bySubject.get(p.subject) ?? { subject: p.subject, name: personName(p, locale), contexts: [], staff: false };
      row.contexts.push(p.organization.displayName); bySubject.set(p.subject, row);
    }
    for (const s of staff) {
      const row = bySubject.get(s.subject) ?? { subject: s.subject, name: s.name, contexts: [], staff: true };
      row.staff = true; row.email = s.email ?? row.email; row.contexts.unshift(ar ? "فريق رحلة شفاء" : "RehletShifaa staff"); bySubject.set(s.subject, row);
    }
    return [...bySubject.values()];
  }, [directory.people, staff, locale, ar]);
  return { people, staff, loading: directory.loading };
}

/** Find a person by name, email or organization. An account identifier is only an advanced fallback. */
export function PersonPicker({ locale, onSelect, label, compact = false, directory }: { locale: Locale; onSelect: (p: PersonRef) => void; label?: string; compact?: boolean; directory: Directory }) {
  const ar = locale === "ar"; const t = accessCopy[locale];
  const { people, loading } = usePeople(locale, directory);
  const [query, setQuery] = useState(""); const [subject, setSubject] = useState("");
  const id = useId();
  const open = () => { if (subject.trim()) onSelect({ subject: subject.trim() }); };
  const q = query.trim().toLowerCase();
  const matches = !q ? [] : people.filter((p) => `${p.name} ${p.email ?? ""} ${p.contexts.join(" ")}`.toLowerCase().includes(q)).slice(0, 12);
  // Two people with the same name are told apart by where they work (and email where known).
  const dupes = new Set(matches.filter((p, i) => matches.findIndex((o) => o.name === p.name) !== i).map((p) => p.name));
  return (
    <div className={compact ? "ag-picker ag-picker-compact" : "cc-card ag-picker"}>
      <Field label={label ?? (ar ? "ابحث عن شخص" : "Find a person")} hint={ar ? "اكتب اسمًا أو بريدًا إلكترونيًا أو اسم مؤسسة." : "Type a name, email or organization."}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-controls={id} autoComplete="off" />
      </Field>
      {loading && <p role="status" className="cc-meta">{ar ? "جارٍ تحميل الأشخاص…" : "Loading people…"}</p>}
      <div aria-live="polite" className="cc-meta ag-sr-count">{q ? (ar ? `${matches.length} نتيجة` : `${matches.length} ${matches.length === 1 ? "match" : "matches"}`) : ""}</div>
      {q && <ul id={id} className="ag-people" aria-label={ar ? "النتائج" : "Results"}>
        {!matches.length ? <li><span className="cc-meta">{ar ? "لا يوجد أشخاص مطابقون. جرّب اسمًا آخر أو استخدم معرّف الحساب أدناه." : "Nobody matches. Try another name, or use an account identifier below."}</span></li>
          : matches.map((p) => <li key={p.subject}>
            <span><strong><bdi>{p.name}</bdi></strong><span className="cc-row-sub"><bdi>{p.contexts.join(" · ")}</bdi>{p.email && (dupes.has(p.name) || q.includes("@")) ? <> · <bdi dir="ltr">{p.email}</bdi></> : null}</span></span>
            <button type="button" className="cc-secondary cc-small" aria-label={(ar ? "اختيار " : "Select ") + p.name} onClick={() => onSelect({ subject: p.subject, name: p.name, context: p.contexts.join(" · ") })}>{ar ? "اختيار" : "Select"}</button>
          </li>)}
      </ul>}
      <details className="cc-technical">
        <summary>{ar ? "استخدام معرّف حساب بدلًا من ذلك" : "Use an account identifier instead"}</summary>
        {/* Not a <form>: the picker is also used inside the role wizard and audit filters, and forms cannot nest. */}
        <div className="ag-effective-form">
          <label>{t.subject}<input maxLength={255} dir="ltr" value={subject} onChange={(e) => setSubject(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(); } }} /></label>
          <button type="button" className="cc-secondary" disabled={!subject.trim()} onClick={open}>{ar ? "فتح" : "Open"}</button>
        </div>
      </details>
    </div>
  );
}

/* ───────────────────────── People: one person, four questions ───────────────────────── */

export function PeopleAccess({ locale, api, can, roles, permissions, label, initialSubject, focusSummary }: { locale: Locale; api: Api; can: (k: string) => boolean; roles: Role[]; permissions: Permission[]; label: (k: string) => string; initialSubject?: string; focusSummary?: boolean }) {
  const ar = locale === "ar"; const t = accessCopy[locale];
  const directory = useProviderDirectory(can("provider.view"));
  const { people, staff } = usePeople(locale, directory);
  const [person, setPerson] = useState<PersonRef | null>(initialSubject ? { subject: initialSubject } : null);
  const known = person ? people.find((p) => p.subject === person.subject) : undefined;
  const name = person?.name ?? known?.name; const context = person?.context ?? known?.contexts.join(" · ");
  const [data, setData] = useState<PersonAccess | null>(null); const [error, setError] = useState<unknown>(null); const [loading, setLoading] = useState(false);
  const [granting, setGranting] = useState(false); const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async (p: PersonRef) => {
    setLoading(true); setError(null);
    try { setData(await api<PersonAccess>("/people/access?subject=" + encodeURIComponent(p.subject))); }
    catch (e) { setError(e); setData(null); } finally { setLoading(false); }
  }, [api]);
  const subject = person?.subject;
  useEffect(() => { if (subject) void load({ subject }); }, [subject, load]);
  useEffect(() => { if (person && !initialSubject) heading.current?.focus(); }, [person, initialSubject]);
  const manage = can("access.assignment.manage");
  if (!person) return <PersonPicker locale={locale} directory={directory} onSelect={(p) => { setPerson(p); setGranting(false); setNotice(""); }} />;
  const displayName = name ?? (ar ? "الشخص المحدد" : "Selected person");
  const isStaff = staff.some((s) => s.subject === person.subject);
  return (
    <div className="ag-person">
      <div className="cc-section-head ag-person-head">
        <div>
          <h2 ref={heading} tabIndex={-1}><bdi>{displayName}</bdi></h2>
          {context && <p><bdi>{context}</bdi></p>}
          {!name && <TechnicalDetails locale={locale} items={[[t.subject, <bdi dir="ltr" key="s">{person.subject}</bdi>]]} />}
        </div>
        <div className="cc-section-actions">
          <button type="button" className="cc-ghost" onClick={() => { setPerson(null); setData(null); setGranting(false); }}><Search size={16} aria-hidden />{ar ? "شخص آخر" : "Another person"}</button>
        </div>
      </div>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load(person)} />
      {loading && !data && <p role="status">{t.loading}</p>}
      <AccountWorkspaces locale={locale} api={api} subject={person.subject} organizations={data?.organizations ?? []} canViewProviders={can("provider.view")} isStaff={isStaff} />
      {data && <>
        <BusinessAccess locale={locale} api={api} data={data} name={displayName} manage={manage} granting={granting} onGive={() => setGranting(true)}
          onChanged={async (message) => { setNotice(message); await load(person); }} />
        {granting && <GiveAccess locale={locale} api={api} roles={roles} person={{ ...person, name: displayName }} organizations={directory.details.map((d) => d.organization)} personOrganizations={data.organizations}
          onCancel={() => setGranting(false)} onGranted={async (status) => { setGranting(false); setNotice(status === "PENDING" ? (ar ? "حُفظ الوصول. يبدأ بعد التحقق من المؤسسة." : "Access saved. It starts once the organization is verified.") : (ar ? "حُفظ الوصول." : "Access saved.")); await load(person); }} />}
        <AccessSummary locale={locale} api={api} subject={person.subject} name={displayName} permissions={permissions} label={label} organizations={data.organizations} directory={directory} autoFocus={focusSummary} />
        <AccessChanges locale={locale} organizations={data.organizations} canViewProviders={can("provider.view")} isStaff={isStaff} />
      </>}
    </div>
  );
}

/* ───────────────────────── A. Account & workspaces (identity system, read-only) ───────────────────────── */

const WORKSPACES: Record<string, [string, string, string, string]> = {
  COORDINATOR: ["Coordinator", "Staff Portal", "منسق", "بوابة الموظفين"], COORDINATOR_LEAD: ["Coordination lead", "Staff Portal", "قائد التنسيق", "بوابة الموظفين"],
  OPERATIONS: ["Operations", "Staff Portal", "العمليات", "بوابة الموظفين"], OPERATIONS_LEAD: ["Operations lead", "Staff Portal", "قائد العمليات", "بوابة الموظفين"],
  FINANCE: ["Finance", "Staff Portal", "المالية", "بوابة الموظفين"], FINANCE_LEAD: ["Finance lead", "Staff Portal", "قائد المالية", "بوابة الموظفين"],
  DOCTOR: ["Consultant (direct)", "Staff Portal — clinical work", "استشاري (مباشر)", "بوابة الموظفين — العمل السريري"],
  CREDENTIALING_ADMIN: ["Credentialing administrator", "Control Center", "مسؤول الاعتمادات", "مركز التحكم"], SYSTEM_ADMIN: ["System administrator", "Control Center", "مسؤول النظام", "مركز التحكم"],
  AUDITOR: ["Auditor (read-only)", "Control Center", "مدقق (قراءة فقط)", "مركز التحكم"], PATIENT_IDENTITY_REVIEWER: ["Identity reviewer", "Identity checks", "مراجع الهوية", "التحقق من الهوية"],
  PATIENT: ["Patient", "My Care", "مريض", "رعايتي"], PATIENT_REPRESENTATIVE: ["Patient representative", "My Care", "ممثل المريض", "رعايتي"],
};
const ACCOUNT_STATUS: Record<string, [string, string]> = { ACTIVE: ["Account active — can sign in", "الحساب نشط — يمكنه تسجيل الدخول"], INVITED: ["Invitation not yet accepted", "لم تُقبل الدعوة بعد"], DISABLED: ["Account disabled — cannot sign in", "الحساب معطّل — لا يمكن تسجيل الدخول"], NOT_FOUND: ["No sign-in account found", "لا يوجد حساب دخول"] };
const PROVIDER_ROLE: Record<string, [string, string]> = { ORGANIZATION_OWNER: ["Organization owner", "مالك المؤسسة"], PRACTICE_MANAGER: ["Practice manager", "مدير العيادة"], CONSULTANT: ["Provider consultant", "استشاري لدى مقدم رعاية"], ASSOCIATE_DOCTOR: ["Associate doctor", "طبيب مشارك"], CONSULTANT_ASSISTANT: ["Consultant assistant", "مساعد استشاري"] };

/**
 * ACCOUNT & WORKSPACES — where this person can sign in and which workspace each entitlement opens. Identity-system roles
 * are read-only here (never presented as RehletShifaa roles); provider memberships open My Practice. No controls change
 * identity-system roles; the management places are linked.
 */
function AccountWorkspaces({ locale, api, subject, organizations, canViewProviders, isStaff }: { locale: Locale; api: Api; subject: string; organizations: OrganizationAccess[]; canViewProviders: boolean; isStaff: boolean }) {
  const ar = locale === "ar";
  const access = useControlCenterAccess();
  const [value, setValue] = useState<WorkspaceRoles | null>(null); const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true; setValue(null); setError(null);
    api<WorkspaceRoles>("/workspace-roles?subject=" + encodeURIComponent(subject)).then((v) => { if (live) setValue(v); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, subject]);
  const practices = organizations.filter((o) => !o.platform && o.membership && o.membership.status !== "REVOKED" && o.assignments.some((a) => PROVIDER_ROLE[a.roleKey]));
  return (
    <section className="ag-source" aria-labelledby="workspace-roles-title">
      <h3 id="workspace-roles-title">{ar ? "الحساب ومساحات العمل" : "Account & workspaces"}</h3>
      <p className="cc-meta">{ar ? "أين يمكن لهذا الشخص تسجيل الدخول وما الذي يفتحه كل حساب." : "Where this person can sign in, and what each entitlement opens."}</p>
      {error ? <ErrorNotice error={error} locale={locale} action="load" />
        : !value ? <p role="status" className="cc-meta">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
        : !value.available ? <p className="cc-meta">{ar ? "تعذّر سؤال نظام الهوية الآن، لذا لا تُعرض مساحات العمل. هذا لا يعني أن الشخص لا يملك أيًا منها." : "The identity system couldn't be asked right now, so workspaces aren't shown. This doesn't mean the person has none."}</p>
        : <>
          {value.accountStatus && ACCOUNT_STATUS[value.accountStatus] && <p><StatusBadge tone={value.accountStatus === "ACTIVE" ? "success" : value.accountStatus === "DISABLED" ? "danger" : "warning"}>{ACCOUNT_STATUS[value.accountStatus][ar ? 1 : 0]}</StatusBadge></p>}
          <ul className="ag-capabilities">
            {value.roles.map((r) => { const w = WORKSPACES[r]; return (
              <li key={r}><div><strong>{w ? w[ar ? 3 : 1] : r}</strong><p>{w ? w[ar ? 2 : 0] : ""}</p>
                {r === "PATIENT" && <p className="cc-meta">{ar ? "يحصل كل حساب دخول على هذا تلقائيًا. يفتح فقط السجلات المرتبطة بهذا الحساب، إن وُجدت." : "Every sign-in account gets this automatically. It opens only records linked to this account, if any."}</p>}
              </div><span className="ag-source-tag">{ar ? "يديره نظام الهوية" : "Managed by Identity System"}</span></li>); })}
            {practices.map((o) => (
              <li key={o.organizationId}><div><strong>{ar ? "عيادتي" : "My Practice"}</strong>
                <p>{[...new Set(o.assignments.map((a) => PROVIDER_ROLE[a.roleKey]?.[ar ? 1 : 0]).filter(Boolean))].join(" · ")} · <bdi>{organizationLabel(o, locale)}</bdi></p></div>
                <span className="ag-source-tag">{ar ? "عضوية لدى مقدم الرعاية" : "Provider membership"}</span></li>
            ))}
          </ul>
          {!value.roles.length && !practices.length && <p className="cc-meta">{ar ? "لا توجد مساحة عمل في البوابة لهذا الحساب." : "This account has no portal workspace."}</p>}
        </>}
      <p className="ag-links">
        {isStaff && access.legacy.admin && <Link href={ccHref(locale, "/team")}>{ar ? "إدارة تسجيل الدخول في فريق رحلة شفاء" : "Manage sign-in in RehletShifaa Staff"}</Link>}
        {canViewProviders && practices.map((o) => <Link key={o.organizationId} href={ccHref(locale, `/providers/${o.organizationId}?tab=people`)}>{ar ? "إدارة العضوية في " : "Manage membership in "}<bdi>{organizationLabel(o, locale)}</bdi></Link>)}
      </p>
      <p className="cc-meta">{ar ? "أدوار نظام الهوية للقراءة فقط هنا، ولا تُغيَّر من صفحة الصلاحيات." : "Identity-system roles are read-only here; they are not changed from Access & Governance."}</p>
    </section>
  );
}

/* ───────────────────────── B. Business access (RehletShifaa roles) ───────────────────────── */

function BusinessAccess({ locale, api, data, name, manage, granting, onGive, onChanged }: { locale: Locale; api: Api; data: PersonAccess; name: string; manage: boolean; granting: boolean; onGive: () => void; onChanged: (message: string) => Promise<void> }) {
  const ar = locale === "ar";
  const groups = groupAssignments(data.organizations);
  const [removing, setRemoving] = useState<RoleGroup | null>(null);
  return (
    <section className="ag-source" aria-labelledby="business-access-title">
      <div className="cc-section-head"><div>
        <h3 id="business-access-title">{ar ? "الوصول إلى أعمال رحلة شفاء" : "Business access"}</h3>
        <p className="cc-meta">{ar ? "أدوار رحلة شفاء المسندة لهذا الشخص، وأين تنطبق." : "RehletShifaa roles this person holds, and where they apply."}</p>
      </div>{manage && !granting && <div className="cc-section-actions"><button type="button" onClick={onGive}><Plus size={16} aria-hidden />{ar ? "منح وصول" : "Give access"}</button></div>}</div>
      {data.truncated && <p className="cc-notice cc-notice-info">{ar ? "يعرض هذا أول ٥٠ مؤسسة فقط." : "Only the first 50 organizations are shown."}</p>}
      {!groups.length ? <EmptyState title={ar ? "لا توجد أدوار أعمال مسندة" : "No RehletShifaa business roles assigned"} body={manage ? (ar ? "امنح هذا الشخص دورًا إذا كان يحتاج إلى وصول إلى أعمال رحلة شفاء. مساحات العمل أعلاه منفصلة." : "Give this person a role if they need RehletShifaa business access. The workspaces above are separate.") : undefined} />
        : <ul className="ag-cards">{groups.map((g) => {
          const [state, tone] = stateLabel(g.state, locale);
          const where = [...new Set(g.assignments.map((a) => whereLabel(a.scope, locale)))];
          const relationships = g.organization.relationships.filter((r) => r.type === "MANAGES" && g.assignments.some((a) => a.scope === "MANAGED_CLINICIANS"));
          return (
            <li key={g.key} className="ag-card">
              <div className="ag-card-head"><strong>{g.roleName}</strong><StatusBadge tone={tone}>{state}</StatusBadge></div>
              <Facts items={[
                [ar ? "المؤسسة" : "Organization", <bdi key="o">{organizationLabel(g.organization, locale)}</bdi>],
                [ar ? "أين ينطبق" : "Where it applies", where.join(" · ")],
                [ar ? "الصلاحية" : "Valid", g.effectiveTo ? (ar ? "حتى " : "Until ") + formatDate(g.effectiveTo, locale) : (ar ? "بلا تاريخ انتهاء" : "No end date")],
                [ar ? "المصدر" : "Source", sourceLabel(g.source, "", locale)],
              ]} />
              {relationships.length > 0 && <p className="cc-meta">{ar ? "يدير: " : "Manages: "}{relationships.map((r, i) => <span key={r.id}>{i ? ", " : ""}<bdi>{r.targetName ?? (ar ? "طبيب" : "a clinician")}</bdi></span>)}</p>}
              {g.state === "PENDING" && <p className="cc-meta">{ar ? "لا يمنح هذا الدور أي وصول حتى يتم التحقق من المؤسسة." : "This role grants nothing until the organization is verified."}</p>}
              <TechnicalDetails locale={locale} items={g.assignments.map((a) => [whereLabel(a.scope, locale), <span key={a.id} dir="ltr">{`${a.roleKey} v${a.versionNumber} · ${a.scope} · rev ${a.revision}`}</span>])} />
              {manage && <div className="ag-card-actions"><button type="button" className="cc-secondary cc-small cc-danger-button" aria-label={(ar ? "إزالة وصول " : "Remove access: ") + g.roleName + " — " + organizationLabel(g.organization, locale)} onClick={() => setRemoving(g)}>{ar ? "إزالة هذا الوصول" : "Remove this access"}</button></div>}
            </li>
          );
        })}</ul>}
      {removing && <RemoveAccessDialog locale={locale} api={api} group={removing} name={name} onClose={() => setRemoving(null)} onRemoved={async () => { const role = removing.roleName; setRemoving(null); await onChanged(ar ? `أُزيل دور ${role}.` : `${role} access removed.`); }} />}
    </section>
  );
}

/**
 * Removing a business role explains the consequence and asks for the audit reason once. It revokes this role's
 * assignments in this organization only — never the sign-in account, the membership or a relationship.
 */
function RemoveAccessDialog({ locale, api, group, name, onClose, onRemoved }: { locale: Locale; api: Api; group: RoleGroup; name: string; onClose: () => void; onRemoved: () => Promise<void> }) {
  const ar = locale === "ar";
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [done, setDone] = useState(0);
  const where = organizationLabel(group.organization, locale);
  const membership = group.source === "PROVIDER_ONBOARDING";
  const title = ar ? `إزالة دور ${group.roleName}؟` : `Remove ${group.roleName} access?`;
  const submit = async () => {
    if (!reason.trim()) return; setBusy(true); setError(null);
    try {
      for (const a of group.assignments.slice(done)) {
        await api("/assignments/" + a.id + "/revoke?organization=" + encodeURIComponent(group.organization.organizationId), "POST", { revision: a.revision, reason: reason.trim() });
        setDone((n) => n + 1);
      }
      await onRemoved();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <FocusTrapDialog label={title} onClose={busy ? () => undefined : onClose}>
      <h2>{title}</h2>
      <p><bdi>{name}</bdi> {ar ? `لن يتمكن بعد الآن من فعل ما يسمح به دور ${group.roleName} في ` : `will no longer be able to do what ${group.roleName} allows in `}<bdi>{where}</bdi>{ar ? ". لن تتغير مساحات العمل الأخرى أو الأدوار الأخرى." : ". Other workspace access and unrelated roles will not be changed."}</p>
      {membership && <p className="cc-meta">{ar ? "يبقى الشخص عضوًا في المؤسسة. لإنهاء العضوية استخدم صفحة الأشخاص في المؤسسة." : "They stay a member of the organization. To end the membership, use the organization's People page."}</p>}
      <p className="cc-meta">{ar ? "يُسجَّل التغيير في سجل التدقيق ويسري فورًا." : "The change takes effect immediately and is recorded in the audit log."}</p>
      {done > 0 && done < group.assignments.length && <p role="status" className="cc-notice cc-notice-info">{ar ? "أُزيل جزء من هذا الوصول. حاول مجددًا لإكمال الإزالة." : "Part of this access was removed. Try again to finish removing it."}</p>}
      <ErrorNotice error={error} locale={locale} />
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label={ar ? "سبب الإزالة" : "Reason for removing access"} required><input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="cc-form-actions"><button className="cc-danger-button" disabled={busy || !reason.trim()}>{ar ? "إزالة الوصول" : "Remove access"}</button><button type="button" className="cc-secondary" disabled={busy} onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button></div>
      </form>
    </FocusTrapDialog>
  );
}

/* ───────────────────────── Give access: role → where it applies → review ───────────────────────── */

function GiveAccess({ locale, api, roles, person, organizations, personOrganizations, onCancel, onGranted }: { locale: Locale; api: Api; roles: Role[]; person: PersonRef; organizations: { id: string; displayName: string }[]; personOrganizations: OrganizationAccess[]; onCancel: () => void; onGranted: (status: string) => Promise<void> }) {
  const ar = locale === "ar";
  const [step, setStep] = useState(0);
  const [role, setRole] = useState(""); const [versions, setVersions] = useState<VersionDetail[]>([]); const [version, setVersion] = useState("");
  const [scope, setScope] = useState(""); const [organization, setOrganization] = useState(""); const [targetType, setTargetType] = useState(""); const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [query, setQuery] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [step]);
  const pickRole = async (id: string) => {
    setRole(id); setVersion(""); setScope(""); setVersions([]); setError(null);
    try { const d = await api<RoleDetail>("/roles/" + id); const published = d.versions.filter((v) => v.version.status === "PUBLISHED").sort((a, b) => b.version.number - a.version.number); setVersions(published); setVersion(published[0]?.version.id ?? ""); }
    catch (e) { setError(e); }
  };
  const current = versions.find((v) => v.version.id === version);
  const scopes = useMemo(() => [...new Set(current?.grants.map((g) => g.scope) ?? [])], [current]);
  useEffect(() => { if (scopes.length === 1 && !scope) setScope(scopes[0]); }, [scopes, scope]);
  // Organizations: the platform, every organization this administrator can see, and any the person already belongs to.
  const places = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of personOrganizations) if (!o.platform) map.set(o.organizationId, organizationLabel(o, locale));
    for (const o of organizations) map.set(o.id, o.displayName);
    return [...map.entries()];
  }, [organizations, personOrganizations, locale]);
  const where = scope === "PLATFORM" ? PLATFORM : organization;
  const chosen = roles.find((r) => r.id === role);
  const whereName = where === PLATFORM ? (ar ? "منصة رحلة شفاء" : "RehletShifaa platform") : places.find(([id]) => id === where)?.[1] ?? "";
  const steps = [{ key: "role", label: ar ? "اختر الدور" : "Choose role" }, { key: "where", label: ar ? "أين ينطبق" : "Where it applies" }, { key: "review", label: ar ? "المراجعة" : "Review" }];
  const canNext = step === 0 ? !!role && !!version : step === 1 ? !!scope && !!where && (scope !== "SPECIFIC_RESOURCE" || (!!targetType && !!targetId)) : true;
  const confirm = async () => {
    if (!reason.trim()) return; setBusy(true); setError(null);
    try {
      const result = await api<{ status: string }>("/assignments", "POST", { subject: person.subject, organizationId: where, versionId: version, scope, targetType: scope === "SPECIFIC_RESOURCE" ? targetType : null, targetId: scope === "SPECIFIC_RESOURCE" ? targetId : null, effectiveFrom: from ? new Date(from).toISOString() : new Date().toISOString(), effectiveTo: to ? new Date(to).toISOString() : null, reason: reason.trim() });
      await onGranted(result.status);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <section className="cc-card ag-give" aria-labelledby="give-access-title">
      <h3 id="give-access-title" ref={title} tabIndex={-1} style={{ marginTop: 0 }}>{ar ? "منح وصول إلى " : "Give "}<bdi>{person.name}</bdi>{ar ? "" : " access"} — {steps[step].label}</h3>
      <WizardProgress locale={locale} current={step} steps={steps.map((s, i) => ({ ...s, done: i < step }))} />
      <ErrorNotice error={error} locale={locale} />
      {step === 0 && <>
        <Field label={ar ? "ابحث عن دور" : "Find a role"}><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <div className="cc-choices" role="radiogroup" aria-label={ar ? "الأدوار" : "Roles"}>{roles.filter((r) => `${roleLabel(r, locale)} ${r.purpose}`.toLowerCase().includes(query.toLowerCase())).map((r) => (
          <label key={r.id} className="cc-choice"><input type="radio" name="role" checked={role === r.id} onChange={() => void pickRole(r.id)} /><span><strong>{roleLabel(r, locale)}</strong><small>{r.purpose}</small></span></label>))}</div>
        {role && current === undefined && versions.length === 0 && <p className="cc-issue">{ar ? "لا يوجد إصدار منشور لهذا الدور بعد." : "This role has no published version yet."}</p>}
        {versions.length > 1 && <details className="cc-technical"><summary>{ar ? "متقدم: إصدار الدور" : "Advanced: role version"}</summary><label>{ar ? "الإصدار المنشور" : "Published version"}<select value={version} onChange={(e) => { setVersion(e.target.value); setScope(""); }}>{versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.version.number}</option>)}</select></label><p className="cc-meta">{ar ? "يُستخدم أحدث إصدار منشور افتراضيًا." : "The newest published version is used unless you choose another."}</p></details>}
      </>}
      {step === 1 && <>
        <div className="cc-choices" role="radiogroup" aria-label={ar ? "أين ينطبق" : "Where it applies"}>{scopes.map((s) => <label key={s} className="cc-choice"><input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} /><span><strong>{whereLabel(s, locale)}</strong></span></label>)}</div>
        {scope && scope !== "PLATFORM" && <Field label={ar ? "المؤسسة" : "Organization"} required><select value={organization} onChange={(e) => setOrganization(e.target.value)}><option value="">{ar ? "اختر مؤسسة" : "Choose an organization"}</option><option value={PLATFORM}>{ar ? "منصة رحلة شفاء" : "RehletShifaa platform"}</option>{places.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>}
        {scope === "MANAGED_CLINICIANS" && <p className="cc-meta">{ar ? "ينطبق فقط على الأطباء الذين يديرهم هذا الشخص فعليًا. تُدار العلاقات المهنية في صفحة الطبيب." : "Applies only to clinicians this person actually manages. Professional relationships are managed on the clinician's page."}</p>}
        {scope === "SELF" && <p className="cc-meta">{ar ? "ينطبق فقط على سجلات هذا الشخص نفسه." : "Applies only to this person's own records."}</p>}
        {scope === "SPECIFIC_RESOURCE" && <details className="cc-technical" open><summary>{ar ? "متقدم: العنصر المحدد" : "Advanced: the specific item"}</summary><div className="cc-form-grid"><Field label={ar ? "نوع المورد" : "Resource type"} required><input maxLength={60} dir="ltr" value={targetType} onChange={(e) => setTargetType(e.target.value)} /></Field><Field label={ar ? "معرّف المورد" : "Resource identifier"} required><input maxLength={255} dir="ltr" value={targetId} onChange={(e) => setTargetId(e.target.value)} /></Field></div></details>}
        <p className="cc-meta">{ar ? "الوصول في مؤسسة غير موثّقة يبقى معلّقًا ولا يمنح وصولًا إلى بيانات المرضى." : "Access in an unverified organization stays pending and grants no patient data access."}</p>
      </>}
      {step === 2 && <>
        <Facts items={[[ar ? "الشخص" : "Person", <bdi key="p">{person.name ?? person.subject}</bdi>], [ar ? "الدور" : "Role", chosen ? roleLabel(chosen, locale) : "—"], [ar ? "أين ينطبق" : "Where it applies", `${whereLabel(scope, locale)} · ${whereName}`], [ar ? "يبدأ" : "Starts", from ? new Date(from).toLocaleString(locale) : (ar ? "الآن" : "Now")], [ar ? "ينتهي" : "Ends", to ? new Date(to).toLocaleString(locale) : (ar ? "بلا تاريخ انتهاء" : "No end date")]]} />
        <details className="cc-technical"><summary>{ar ? "تحديد تاريخ بدء أو انتهاء (اختياري)" : "Set a start or end date (optional)"}</summary><div className="cc-form-grid">
          <Field label={ar ? "يبدأ في" : "Starts"} hint={ar ? "اتركه فارغًا ليبدأ الآن" : "Leave blank to start now"} optionalLabel={ar ? "اختياري" : "optional"}><input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={ar ? "ينتهي في" : "Ends"} hint={ar ? "اتركه فارغًا دون انتهاء" : "Leave blank for no end date"} optionalLabel={ar ? "اختياري" : "optional"}><input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div></details>
        <Field label={ar ? "سبب منح الوصول" : "Reason for giving access"} required hint={ar ? "يُسجَّل في سجل التدقيق." : "Recorded in the audit log."}><input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="cc-meta">{ar ? "تتحقق المنصة من فصل المسؤوليات والتحقق من المؤسسة والعلاقات المطلوبة عند التأكيد." : "Separation of duties, organization verification and required relationships are checked when you confirm."}</p>
      </>}
      <div className="cc-wizard-nav">
        {step > 0 ? <button type="button" className="cc-secondary" onClick={() => setStep(step - 1)}>{ar ? "رجوع" : "Back"}</button> : <button type="button" className="cc-secondary" onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</button>}
        <div className="cc-push">{step < 2 ? <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}>{ar ? "متابعة" : "Continue"}</button> : <button type="button" disabled={busy || !reason.trim()} onClick={() => void confirm()}>{ar ? "تأكيد منح الوصول" : "Confirm access"}</button>}</div>
      </div>
    </section>
  );
}

/* ───────────────────────── C. Access summary: "Can this person …?" ───────────────────────── */

function AccessSummary({ locale, api, subject, name, permissions, label, organizations, directory, autoFocus }: { locale: Locale; api: Api; subject: string; name: string; permissions: Permission[]; label: (k: string) => string; organizations: OrganizationAccess[]; directory: Directory; autoFocus?: boolean }) {
  const ar = locale === "ar";
  const [query, setQuery] = useState(""); const [permission, setPermission] = useState("");
  const places = useMemo(() => {
    const list = organizations.filter((o) => !o.platform).map((o) => ({ id: o.organizationId, label: organizationLabel(o, locale) }));
    return [{ id: PLATFORM, label: ar ? "منصة رحلة شفاء" : "RehletShifaa platform" }, ...list];
  }, [organizations, locale, ar]);
  const [where, setWhere] = useState(places[1]?.id ?? PLATFORM); const [clinician, setClinician] = useState("");
  const [result, setResult] = useState<Check | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (autoFocus) heading.current?.focus(); }, [autoFocus]);
  const clinicians = where === PLATFORM ? [] : (directory.details.find((d) => d.organization.id === where)?.members ?? []).filter((m) => m.practitionerId && m.status !== "REVOKED");
  const visible = permissions.filter((p) => `${permissionLabel(p, locale)} ${familyLabel(p.family, locale)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const families = Object.entries(Object.groupBy(visible, (p) => p.family));
  const check = async () => {
    if (!permission) return; setBusy(true); setError(null); setResult(null);
    try { setResult(await api<Check>(`/check?subject=${encodeURIComponent(subject)}&permission=${encodeURIComponent(permission)}&organization=${encodeURIComponent(where)}${clinician ? "&clinician=" + encodeURIComponent(clinician) : ""}`)); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const explanation = result ? explainCheck(result, locale) : null;
  return (
    <section className="ag-source" aria-labelledby="access-summary-title" id="access-summary">
      <h3 id="access-summary-title" ref={heading} tabIndex={-1}>{ar ? "ملخص الصلاحيات" : "Access Summary"}</h3>
      <p className="cc-meta">{ar ? "هل يستطيع هذا الشخص…؟ الإجابة والسبب من المنصة نفسها." : "Can this person…? The answer and the reason come from the platform itself."}</p>
      <form className="ag-check-form" onSubmit={(e) => { e.preventDefault(); void check(); }}>
        <Field label={ar ? "ابحث عن إجراء" : "Find an action"}><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <Field label={ar ? `هل يستطيع ${name}…` : `Can ${name}…`} required>
          <select value={permission} onChange={(e) => { setPermission(e.target.value); setResult(null); }}>
            <option value="">{ar ? "اختر إجراءً" : "Choose an action"}</option>
            {families.map(([family, items]) => <optgroup key={family} label={familyLabel(family, locale)}>{items?.map((p) => <option key={p.key} value={p.key}>{permissionLabel(p, locale)}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label={ar ? "أين" : "Where"}><select value={where} onChange={(e) => { setWhere(e.target.value); setClinician(""); setResult(null); }}>{places.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
        {clinicians.length > 0 && <Field label={ar ? "لطبيب محدد" : "For a clinician"} optionalLabel={ar ? "اختياري" : "optional"} hint={ar ? "للصلاحيات التي تخص سجلات الطبيب أو الأطباء الذين يديرهم." : "For access to a clinician's own records, or clinicians they manage."}>
          <select value={clinician} onChange={(e) => { setClinician(e.target.value); setResult(null); }}><option value="">{ar ? "على مستوى المؤسسة" : "Organization-wide"}</option>{clinicians.map((m) => <option key={m.practitionerId} value={m.practitionerId ?? ""}>{personName(m, locale)}</option>)}</select></Field>}
        <div className="cc-form-actions"><button disabled={busy || !permission}>{busy ? (ar ? "جارٍ الفحص…" : "Checking…") : (ar ? "فحص" : "Check")}</button></div>
      </form>
      <ErrorNotice error={error} locale={locale} action="load" />
      <div aria-live="polite" role="status" className="ag-check-result-live">
        {result && explanation && <div className={"ag-check-result " + (result.allowed ? "is-allowed" : "is-denied")}>
          <p className="ag-verdict">{result.allowed ? <CheckIcon size={18} aria-hidden /> : <Minus size={18} aria-hidden />} <strong>{result.allowed ? (ar ? "مسموح" : "Allowed") : (ar ? "غير مسموح" : "Not allowed")}</strong> — {label(result.permission)}</p>
          {result.allowed ? <Facts items={[
            [ar ? "الدور" : "Role", result.roleName ?? "—"],
            [ar ? "أين" : "Where", <bdi key="w">{[result.organizationName ?? (result.organizationId === PLATFORM ? (ar ? "منصة رحلة شفاء" : "RehletShifaa platform") : ""), result.clinicianName].filter(Boolean).join(" · ")}</bdi>],
            [ar ? "لأن" : "Because", explanation.because ?? "—"],
            [ar ? "الصلاحية" : "Valid", result.validUntil ? (ar ? "حتى " : "Until ") + formatDate(result.validUntil, locale) : (ar ? "بلا تاريخ انتهاء" : "No end date")],
          ]} /> : <Facts items={[[ar ? "السبب" : "Reason", explanation.reason ?? "—"]]} />}
          {result.recentAuthentication && <p className="cc-meta">{ar ? "سيُطلب منه تسجيل الدخول مجددًا قبل تنفيذ هذا الإجراء." : "They will be asked to sign in again before doing this."}</p>}
          <TechnicalDetails locale={locale} items={[[ar ? "الصلاحية" : "Permission", <code key="k" dir="ltr">{result.permission}</code>], [ar ? "النطاق" : "Scope", result.scope ?? "—"], [ar ? "رمز السبب" : "Reason code", result.reason]]} />
        </div>}
      </div>
    </section>
  );
}

/* ───────────────────────── D. Access changes and offboarding — only what exists today ───────────────────────── */

function AccessChanges({ locale, organizations, canViewProviders, isStaff }: { locale: Locale; organizations: OrganizationAccess[]; canViewProviders: boolean; isStaff: boolean }) {
  const ar = locale === "ar";
  const access = useControlCenterAccess();
  const memberships = organizations.filter((o) => !o.platform && o.membership && o.membership.status !== "REVOKED");
  return (
    <section className="ag-source" aria-labelledby="access-changes-title">
      <h3 id="access-changes-title">{ar ? "تغيير الوصول أو إنهاؤه" : "Changing or ending access"}</h3>
      <p className="cc-meta">{ar ? "لا يوجد إجراء واحد لحذف شخص. كل خطوة منفصلة، ويبقى السجل وسجل التدقيق محفوظين." : "There is no single \"delete person\" action. Each step below is separate, and history and audit records are kept."}</p>
      <ul className="ag-steps-list">
        <li><strong>{ar ? "إزالة دور أعمال" : "Remove a business role"}</strong><span>{ar ? "من «الوصول إلى الأعمال» أعلاه. يؤثر على هذا الدور فقط." : "From Business access above. Affects only that role."}</span></li>
        {memberships.length > 0 && <li><strong>{ar ? "إنهاء العضوية في مؤسسة" : "End an organization membership"}</strong><span>{ar ? "يزيل كل أدواره وعلاقاته المهنية في تلك المؤسسة. " : "Removes all their roles and professional relationships in that organization. "}{canViewProviders ? memberships.map((o) => <Link key={o.organizationId} href={ccHref(locale, `/providers/${o.organizationId}?tab=people`)}><bdi>{organizationLabel(o, locale)}</bdi></Link>) : (ar ? "يتطلب صلاحية إدارة المؤسسة." : "Needs organization administration access.")}</span></li>}
        <li><strong>{ar ? "إيقاف تسجيل الدخول" : "Disable sign-in"}</strong><span>{isStaff && access.legacy.admin ? <Link href={ccHref(locale, "/team")}>{ar ? "في فريق رحلة شفاء" : "In RehletShifaa Staff"}</Link> : (ar ? "لموظفي رحلة شفاء والأطباء المباشرين يقوم به مسؤول النظام. لا يوجد أمر لإيقاف حساب أعضاء مقدمي الرعاية بعد." : "For RehletShifaa staff and Direct clinicians, a system administrator does this. There is no command yet to disable a provider member's sign-in account.")}</span></li>
        <li><strong>{ar ? "إعادة إسناد العمل المفتوح" : "Reassign open work"}</strong><span>{ar ? "لا يحدث تلقائيًا. يعيد المنسقون إسناد الحالات من قائمة الفريق." : "Not automatic. Coordinators reassign cases from the team queue."}</span></li>
      </ul>
    </section>
  );
}
