"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { EmptyState, ErrorNotice, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import type { AdminApi } from "./admin-api";
import type { ControlCenterAccess } from "./control-center-access";
import { ActionDialog, WorkforcePage, json, useRead } from "./workforce-ui";
import {
  ASSIGNABLE_ROLES, functionLabel, lifecycleBadge, platformRoleLabel, when,
  type CatalogueFunction, type InvitationView, type Offboarding, type StaffDirectory, type StaffView, type StaffingRequest, type TeamMember, type WorkforcePerson, type WorkforceTeam,
} from "./workforce-model";

const STAFF = "/admin/platform-access/staff";
const t = (locale: Locale, en: string, ar: string) => (locale === "ar" ? ar : en);

// ---------------- People ----------------

type PeopleDialog =
  | { kind: "invite" } | { kind: "cancel"; invitation: InvitationView } | { kind: "resend"; person: StaffView }
  | { kind: "roles"; person: StaffView } | { kind: "disable"; person: StaffView } | { kind: "restore"; person: StaffView }
  | { kind: "offboard"; person: StaffView } | { kind: "complete"; person: StaffView };

/** Workforce › People: invitations, roles, sign-in access and offboarding. Reads need WORKFORCE_READ; changes WORKFORCE_ADMINISTER. */
export function PeoplePage({ locale }: { locale: Locale }) {
  const [dialog, setDialog] = useState<PeopleDialog | null>(null);
  return <WorkforcePage locale={locale} active="people" title={t(locale, "People", "الأشخاص")}
    intro={t(locale, "RehletShifaa staff: invitations, roles, sign-in access and offboarding.", "موظفو رحلة شفاء: الدعوات والأدوار والوصول وإنهاء الخدمة.")}
    allowed={(a) => a.can("WORKFORCE_READ")}
    actions={(a) => a.can("WORKFORCE_ADMINISTER") ? <button type="button" onClick={() => setDialog({ kind: "invite" })}><UserPlus size={16} aria-hidden />{t(locale, "Invite person", "دعوة شخص")}</button> : null}>
    {({ access, api }) => <People locale={locale} access={access} api={api} dialog={dialog} setDialog={setDialog} />}
  </WorkforcePage>;
}

