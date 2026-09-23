"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { useControlCenterAccess, type ControlCenterAccess } from "./control-center-access";
import { useAdminApi, type AdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { ActionMenu, EmptyState, ErrorNotice, Field, StatusBadge, SuccessNotice, type MenuAction } from "./cc-ui";
import { membershipStatusLabel, personRoleLabel, relationshipLabel } from "./admin-labels";
import { CLINICIAN_ROLES, PRACTICE_ROLES, personName, useProviderDirectory, type Member, type Organization, type ProviderDetail } from "./provider-directory";
import { consultantHref } from "./ConsultantOnboardingWizard";

const invitePermission = (role: string) => (CLINICIAN_ROLES.includes(role) ? "provider.clinician.invite" : "provider.practice_staff.manage");

/** Invite someone into an organization with one business role — `POST …/members/invite`, unchanged. */
export function InvitePersonDialog({ locale, api, organizations, initialOrg, roles, onClose, onInvited }: { locale: Locale; api: AdminApi; organizations: Organization[]; initialOrg?: string; roles: string[]; onClose: () => void; onInvited: (orgId: string) => void }) {
  const ar = locale === "ar";
  const [org, setOrg] = useState(initialOrg ?? (organizations.length === 1 ? organizations[0].id : ""));
  const [role, setRole] = useState(roles[0] ?? ""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [language, setLanguage] = useState<string>(locale);
  const [reason, setReason] = useState(ar ? "إضافة عضو إلى فريق العيادة" : "Adding a practice team member");
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const req = (v: string) => (touched && !v.trim() ? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!org || !role || !name.trim() || !/^\S+@\S+\.\S+$/.test(email) || !reason.trim()) return;
    setBusy(true); setError(null);
    try { await api(`/admin/providers/${org}/members/invite`, { method: "POST", body: { name: name.trim(), email: email.trim(), role, locale: language, reason: reason.trim() } }); onInvited(org); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = ar ? "إضافة عضو إلى فريق العيادة" : "Add a practice team member";
  return (
    <FocusTrapDialog label={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <h2>{title}</h2>
        <p className="cc-meta">{ar ? "نرسل دعوة آمنة إلى بريد العمل. تبدأ العضوية معلّقة حتى تفعيلها." : "We send a secure invitation to their work email. Membership starts pending until it is activated."}</p>
        <ErrorNotice error={error} locale={locale} />
        {organizations.length > 1 && <Field label={ar ? "المؤسسة" : "Organization"} required error={touched && !org ? (ar ? "اختر مؤسسة." : "Choose an organization.") : undefined}><select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{ar ? "اختر مؤسسة" : "Choose an organization"}</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}</select></Field>}
        <Field label={ar ? "الدور" : "Role"} required><select value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{personRoleLabel(r, locale)}</option>)}</select></Field>
        <Field label={ar ? "الاسم الكامل" : "Full name"} required error={req(name)}><input autoComplete="name" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} aria-required /></Field>
        <Field label={ar ? "بريد العمل" : "Work email"} required error={touched && !/^\S+@\S+\.\S+$/.test(email) ? (ar ? "أدخل بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address.") : undefined}><input type="email" dir="ltr" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} aria-required /></Field>
        <Field label={ar ? "لغة الدعوة" : "Invitation language"} required><select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="en">English</option><option value="ar">العربية</option></select></Field>
        <Field label={ar ? "ملاحظة لسجل التدقيق" : "Note for the audit trail"} required error={req(reason)}><input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-required /></Field>
        <div className="cc-form-actions"><button disabled={busy}>{busy ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "إرسال الدعوة" : "Send invitation")}</button><button type="button" className="cc-secondary" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button></div>
      </form>
    </FocusTrapDialog>
  );
}