function People({ locale, access, api, dialog, setDialog }: { locale: Locale; access: ControlCenterAccess; api: AdminApi; dialog: PeopleDialog | null; setDialog: (d: PeopleDialog | null) => void }) {
  const { data, error, reload } = useRead<StaffDirectory>(api, STAFF);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const manage = access.can("WORKFORCE_ADMINISTER");
  const done = (message: string) => { setDialog(null); setNotice(message); reload(); };
  if (error && !data) return <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />;
  if (!data) return <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p>;
  const q = query.trim().toLowerCase();
  const people = data.people.filter((p) => !q || `${p.name ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q));
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    {data.invitations.length > 0 && <Section id="invitations" title={t(locale, "Open invitations", "دعوات مفتوحة")}>
      <ul className="cc-list">{data.invitations.map((i) => <li key={i.id}>
        <span><strong><bdi>{i.name}</bdi></strong><span className="cc-row-sub"><bdi dir="ltr">{i.email}</bdi></span></span>
        <span>{i.roles.map((r) => platformRoleLabel(r, locale)).join(" · ")}</span>
        <span className="cc-meta">{t(locale, "Expires", "تنتهي")} {when(i.expiresAt, locale)}</span>
        <span className="cc-row-actions">{manage && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "cancel", invitation: i })}>{t(locale, "Cancel invitation", "إلغاء الدعوة")}</button>}</span>
      </li>)}</ul>
    </Section>}
    <Section id="people" title={t(locale, "Staff", "الموظفون")}>
      <div className="cc-filterbar" role="search"><label>{t(locale, "Search", "بحث")}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(locale, "Name or email", "الاسم أو البريد")} /></label></div>
      {!people.length ? <EmptyState title={t(locale, "No staff yet", "لا يوجد موظفون بعد")} /> : (
        <ul className="cc-cards">{people.map((p) => {
          const badge = lifecycleBadge(p.lifecycle, locale);
          return <li className="cc-card" key={p.subject}>
            <h3><bdi>{p.name ?? t(locale, "Name not recorded", "اسم غير مسجّل")}</bdi></h3>
            <p><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></p>
            {p.email && <p className="cc-meta"><bdi dir="ltr">{p.email}</bdi></p>}
            <p className="cc-meta">{t(locale, "Roles", "الأدوار")}: {p.roles.length ? p.roles.map((r) => platformRoleLabel(r, locale)).join(" · ") : t(locale, "None", "لا يوجد")}</p>
            <p className="cc-meta">{t(locale, "Last sign-in", "آخر دخول")}: {when(p.lastSignInAt, locale)}</p>
            {manage && <div className="cc-step-actions">
              {p.lifecycle === "INVITED" && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "resend", person: p })}>{t(locale, "Resend invitation", "إعادة إرسال الدعوة")}</button>}
              {(p.lifecycle === "ACTIVE" || p.lifecycle === "INVITED") && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "roles", person: p })}>{t(locale, "Change roles", "تغيير الأدوار")}</button>}
              {p.lifecycle === "ACTIVE" && <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "disable", person: p })}>{t(locale, "Disable sign-in", "تعطيل الدخول")}</button>}
              {p.lifecycle === "SIGNIN_DISABLED" && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "restore", person: p })}>{t(locale, "Restore sign-in", "استعادة الدخول")}</button>}
              {(p.lifecycle === "ACTIVE" || p.lifecycle === "SIGNIN_DISABLED") && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "offboard", person: p })}>{t(locale, "Start offboarding", "بدء إنهاء الخدمة")}</button>}
              {p.lifecycle === "OFFBOARDING" && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "complete", person: p })}>{t(locale, "Complete offboarding", "إكمال إنهاء الخدمة")}</button>}
            </div>}
          </li>;
        })}</ul>
      )}
    </Section>
    {dialog?.kind === "invite" && <InviteDialog locale={locale} api={api} onClose={() => setDialog(null)} onDone={() => done(t(locale, "Invitation sent.", "أُرسلت الدعوة."))} />}
    {dialog?.kind === "cancel" && <ActionDialog locale={locale} title={t(locale, `Cancel the invitation for ${dialog.invitation.name}?`, `إلغاء دعوة ${dialog.invitation.name}؟`)} confirm={t(locale, "Cancel invitation", "إلغاء الدعوة")} danger onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${STAFF}/invitations/${dialog.invitation.id}/cancel`, json("POST", { revision: dialog.invitation.revision, reason })); done(t(locale, "Invitation cancelled.", "أُلغيت الدعوة.")); }} />}
    {dialog?.kind === "resend" && <ActionDialog locale={locale} title={t(locale, "Resend the invitation?", "إعادة إرسال الدعوة؟")} confirm={t(locale, "Resend", "إعادة الإرسال")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${STAFF}/${encodeURIComponent(dialog.person.subject)}/resend-invitation`, json("POST", { revision: dialog.person.revision, reason })); done(t(locale, "Invitation resent.", "أُعيد إرسال الدعوة.")); }} />}
    {dialog?.kind === "roles" && <RolesDialog locale={locale} api={api} person={dialog.person} onClose={() => setDialog(null)} onDone={() => done(t(locale, "Roles updated.", "حُدّثت الأدوار."))} />}
    {dialog?.kind === "disable" && <ActionDialog locale={locale} title={t(locale, "Disable sign-in?", "تعطيل الدخول؟")} confirm={t(locale, "Disable sign-in", "تعطيل الدخول")} danger onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${STAFF}/${encodeURIComponent(dialog.person.subject)}/disable`, json("POST", { revision: dialog.person.revision, reason })); done(t(locale, "Sign-in disabled and sessions ended.", "عُطّل الدخول وأُنهيت الجلسات.")); }}>
      <p>{t(locale, "The person is signed out everywhere and cannot sign in until restored. Their roles are kept.", "يُسجَّل خروج الشخص من كل مكان ولا يمكنه الدخول حتى الاستعادة. تبقى أدواره كما هي.")}</p>
    </ActionDialog>}
    {dialog?.kind === "restore" && <ActionDialog locale={locale} title={t(locale, "Restore sign-in?", "استعادة الدخول؟")} confirm={t(locale, "Restore", "استعادة")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${STAFF}/${encodeURIComponent(dialog.person.subject)}/restore`, json("POST", { revision: dialog.person.revision, reason })); done(t(locale, "Sign-in restored.", "استُعيد الدخول.")); }} />}
    {dialog?.kind === "offboard" && <ActionDialog locale={locale} title={t(locale, "Start offboarding?", "بدء إنهاء الخدمة؟")} confirm={t(locale, "Start offboarding", "بدء إنهاء الخدمة")} danger onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${STAFF}/${encodeURIComponent(dialog.person.subject)}/offboarding`, json("POST", { revision: dialog.person.revision, reason })); done(t(locale, "Offboarding started. Sign-in is disabled; hand over their open work, then complete it.", "بدأ إنهاء الخدمة. عُطّل الدخول؛ سلّم عمله المفتوح ثم أكمل الإجراء.")); }} />}
    {dialog?.kind === "complete" && <CompleteOffboarding locale={locale} api={api} person={dialog.person} onClose={() => setDialog(null)} onDone={() => done(t(locale, "Offboarding completed. All roles and team places ended.", "اكتمل إنهاء الخدمة. انتهت كل الأدوار والعضويات."))} />}
  </>;
}