/** Links a practice manager / assistant to a consultant, or a supervising consultant to an associate doctor — `POST …/relationships`. */
export function RelationshipDialog({ locale, api, detail, member, onClose, onSaved }: { locale: Locale; api: AdminApi; detail: ProviderDetail; member: Member; onClose: () => void; onSaved: () => void }) {
  const ar = locale === "ar";
  const associate = member.roles.includes("ASSOCIATE_DOCTOR");
  const type = associate ? "SUPERVISES" : member.roles.includes("PRACTICE_MANAGER") ? "MANAGES" : "ASSISTS";
  const consultants = detail.members.filter((m) => m.roles.includes("CONSULTANT") && m.status !== "REVOKED" && m.subject !== member.subject);
  const [choice, setChoice] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const title = associate ? (ar ? "تعيين استشاري مشرف" : "Assign supervising consultant") : type === "MANAGES" ? (ar ? "إضافة استشاري يديره" : "Add a consultant they manage") : (ar ? "تعيين للمساعدة مع استشاري" : "Assign to assist a consultant");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); const consultant = consultants.find((c) => c.subject === choice); if (!consultant) return;
    setBusy(true); setError(null);
    try {
      const body = associate
        ? { subject: consultant.subject, type, targetPractitionerId: member.practitionerId, effectiveFrom: new Date().toISOString(), reason: title }
        : { subject: member.subject, type, targetPractitionerId: consultant.practitionerId, effectiveFrom: new Date().toISOString(), reason: title };
      await api(`/admin/providers/${detail.organization.id}/relationships`, { method: "POST", body }); onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <FocusTrapDialog label={title} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <p className="cc-meta">{personName(member, locale)}</p>
        <ErrorNotice error={error} locale={locale} />
        {consultants.length ? <Field label={ar ? "الاستشاري" : "Consultant"} required><select required value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">{ar ? "اختر استشاريًا" : "Choose a consultant"}</option>{consultants.map((c) => <option key={c.subject} value={c.subject}>{personName(c, locale)}</option>)}</select></Field>
          : <p className="cc-meta">{ar ? "لا يوجد استشاريون في هذه المؤسسة بعد." : "There are no consultants in this organization yet."}</p>}
        <div className="cc-form-actions"><button disabled={busy || !choice}>{ar ? "حفظ" : "Save"}</button><button type="button" className="cc-secondary" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button></div>
      </form>
    </FocusTrapDialog>
  );
}

/** What a person's relationships mean, in words: "Supervised by …", "Manages …", "Assists …". */
export function relationshipSummary(detail: ProviderDetail, member: Member, locale: Locale) {
  const ar = locale === "ar";
  const live = detail.relationships.filter((r) => r.status !== "REVOKED");
  const bySubject = (s: string) => detail.members.find((m) => m.subject === s);
  const byPractitioner = (p: string) => detail.members.find((m) => m.practitionerId === p);
  const names = (list: (Member | undefined)[]) => list.filter(Boolean).map((m) => personName(m!, locale)).join(ar ? "، " : ", ");
  const parts: string[] = [];
  const supervisors = live.filter((r) => r.type === "SUPERVISES" && r.targetPractitionerId === member.practitionerId).map((r) => bySubject(r.subject));
  if (supervisors.length) parts.push(`${relationshipLabel("SUPERVISES", locale)}: ${names(supervisors)}`);
  const manages = live.filter((r) => r.type === "MANAGES" && r.subject === member.subject).map((r) => byPractitioner(r.targetPractitionerId));
  if (manages.length) parts.push(`${ar ? "يدير" : "Manages"}: ${names(manages)}`);
  const assists = live.filter((r) => r.type === "ASSISTS" && r.subject === member.subject).map((r) => byPractitioner(r.targetPractitionerId));
  if (assists.length) parts.push(`${ar ? "يساعد" : "Assists"}: ${names(assists)}`);
  const supervises = live.filter((r) => r.type === "SUPERVISES" && r.subject === member.subject).map((r) => byPractitioner(r.targetPractitionerId));
  if (supervises.length) parts.push(`${ar ? "يشرف على" : "Supervises"}: ${names(supervises)}`);
  if (member.roles.includes("ASSOCIATE_DOCTOR") && !supervisors.length) parts.push(ar ? "بلا استشاري مشرف" : "No supervising consultant yet");
  return parts.join(" · ");
}