function RoleChoices({ locale, value, onChange }: { locale: Locale; value: string[]; onChange: (roles: string[]) => void }) {
  return <fieldset className="cc-choices"><legend className="cc-field-label">{t(locale, "Roles", "الأدوار")}</legend>
    <span className="cc-field-hint">{t(locale, "The Compliance and Audit Reviewer cannot hold any other role; Support cannot also be a System Administrator.", "لا يمكن لمراجع الامتثال والتدقيق أن يحمل أي دور آخر؛ ولا يمكن للدعم أن يكون مسؤول نظام.")}</span>
    {ASSIGNABLE_ROLES.map((role) => <label key={role} className="cc-choice"><input type="checkbox" checked={value.includes(role)} onChange={() => onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role])} /><span>{platformRoleLabel(role, locale)}</span></label>)}
  </fieldset>;
}

function InviteDialog({ locale, api, onClose, onDone }: { locale: Locale; api: AdminApi; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", language: locale as string });
  const [roles, setRoles] = useState<string[]>([]);
  const ok = form.name.trim() && /^\S+@\S+\.\S+$/.test(form.email.trim()) && roles.length > 0;
  return <ActionDialog locale={locale} title={t(locale, "Invite a person", "دعوة شخص")} confirm={t(locale, "Send invitation", "إرسال الدعوة")} onClose={onClose}
    onSubmit={async (reason) => { if (!ok) throw new Error(t(locale, "Enter a name, a valid email and at least one role.", "أدخل الاسم وبريدًا صحيحًا ودورًا واحدًا على الأقل.")); await api(`${STAFF}/invitations`, json("POST", { name: form.name.trim(), email: form.email.trim(), locale: form.language, roles, reason })); onDone(); }}>
    <Field label={t(locale, "Full name", "الاسم الكامل")} required><input maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
    <Field label={t(locale, "Work email", "بريد العمل")} required><input type="email" dir="ltr" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
    <Field label={t(locale, "Invitation language", "لغة الدعوة")}><select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}><option value="en">English</option><option value="ar">العربية</option></select></Field>
    <RoleChoices locale={locale} value={roles} onChange={setRoles} />
  </ActionDialog>;
}

function RolesDialog({ locale, api, person, onClose, onDone }: { locale: Locale; api: AdminApi; person: StaffView; onClose: () => void; onDone: () => void }) {
  const current = person.roles.filter((r) => r !== "SYSTEM_ADMINISTRATOR");
  const [roles, setRoles] = useState<string[]>(current);
  const grant = roles.filter((r) => !current.includes(r)), revoke = current.filter((r) => !roles.includes(r));
  return <ActionDialog locale={locale} title={t(locale, `Roles of ${person.name ?? ""}`, `أدوار ${person.name ?? ""}`)} confirm={t(locale, "Save roles", "حفظ الأدوار")} onClose={onClose}
    onSubmit={async (reason) => { await api(`${STAFF}/${encodeURIComponent(person.subject)}/job`, json("POST", { revision: person.revision, grant, revoke, reason })); onDone(); }}>
    <RoleChoices locale={locale} value={roles} onChange={setRoles} />
    {person.roles.includes("SYSTEM_ADMINISTRATOR") && <p className="cc-meta">{t(locale, "System Administrator is changed under Administrators (two-person approval).", "يُغيَّر دور مسؤول النظام من صفحة مسؤولي النظام (بموافقة شخصين).")}</p>}
  </ActionDialog>;
}

function CompleteOffboarding({ locale, api, person, onClose, onDone }: { locale: Locale; api: AdminApi; person: StaffView; onClose: () => void; onDone: () => void }) {
  const { data, error } = useRead<Offboarding>(api, `${STAFF}/${encodeURIComponent(person.subject)}/offboarding`);
  const blocked = !!data?.blockers.length;
  return <ActionDialog locale={locale} title={t(locale, "Complete offboarding?", "إكمال إنهاء الخدمة؟")} confirm={t(locale, "Complete offboarding", "إكمال إنهاء الخدمة")} danger onClose={onClose}
    onSubmit={async (reason) => { await api(`${STAFF}/${encodeURIComponent(person.subject)}/offboarding/complete`, json("POST", { revision: person.revision, reason })); onDone(); }}>
    <ErrorNotice error={error} locale={locale} action="load" />
    {!data ? <p role="status">{t(locale, "Checking open work…", "جارٍ التحقق من العمل المفتوح…")}</p> : blocked ? <>
      <p>{t(locale, "Hand over this work first:", "سلّم هذا العمل أولًا:")}</p>
      <ul className="cc-checklist">{data.blockers.map((b) => <li key={b.code}>{b.detail} ({b.count})</li>)}</ul>
    </> : <p>{t(locale, "No open work remains. Every role, team place and reporting line ends now.", "لا يوجد عمل مفتوح. تنتهي الآن كل الأدوار والعضويات وخطوط الإشراف.")}</p>}
  </ActionDialog>;
}

// ---------------- Teams ----------------

type TeamDialog =
  | { kind: "create" } | { kind: "retire"; team: WorkforceTeam } | { kind: "add"; team: WorkforceTeam }
  | { kind: "remove"; team: WorkforceTeam; member: TeamMember } | { kind: "lead"; team: WorkforceTeam; member: TeamMember }
  | { kind: "unlead"; team: WorkforceTeam; member: TeamMember } | { kind: "manager"; team: WorkforceTeam; member: TeamMember }
  | { kind: "unmanage"; team: WorkforceTeam; member: TeamMember };

/** Workforce › Teams: teams, leads and reporting lines per function. A function's manager (TEAM_MANAGE) changes its teams. */
export function TeamsPage({ locale }: { locale: Locale }) {
  const [dialog, setDialog] = useState<TeamDialog | null>(null);
  return <WorkforcePage locale={locale} active="teams" title={t(locale, "Teams", "الفرق")}
    intro={t(locale, "Teams, team leads and reporting lines for each function. Leads supervise their team's work.", "الفرق وقادتها وخطوط الإشراف لكل وظيفة. يشرف القادة على عمل فرقهم.")}
    allowed={(a) => a.canAny(["WORKFORCE_READ", "TEAM_MANAGE"])}
    actions={(a) => (a.me?.managedFunctions.length ?? 0) > 0 ? <button type="button" onClick={() => setDialog({ kind: "create" })}>{t(locale, "New team", "فريق جديد")}</button> : null}>
    {({ access, api }) => <Teams locale={locale} access={access} api={api} dialog={dialog} setDialog={setDialog} />}
  </WorkforcePage>;
}