/** Row actions for one member, gated by the exact capability each backend call needs. */
export function memberActions(locale: Locale, access: ControlCenterAccess, detail: ProviderDetail, member: Member, handlers: { activate: () => void; deactivate: () => void; relate: () => void }): MenuAction[] {
  const ar = locale === "ar";
  const out: MenuAction[] = [];
  if (member.practitionerId && member.roles.some((r) => CLINICIAN_ROLES.includes(r))) out.push({ label: ar ? "فتح صفحة الطبيب" : "Open clinician page", onSelect: () => undefined, href: consultantHref(locale, detail.organization.id, member.practitionerId) });
  const relatable = member.roles.some((r) => ["ASSOCIATE_DOCTOR", "PRACTICE_MANAGER", "CONSULTANT_ASSISTANT"].includes(r));
  if (relatable && member.status !== "REVOKED" && access.can("provider.relationship.manage")) out.push({ label: member.roles.includes("ASSOCIATE_DOCTOR") ? (ar ? "تعيين استشاري مشرف" : "Assign supervising consultant") : member.roles.includes("PRACTICE_MANAGER") ? (ar ? "إضافة استشاري يديره" : "Add a managed consultant") : (ar ? "تعيين لاستشاري" : "Assign to a consultant"), onSelect: handlers.relate });
  if (member.status === "PENDING" && access.can("provider.member.invite")) out.push({ label: ar ? "تفعيل العضوية" : "Activate membership", onSelect: handlers.activate });
  if (member.status === "ACTIVE" && access.can("provider.member.deactivate")) out.push({ label: ar ? "إزالة من المؤسسة" : "Remove from organization", onSelect: handlers.deactivate, destructive: true });
  return out;
}