function Teams({ locale, access, api, dialog, setDialog }: { locale: Locale; access: ControlCenterAccess; api: AdminApi; dialog: TeamDialog | null; setDialog: (d: TeamDialog | null) => void }) {
  const teams = useRead<WorkforceTeam[]>(api, "/admin/workforce/teams");
  const people = useRead<WorkforcePerson[]>(api, "/admin/workforce/people");
  const catalogue = useRead<CatalogueFunction[]>(api, "/admin/workforce/catalogue");
  const [notice, setNotice] = useState("");
  const managed = access.me?.managedFunctions ?? [];
  const done = (message: string) => { setDialog(null); setNotice(message); teams.reload(); };
  if (teams.error && !teams.data) return <ErrorNotice error={teams.error} locale={locale} action="load" onRetry={teams.reload} />;
  if (!teams.data) return <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p>;
  const name = (subject: string | null) => (subject ? people.data?.find((p) => p.subject === subject)?.displayName ?? t(locale, "Name not recorded", "اسم غير مسجّل") : "—");
  const functions = [...new Set(teams.data.map((x) => x.function))].sort();
  const functionRoles = (fn: string) => catalogue.data?.find((f) => f.key === fn)?.roles.map((r) => r.key) ?? [];
  const eligible = (team: WorkforceTeam) => (people.data ?? []).filter((p) => p.lifecycleStatus === "ACTIVE" && p.roles.some((r) => functionRoles(team.function).includes(r)) && !team.members.some((m) => m.subject === p.subject));
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    {!functions.length ? <EmptyState title={t(locale, "No teams yet", "لا توجد فرق بعد")} body={managed.length ? t(locale, "Create the first team for a function you manage.", "أنشئ أول فريق لوظيفة تديرها.") : undefined} /> :
      functions.map((fn) => <Section key={fn} id={`fn-${fn}`} title={functionLabel(fn, locale)}>
        <ul className="cc-stepper">{teams.data!.filter((x) => x.function === fn).map((team) => {
          const canManage = managed.includes(team.function) && team.status === "ACTIVE";
          return <li className="cc-step" key={team.id}>
            <div className="cc-step-head"><h3><bdi>{team.name}</bdi></h3><StatusBadge tone={team.status === "ACTIVE" ? "success" : "neutral"}>{team.status === "ACTIVE" ? t(locale, "Active", "نشط") : t(locale, "Retired", "متقاعد")}</StatusBadge></div>
            {!team.members.length ? <p className="cc-meta">{t(locale, "No members yet.", "لا يوجد أعضاء بعد.")}</p> : (
              <ul className="cc-checklist">{team.members.map((m) => <li key={m.membershipId}>
                <span style={{ flex: 1 }}><bdi>{m.displayName ?? t(locale, "Name not recorded", "اسم غير مسجّل")}</bdi>{m.lead ? ` · ${t(locale, "Team lead", "قائد الفريق")}` : ""}
                  <span className="cc-row-sub">{t(locale, "Reports to", "يتبع")}: <bdi>{name(m.managerSubject)}</bdi></span></span>
                {canManage && <span className="cc-row-actions">
                  {m.lead ? <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "unlead", team, member: m })}>{t(locale, "End lead", "إنهاء القيادة")}</button>
                    : <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "lead", team, member: m })}>{t(locale, "Make lead", "تعيين قائدًا")}</button>}
                  <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "manager", team, member: m })}>{t(locale, "Set manager", "تحديد المدير")}</button>
                  {m.managerSubject && <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "unmanage", team, member: m })}>{t(locale, "End reporting line", "إنهاء خط الإشراف")}</button>}
                  <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "remove", team, member: m })}>{t(locale, "Remove", "إزالة")}</button>
                </span>}
              </li>)}</ul>
            )}
            {canManage && <div className="cc-step-actions">
              <button type="button" className="cc-secondary" onClick={() => setDialog({ kind: "add", team })}>{t(locale, "Add member", "إضافة عضو")}</button>
              <button type="button" className="cc-secondary" onClick={() => setDialog({ kind: "retire", team })}>{t(locale, "Retire team", "إيقاف الفريق")}</button>
            </div>}
          </li>;
        })}</ul>
      </Section>)}
    {dialog?.kind === "create" && <CreateTeam locale={locale} api={api} functions={managed} onClose={() => setDialog(null)} onDone={() => done(t(locale, "Team created.", "أُنشئ الفريق."))} />}
    {dialog?.kind === "retire" && <ActionDialog locale={locale} title={t(locale, `Retire ${dialog.team.name}?`, `إيقاف ${dialog.team.name}؟`)} confirm={t(locale, "Retire team", "إيقاف الفريق")} danger onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`/admin/workforce/teams/${dialog.team.id}/retire`, json("POST", { revision: dialog.team.revision, reason })); done(t(locale, "Team retired.", "أُوقف الفريق.")); }} />}
    {dialog?.kind === "add" && <AddMember locale={locale} api={api} team={dialog.team} candidates={eligible(dialog.team)} onClose={() => setDialog(null)} onDone={() => done(t(locale, "Member added.", "أُضيف العضو."))} />}
    {dialog?.kind === "remove" && <ActionDialog locale={locale} title={t(locale, "Remove from team?", "إزالة من الفريق؟")} confirm={t(locale, "Remove", "إزالة")} danger onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`/admin/workforce/memberships/${dialog.member.membershipId}/end`, json("POST", { revision: dialog.member.membershipRevision, reason })); done(t(locale, "Membership ended.", "انتهت العضوية.")); }} />}
    {dialog?.kind === "lead" && <ActionDialog locale={locale} title={t(locale, "Make team lead?", "تعيين قائدًا للفريق؟")} confirm={t(locale, "Make lead", "تعيين قائدًا")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`/admin/workforce/teams/${dialog.team.id}/leads`, json("POST", { subject: dialog.member.subject, reason })); done(t(locale, "Team lead designated.", "عُيّن قائد الفريق.")); }}>
      <p>{t(locale, "A team lead supervises their team members' case work.", "يشرف قائد الفريق على عمل أعضاء فريقه في الحالات.")}</p>
    </ActionDialog>}
    {dialog?.kind === "unlead" && <ActionDialog locale={locale} title={t(locale, "End team lead?", "إنهاء قيادة الفريق؟")} confirm={t(locale, "End lead", "إنهاء القيادة")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`/admin/workforce/leads/${dialog.member.leadId}/end`, json("POST", { revision: dialog.member.leadRevision, reason })); done(t(locale, "Team lead ended.", "انتهت القيادة.")); }} />}
    {dialog?.kind === "manager" && <SetManager locale={locale} api={api} team={dialog.team} member={dialog.member} candidates={(people.data ?? []).filter((p) => p.lifecycleStatus === "ACTIVE" && p.subject !== dialog.member.subject)} onClose={() => setDialog(null)} onDone={() => done(t(locale, "Reporting line set.", "حُدّد خط الإشراف."))} />}
    {dialog?.kind === "unmanage" && <ActionDialog locale={locale} title={t(locale, "End reporting line?", "إنهاء خط الإشراف؟")} confirm={t(locale, "End reporting line", "إنهاء خط الإشراف")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api("/admin/workforce/reporting-lines/end", json("POST", { function: dialog.team.function, staffSubject: dialog.member.subject, revision: dialog.member.managerRevision, reason })); done(t(locale, "Reporting line ended.", "انتهى خط الإشراف.")); }} />}
  </>;
}

function CreateTeam({ locale, api, functions, onClose, onDone }: { locale: Locale; api: AdminApi; functions: string[]; onClose: () => void; onDone: () => void }) {
  const [fn, setFn] = useState(functions[0] ?? ""); const [name, setName] = useState("");
  return <ActionDialog locale={locale} title={t(locale, "New team", "فريق جديد")} confirm={t(locale, "Create team", "إنشاء الفريق")} onClose={onClose}
    onSubmit={async (reason) => { await api("/admin/workforce/teams", json("POST", { function: fn, name: name.trim(), reason })); onDone(); }}>
    <Field label={t(locale, "Function", "الوظيفة")} required><select value={fn} onChange={(e) => setFn(e.target.value)}>{functions.map((f) => <option key={f} value={f}>{functionLabel(f, locale)}</option>)}</select></Field>
    <Field label={t(locale, "Team name", "اسم الفريق")} required><input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></Field>
  </ActionDialog>;
}

function AddMember({ locale, api, team, candidates, onClose, onDone }: { locale: Locale; api: AdminApi; team: WorkforceTeam; candidates: WorkforcePerson[]; onClose: () => void; onDone: () => void }) {
  const [subject, setSubject] = useState("");
  return <ActionDialog locale={locale} title={t(locale, `Add a member to ${team.name}`, `إضافة عضو إلى ${team.name}`)} confirm={t(locale, "Add member", "إضافة عضو")} onClose={onClose}
    onSubmit={async (reason) => { await api(`/admin/workforce/teams/${team.id}/members`, json("POST", { subject, reason })); onDone(); }}>
    {!candidates.length ? <p className="cc-empty">{t(locale, "Nobody else holds a role in this function.", "لا يوجد غيرهم ممن يحمل دورًا في هذه الوظيفة.")}</p> :
      <Field label={t(locale, "Person", "الشخص")} required><select required value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">{t(locale, "Choose a person", "اختر شخصًا")}</option>{candidates.map((p) => <option key={p.subject} value={p.subject}>{p.displayName ?? p.subject}</option>)}</select></Field>}
  </ActionDialog>;
}

function SetManager({ locale, api, team, member, candidates, onClose, onDone }: { locale: Locale; api: AdminApi; team: WorkforceTeam; member: TeamMember; candidates: WorkforcePerson[]; onClose: () => void; onDone: () => void }) {
  const [manager, setManager] = useState(member.managerSubject ?? "");
  return <ActionDialog locale={locale} title={t(locale, `Who does ${member.displayName ?? ""} report to?`, `لمن يتبع ${member.displayName ?? ""}؟`)} confirm={t(locale, "Set manager", "تحديد المدير")} onClose={onClose}
    onSubmit={async (reason) => { await api("/admin/workforce/reporting-lines", json("POST", { function: team.function, staffSubject: member.subject, managerSubject: manager, reason })); onDone(); }}>
    <Field label={t(locale, "Manager", "المدير")} required><select required value={manager} onChange={(e) => setManager(e.target.value)}><option value="">{t(locale, "Choose a manager", "اختر مديرًا")}</option>{candidates.map((p) => <option key={p.subject} value={p.subject}>{p.displayName ?? p.subject}</option>)}</select></Field>
  </ActionDialog>;
}

// ---------------- Staffing requests ----------------

const REQUEST_TYPES: [string, string, string][] = [["NEW_HIRE", "New hire", "تعيين جديد"], ["JOB_CHANGE", "Job change", "تغيير وظيفة"], ["TEAM_MOVE", "Team move", "نقل فريق"], ["REMOVAL", "Removal", "إنهاء"]];
const typeLabel = (type: string, locale: Locale) => { const hit = REQUEST_TYPES.find(([k]) => k === type); return hit ? hit[locale === "ar" ? 2 : 1] : type; };

/** Workforce › Staffing Requests: function managers request (STAFFING_REQUEST); a System Administrator executes or rejects (WORKFORCE_ADMINISTER). */
export function StaffingRequestsPage({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  return <WorkforcePage locale={locale} active="staffing" title={t(locale, "Staffing Requests", "طلبات التوظيف")}
    intro={t(locale, "Function managers ask for staffing changes; a System Administrator executes or rejects each one.", "يطلب مديرو الوظائف تغييرات التوظيف؛ وينفذها مسؤول النظام أو يرفضها.")}
    allowed={(a) => a.canAny(["STAFFING_REQUEST", "WORKFORCE_ADMINISTER"])}
    actions={(a) => a.can("STAFFING_REQUEST") ? <button type="button" onClick={() => setOpen(true)}>{t(locale, "New request", "طلب جديد")}</button> : null}>
    {({ access, api }) => <StaffingRequests locale={locale} access={access} api={api} open={open} setOpen={setOpen} />}
  </WorkforcePage>;
}

function StaffingRequests({ locale, access, api, open, setOpen }: { locale: Locale; access: ControlCenterAccess; api: AdminApi; open: boolean; setOpen: (v: boolean) => void }) {
  const { data, error, reload } = useRead<StaffingRequest[]>(api, "/admin/platform-access/staffing-requests");
  const [deciding, setDeciding] = useState<{ request: StaffingRequest; outcome: "EXECUTED" | "REJECTED" } | null>(null);
  const [notice, setNotice] = useState("");
  const [submission, setSubmission] = useState({ function: access.me?.managedFunctions[0] ?? "", type: "NEW_HIRE", details: "" });
  const [reference, setReference] = useState("");
  const decide = access.can("WORKFORCE_ADMINISTER");
  if (error && !data) return <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />;
  if (!data) return <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p>;
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    {!data.length ? <EmptyState title={t(locale, "No staffing requests", "لا توجد طلبات توظيف")} /> : (
      <ul className="cc-cards">{data.map((r) => <li className="cc-card" key={r.id}>
        <h3>{typeLabel(r.type, locale)} · {functionLabel(r.function, locale)}</h3>
        <p><StatusBadge tone={r.status === "SUBMITTED" ? "warning" : r.status === "EXECUTED" ? "success" : "neutral"}>{r.status === "SUBMITTED" ? t(locale, "Waiting for a decision", "بانتظار قرار") : r.status === "EXECUTED" ? t(locale, "Executed", "نُفّذ") : r.status === "REJECTED" ? t(locale, "Rejected", "رُفض") : r.status}</StatusBadge></p>
        <p>{r.details}</p>
        <p className="cc-meta">{t(locale, "Requested", "طُلب")} {when(r.requestedAt, locale)}</p>
        {r.decisionReason && <p className="cc-meta">{t(locale, "Decision", "القرار")}: {r.decisionReason}</p>}
        {decide && r.status === "SUBMITTED" && <div className="cc-step-actions">
          <button type="button" className="cc-small" onClick={() => setDeciding({ request: r, outcome: "EXECUTED" })}>{t(locale, "Mark executed", "تأكيد التنفيذ")}</button>
          <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDeciding({ request: r, outcome: "REJECTED" })}>{t(locale, "Reject", "رفض")}</button>
        </div>}
      </li>)}</ul>
    )}
    {open && <ActionDialog locale={locale} title={t(locale, "New staffing request", "طلب توظيف جديد")} confirm={t(locale, "Submit request", "إرسال الطلب")} needsReason={false} onClose={() => setOpen(false)}
      onSubmit={async () => { await api("/admin/platform-access/staffing-requests", json("POST", { function: submission.function, type: submission.type, subject: null, details: submission.details.trim() })); setOpen(false); setNotice(t(locale, "Request submitted.", "أُرسل الطلب.")); reload(); }}>
      <Field label={t(locale, "Function", "الوظيفة")} required><select value={submission.function} onChange={(e) => setSubmission({ ...submission, function: e.target.value })}>{(access.me?.managedFunctions ?? []).map((f) => <option key={f} value={f}>{functionLabel(f, locale)}</option>)}</select></Field>
      <Field label={t(locale, "Request", "الطلب")} required><select value={submission.type} onChange={(e) => setSubmission({ ...submission, type: e.target.value })}>{REQUEST_TYPES.map(([k]) => <option key={k} value={k}>{typeLabel(k, locale)}</option>)}</select></Field>
      <Field label={t(locale, "Details", "التفاصيل")} required><textarea required maxLength={2000} value={submission.details} onChange={(e) => setSubmission({ ...submission, details: e.target.value })} /></Field>
    </ActionDialog>}
    {deciding && <ActionDialog locale={locale} title={deciding.outcome === "EXECUTED" ? t(locale, "Mark as executed?", "تأكيد التنفيذ؟") : t(locale, "Reject the request?", "رفض الطلب؟")} confirm={deciding.outcome === "EXECUTED" ? t(locale, "Mark executed", "تأكيد التنفيذ") : t(locale, "Reject", "رفض")} danger={deciding.outcome === "REJECTED"} onClose={() => setDeciding(null)}
      onSubmit={async (reason) => { await api(`/admin/platform-access/staffing-requests/${deciding.request.id}/decision`, json("POST", { revision: deciding.request.revision, outcome: deciding.outcome, reason, executionReference: reference.trim() || null })); setDeciding(null); setReference(""); setNotice(t(locale, "Decision recorded.", "سُجّل القرار.")); reload(); }}>
      {deciding.outcome === "EXECUTED" && <Field label={t(locale, "Execution reference", "مرجع التنفيذ")} hint={t(locale, "For example the invitation or role change made for it.", "مثل الدعوة أو تغيير الدور الذي نُفّذ له.")}><input maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
    </ActionDialog>}
  </>;
}