export function useMemberMutations(locale: Locale, api: AdminApi, onDone: () => Promise<void> | void) {
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState("");
  const setActive = async (orgId: string, m: Member, active: boolean) => {
    if (!active && !window.confirm(ar ? `إزالة ${personName(m, locale)} من المؤسسة؟ تنتهي علاقاته في العيادة أيضًا.` : `Remove ${personName(m, locale)} from the organization? Their practice relationships end too.`)) return;
    setBusy(true); setError(null); setNotice("");
    try {
      await api(`/admin/providers/${orgId}/members/${encodeURIComponent(m.subject)}/${active ? "activate" : "deactivate"}?revision=${m.revision}`, { method: "POST", body: { reason: active ? "Activated from control center" : "Deactivated from control center" } });
      setNotice(active ? (ar ? "أصبحت العضوية نشطة." : "Membership activated.") : (ar ? "أُزيل من المؤسسة." : "Removed from the organization.")); await onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return { busy, error, notice, setNotice, setActive };
}

/** Providers › Practice team: practice managers, consultant assistants and owners across the caller's organizations. */
export function PracticeTeam({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const directory = useProviderDirectory(access.can("provider.view"));
  const mutations = useMemberMutations(locale, api, directory.reload);
  const [inviting, setInviting] = useState(false); const [relating, setRelating] = useState<{ detail: ProviderDetail; member: Member } | null>(null);
  const [query, setQuery] = useState(""); const [role, setRole] = useState("");
  const title = ar ? "فريق العيادة" : "Practice team";
  const canInvite = access.can("provider.practice_staff.manage");
  const actions = canInvite ? <button type="button" onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden />{ar ? "إضافة عضو" : "Add team member"}</button> : undefined;
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="practiceTeam" crumbs={ccCrumbs(locale, { label: title })} title={title} intro={ar ? "مديرو العيادات ومساعدو الاستشاريين ومالكو المؤسسات، ومن يعملون معه." : "Practice managers, consultant assistants and organization owners — and who they work with."} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!access.can("provider.view")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى مقدمي الرعاية" : "You don't have access to providers"} />);
  if (directory.loading) return shell(<p role="status">{ar ? "جارٍ تحميل الفريق…" : "Loading team…"}</p>);
  if (directory.error) return shell(<ErrorNotice error={directory.error} locale={locale} action="load" onRetry={() => void directory.reload()} />);
  const staff = directory.people.filter((p) => p.roles.some((r) => PRACTICE_ROLES.includes(r)));
  const rows = staff.filter((p) => (!role || p.roles.includes(role)) && `${p.displayName ?? ""} ${p.organization.displayName}`.toLowerCase().includes(query.toLowerCase()));
  const detailOf = (orgId: string) => directory.details.find((d) => d.organization.id === orgId)!;
  const organizations = directory.details.map((d) => d.organization);
  return shell(
    <>
      <SuccessNotice>{mutations.notice || null}</SuccessNotice>
      <ErrorNotice error={mutations.error} locale={locale} />
      {!staff.length ? <EmptyState title={ar ? "لا يوجد أعضاء في فريق العيادة بعد" : "No practice team members yet"} body={ar ? "أضف مدير عيادة أو مساعد استشاري لدعم الاستشاريين." : "Add a practice manager or consultant assistant to support your consultants."} action={canInvite ? <button type="button" onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden />{ar ? "إضافة عضو" : "Add team member"}</button> : undefined} /> : <>
        <div className="cc-filterbar">
          <label>{ar ? "بحث" : "Search"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "الاسم أو المؤسسة" : "Name or organization"} /></label>
          <label>{ar ? "الدور" : "Role"}<select value={role} onChange={(e) => setRole(e.target.value)}><option value="">{ar ? "كل الأدوار" : "All roles"}</option>{PRACTICE_ROLES.map((r) => <option key={r} value={r}>{personRoleLabel(r, locale)}</option>)}</select></label>
        </div>
        {!rows.length ? <EmptyState title={ar ? "لا توجد نتائج مطابقة" : "Nobody matches these filters"} /> : (
          <ul className="cc-list" aria-label={title}>
            <li className="cc-list-head" aria-hidden><span>{ar ? "الشخص" : "Person"}</span><span>{ar ? "المؤسسة" : "Organization"}</span><span>{ar ? "العضوية" : "Membership"}</span><span /></li>
            {rows.map((p) => {
              const detail = detailOf(p.organization.id); const s = membershipStatusLabel(p.status, locale); const rel = relationshipSummary(detail, p, locale);
              return (
                <li key={p.organization.id + p.subject}>
                  <span><strong>{personName(p, locale)}</strong><span className="cc-row-sub">{p.roles.filter((r) => PRACTICE_ROLES.includes(r)).map((r) => personRoleLabel(r, locale)).join(" · ")}{rel ? ` — ${rel}` : ""}</span></span>
                  <span><Link href={ccHref(locale, `/providers/${p.organization.id}?tab=people`)}>{p.organization.displayName}</Link></span>
                  <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>
                  <span className="cc-row-actions"><ActionMenu label={(ar ? "إجراءات: " : "Actions: ") + personName(p, locale)} actions={memberActions(locale, access, detail, p, { activate: () => void mutations.setActive(p.organization.id, p, true), deactivate: () => void mutations.setActive(p.organization.id, p, false), relate: () => setRelating({ detail, member: p }) })} /></span>
                </li>
              );
            })}
          </ul>
        )}
      </>}
      {inviting && <InvitePersonDialog locale={locale} api={api} organizations={organizations} roles={PRACTICE_ROLES.filter((r) => access.can(invitePermission(r)))} onClose={() => setInviting(false)} onInvited={() => { setInviting(false); mutations.setNotice(ar ? "أُرسلت الدعوة." : "Invitation sent."); void directory.reload(); }} />}
      {relating && <RelationshipDialog locale={locale} api={api} detail={relating.detail} member={relating.member} onClose={() => setRelating(null)} onSaved={() => { setRelating(null); mutations.setNotice(ar ? "تم حفظ العلاقة." : "Relationship saved."); void directory.reload(); }} />}
    </>
  );
}
