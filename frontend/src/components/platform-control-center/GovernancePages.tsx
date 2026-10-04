"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { EmptyState, ErrorNotice, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import type { AdminApi } from "./admin-api";
import type { ControlCenterAccess } from "./control-center-access";
import { ActionDialog, WorkforcePage, json, useRead } from "./workforce-ui";
import {
  lifecycleBadge, platformRoleLabel, when,
  type AdministratorAssignment, type AuditEntry, type Campaign, type CampaignItem, type ChangeRequest, type MfaReset, type ServiceAccount, type StaffDirectory, type SupportView,
} from "./workforce-model";

const ADMIN = "/admin/platform-access";
const t = (locale: Locale, en: string, ar: string) => (locale === "ar" ? ar : en);
const toIso = (date: string) => (date ? new Date(`${date}T00:00:00`).toISOString() : null);

// ---------------- Administrators ----------------

type Overview = { administrators: AdministratorAssignment[]; requests: ChangeRequest[] };

/** Access › Administrators (ACCESS_GOVERN): System Administrator appointments and removals, each approved by a second administrator. */
export function AdministratorsPage({ locale }: { locale: Locale }) {
  const [requesting, setRequesting] = useState(false);
  return <WorkforcePage locale={locale} active="administrators" title={t(locale, "Administrators", "مسؤولو النظام")}
    intro={t(locale, "Every System Administrator change needs a second administrator's approval. The last administrator can never be removed.", "كل تغيير في مسؤولي النظام يحتاج إلى موافقة مسؤول ثانٍ. لا يمكن إزالة آخر مسؤول.")}
    allowed={(a) => a.can("ACCESS_GOVERN")}
    actions={() => <button type="button" onClick={() => setRequesting(true)}>{t(locale, "Request appointment", "طلب تعيين")}</button>}>
    {({ access, api }) => <Administrators locale={locale} access={access} api={api} requesting={requesting} setRequesting={setRequesting} />}
  </WorkforcePage>;
}

function Administrators({ locale, access, api, requesting, setRequesting }: { locale: Locale; access: ControlCenterAccess; api: AdminApi; requesting: boolean; setRequesting: (v: boolean) => void }) {
  const overview = useRead<Overview>(api, `${ADMIN}/administrator-changes`);
  const staff = useRead<StaffDirectory>(api, `${ADMIN}/staff`);
  const [dialog, setDialog] = useState<{ kind: "remove"; admin: AdministratorAssignment } | { kind: "approve" | "reject"; request: ChangeRequest } | null>(null);
  const [notice, setNotice] = useState("");
  const [appoint, setAppoint] = useState({ subject: "", from: new Date().toISOString().slice(0, 10), to: "" });
  const [removeOn, setRemoveOn] = useState(new Date().toISOString().slice(0, 10));
  const me = access.me?.subject;
  const done = (message: string) => { setDialog(null); setRequesting(false); setNotice(message); overview.reload(); };
  const name = (subject: string) => staff.data?.people.find((p) => p.subject === subject)?.name ?? t(locale, "Name not recorded", "اسم غير مسجّل");
  if (overview.error && !overview.data) return <ErrorNotice error={overview.error} locale={locale} action="load" onRetry={overview.reload} />;
  if (!overview.data) return <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p>;
  const pending = overview.data.requests.filter((r) => r.status === "PENDING");
  const decided = overview.data.requests.filter((r) => r.status !== "PENDING");
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <Section id="admins" title={t(locale, "System Administrators", "مسؤولو النظام")}>
      <ul className="cc-list">{overview.data.administrators.map((a) => <li key={a.id}>
        <span><strong><bdi>{name(a.subject)}</bdi></strong></span>
        <span className="cc-meta">{t(locale, "From", "من")} {when(a.effectiveFrom, locale)}{a.effectiveTo ? ` · ${t(locale, "until", "حتى")} ${when(a.effectiveTo, locale)}` : ""}</span>
        <span className="cc-row-actions"><button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "remove", admin: a })}>{t(locale, "Request removal", "طلب إزالة")}</button></span>
      </li>)}</ul>
    </Section>
    <Section id="pending" title={t(locale, "Waiting for a second approval", "بانتظار موافقة ثانية")}>
      {!pending.length ? <EmptyState title={t(locale, "Nothing is waiting.", "لا يوجد ما ينتظر.")} /> : <ul className="cc-cards">{pending.map((r) => <li className="cc-card" key={r.id}>
        <h3>{r.type === "APPOINT" ? t(locale, "Appoint", "تعيين") : t(locale, "Remove", "إزالة")} · <bdi>{name(r.subject)}</bdi></h3>
        <p className="cc-meta">{t(locale, "Effective", "يسري")} {when(r.effectiveFrom, locale)} · {t(locale, "Expires", "ينتهي الطلب")} {when(r.expiresAt, locale)}</p>
        <p className="cc-meta">{t(locale, "Requested by", "طلبه")} <bdi>{name(r.requestedBy)}</bdi></p>
        {r.requestedBy === me ? <p className="cc-meta">{t(locale, "Another administrator must decide your request.", "يجب أن يقرر طلبك مسؤول آخر.")}</p> : <div className="cc-step-actions">
          <button type="button" className="cc-small" onClick={() => setDialog({ kind: "approve", request: r })}>{t(locale, "Approve", "موافقة")}</button>
          <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "reject", request: r })}>{t(locale, "Reject", "رفض")}</button>
        </div>}
      </li>)}</ul>}
    </Section>
    {decided.length > 0 && <Section id="decided" title={t(locale, "Recent decisions", "القرارات الأخيرة")}>
      <ul className="cc-list">{decided.map((r) => <li key={r.id}><span>{r.type === "APPOINT" ? t(locale, "Appoint", "تعيين") : t(locale, "Remove", "إزالة")} · <bdi>{name(r.subject)}</bdi></span><span><StatusBadge tone={r.status === "APPROVED" ? "success" : "neutral"}>{r.status}</StatusBadge></span></li>)}</ul>
    </Section>}
    {requesting && <ActionDialog locale={locale} title={t(locale, "Request a System Administrator appointment", "طلب تعيين مسؤول نظام")} confirm={t(locale, "Submit for approval", "إرسال للموافقة")} onClose={() => setRequesting(false)}
      onSubmit={async (reason) => { await api(`${ADMIN}/administrator-changes`, json("POST", { type: "APPOINT", subject: appoint.subject, effectiveFrom: toIso(appoint.from), effectiveTo: toIso(appoint.to), reason })); done(t(locale, "Request submitted for a second approval.", "أُرسل الطلب لموافقة ثانية.")); }}>
      <Field label={t(locale, "Person", "الشخص")} hint={t(locale, "An active staff member enrolled in MFA.", "موظف نشط مسجّل في التحقق متعدد العوامل.")} required><select required value={appoint.subject} onChange={(e) => setAppoint({ ...appoint, subject: e.target.value })}><option value="">{t(locale, "Choose a person", "اختر شخصًا")}</option>{(staff.data?.people ?? []).filter((p) => p.lifecycle === "ACTIVE").map((p) => <option key={p.subject} value={p.subject}>{p.name ?? p.subject}</option>)}</select></Field>
      <Field label={t(locale, "From", "من")} required><input type="date" required dir="ltr" value={appoint.from} onChange={(e) => setAppoint({ ...appoint, from: e.target.value })} /></Field>
      <Field label={t(locale, "Until (optional)", "حتى (اختياري)")}><input type="date" dir="ltr" value={appoint.to} onChange={(e) => setAppoint({ ...appoint, to: e.target.value })} /></Field>
    </ActionDialog>}
    {dialog?.kind === "remove" && <ActionDialog locale={locale} title={t(locale, `Request removal of ${name(dialog.admin.subject)}?`, `طلب إزالة ${name(dialog.admin.subject)}؟`)} confirm={t(locale, "Submit for approval", "إرسال للموافقة")} danger onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${ADMIN}/administrator-changes`, json("POST", { type: "REMOVE", subject: dialog.admin.subject, effectiveFrom: toIso(removeOn), effectiveTo: null, reason })); done(t(locale, "Removal submitted for a second approval.", "أُرسلت الإزالة لموافقة ثانية.")); }}>
      <Field label={t(locale, "Removal date", "تاريخ الإزالة")} required><input type="date" required dir="ltr" value={removeOn} onChange={(e) => setRemoveOn(e.target.value)} /></Field>
    </ActionDialog>}
    {(dialog?.kind === "approve" || dialog?.kind === "reject") && <ActionDialog locale={locale} title={dialog.kind === "approve" ? t(locale, "Approve this change?", "الموافقة على هذا التغيير؟") : t(locale, "Reject this change?", "رفض هذا التغيير؟")} confirm={dialog.kind === "approve" ? t(locale, "Approve", "موافقة") : t(locale, "Reject", "رفض")} danger={dialog.kind === "reject"} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${ADMIN}/administrator-changes/${dialog.request.id}/${dialog.kind}`, json("POST", { revision: dialog.request.revision, reason })); done(t(locale, "Decision recorded.", "سُجّل القرار.")); }} />}
  </>;
}

// ---------------- Account support ----------------

const CHECKLIST_HINT: [string, string] = ["How you verified the caller (e.g. callback to the work number on file).", "كيف تحققت من المتصل (مثل الاتصال على رقم العمل المسجّل)."];

/** Access › Account Support (SUPPORT_ACCOUNT): find an account, verify the caller, then act. Never shows case or clinical data. */
export function AccountSupportPage({ locale }: { locale: Locale }) {
  return <WorkforcePage locale={locale} active="support" title={t(locale, "Account Support", "دعم الحسابات")}
    intro={t(locale, "Find a staff account by email, verify the caller, then resend an invitation, send a password reset, or request an MFA reset for an administrator to approve.", "ابحث عن حساب موظف بالبريد، وتحقق من المتصل، ثم أعد إرسال الدعوة أو أرسل إعادة تعيين كلمة المرور أو اطلب إعادة تعيين التحقق ليوافق عليها مسؤول.")}
    allowed={(a) => a.can("SUPPORT_ACCOUNT")}>
    {({ api }) => <AccountSupport locale={locale} api={api} />}
  </WorkforcePage>;
}

function AccountSupport({ locale, api }: { locale: Locale; api: AdminApi }) {
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<SupportView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState<"resend" | "password" | "mfa" | null>(null);
  const [checklist, setChecklist] = useState("");
  const [notice, setNotice] = useState("");
  const find = async (e: React.FormEvent) => { e.preventDefault(); setError(null); setNotice(""); setAccount(null); try { setAccount(await api<SupportView>(`/support/accounts?query=${encodeURIComponent(query.trim())}`)); } catch (err) { setError(err); } };
  const done = (message: string) => { setAction(null); setChecklist(""); setNotice(message); };
  const badge = account ? lifecycleBadge(account.lifecycle, locale) : null;
  return <>
    <form className="cc-filterbar" role="search" onSubmit={find}>
      <Field label={t(locale, "Work email", "بريد العمل")}><input type="email" dir="ltr" required value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
      <button>{t(locale, "Find account", "بحث")}</button>
    </form>
    <ErrorNotice error={error} locale={locale} action="load" />
    <SuccessNotice>{notice || null}</SuccessNotice>
    {account && badge && <Section id="account" title={account.name ?? t(locale, "Name not recorded", "اسم غير مسجّل")}>
      <p><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> {account.mfaEnrolled ? <StatusBadge tone="success">{t(locale, "MFA enrolled", "التحقق مفعّل")}</StatusBadge> : <StatusBadge tone="warning">{t(locale, "No MFA", "لا تحقق")}</StatusBadge>}</p>
      <p className="cc-meta">{t(locale, "Roles", "الأدوار")}: {account.roles.map((r) => platformRoleLabel(r, locale)).join(" · ") || "—"} · {t(locale, "Last sign-in", "آخر دخول")} {when(account.lastSignInAt, locale)}</p>
      <div className="cc-step-actions">
        {account.lifecycle === "INVITED" && <button type="button" className="cc-secondary cc-small" onClick={() => setAction("resend")}>{t(locale, "Resend invitation", "إعادة إرسال الدعوة")}</button>}
        {account.lifecycle === "ACTIVE" && <button type="button" className="cc-secondary cc-small" onClick={() => setAction("password")}>{t(locale, "Send password reset", "إرسال إعادة تعيين كلمة المرور")}</button>}
        {account.lifecycle === "ACTIVE" && account.mfaEnrolled && <button type="button" className="cc-secondary cc-small" onClick={() => setAction("mfa")}>{t(locale, "Request MFA reset", "طلب إعادة تعيين التحقق")}</button>}
      </div>
    </Section>}
    {account && action && <ActionDialog locale={locale} needsReason={action === "mfa"}
      title={action === "resend" ? t(locale, "Resend the invitation?", "إعادة إرسال الدعوة؟") : action === "password" ? t(locale, "Send a password reset email?", "إرسال بريد إعادة تعيين كلمة المرور؟") : t(locale, "Request an MFA reset?", "طلب إعادة تعيين التحقق؟")}
      confirm={t(locale, "Continue", "متابعة")} onClose={() => setAction(null)}
      onSubmit={async (reason) => {
        if (!checklist.trim()) throw new Error(t(locale, "Record how you verified the caller.", "سجّل كيف تحققت من المتصل."));
        const subject = encodeURIComponent(account.subject);
        if (action === "resend") { await api(`/support/accounts/${subject}/resend-invitation`, json("POST", { checklist })); done(t(locale, "Invitation resent.", "أُعيد إرسال الدعوة.")); }
        else if (action === "password") { await api(`/support/accounts/${subject}/password-reset`, json("POST", { checklist })); done(t(locale, "Password reset email sent.", "أُرسل بريد إعادة التعيين.")); }
        else { await api("/support/mfa-reset-requests", json("POST", { subject: account.subject, reason, checklist })); done(t(locale, "MFA reset requested; an administrator approves it.", "طُلبت إعادة التعيين؛ يوافق عليها مسؤول.")); }
      }}>
      <Field label={t(locale, "Verification", "التحقق")} hint={t(locale, CHECKLIST_HINT[0], CHECKLIST_HINT[1])} required><textarea required maxLength={500} value={checklist} onChange={(e) => setChecklist(e.target.value)} /></Field>
    </ActionDialog>}
  </>;
}

// ---------------- Access reviews & MFA resets ----------------

/** Access › Access Reviews: recertification campaigns (WORKFORCE_READ to view; WORKFORCE_ADMINISTER to run) and MFA reset approvals. */
export function AccessReviewsPage({ locale }: { locale: Locale }) {
  return <WorkforcePage locale={locale} active="recertification" title={t(locale, "Access Reviews", "مراجعات الصلاحيات")}
    intro={t(locale, "Periodic confirmation that every role is still needed, and approval of MFA resets requested by Support.", "تأكيد دوري لحاجة كل دور، والموافقة على طلبات إعادة تعيين التحقق من الدعم.")}
    allowed={(a) => a.can("WORKFORCE_READ")}>
    {({ access, api }) => <AccessReviews locale={locale} access={access} api={api} />}
  </WorkforcePage>;
}

function AccessReviews({ locale, access, api }: { locale: Locale; access: ControlCenterAccess; api: AdminApi }) {
  const admin = access.can("WORKFORCE_ADMINISTER");
  const campaigns = useRead<Campaign[]>(api, `${ADMIN}/recertifications`);
  const resets = useRead<MfaReset[]>(api, admin ? `${ADMIN}/mfa-reset-requests` : null);
  const [open, setOpen] = useState<string | null>(null);
  const detail = useRead<{ campaign: Campaign; items: CampaignItem[] }>(api, open ? `${ADMIN}/recertifications/${open}` : null);
  const [dialog, setDialog] = useState<{ kind: "start" } | { kind: "item"; item: CampaignItem; certify: boolean } | { kind: "mfa"; reset: MfaReset; approve: boolean } | null>(null);
  const [scope, setScope] = useState("PRIVILEGED");
  const [notice, setNotice] = useState("");
  const done = (message: string) => { setDialog(null); setNotice(message); campaigns.reload(); detail.reload(); resets.reload(); };
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <Section id="campaigns" title={t(locale, "Recertification campaigns", "حملات إعادة التأكيد")} actions={admin ? <button type="button" onClick={() => setDialog({ kind: "start" })}>{t(locale, "Start campaign", "بدء حملة")}</button> : undefined}>
      <ErrorNotice error={campaigns.error} locale={locale} action="load" onRetry={campaigns.reload} />
      {!campaigns.data ? <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p> : !campaigns.data.length ? <EmptyState title={t(locale, "No campaigns yet", "لا توجد حملات بعد")} /> : (
        <ul className="cc-list">{campaigns.data.map((c) => <li key={c.id}>
          <span><strong>{c.scope === "PRIVILEGED" ? t(locale, "Privileged roles", "الأدوار الحساسة") : t(locale, "Standard roles", "الأدوار العادية")}</strong><span className="cc-row-sub">{when(c.startedAt, locale)} → {when(c.dueAt, locale)}</span></span>
          <span><StatusBadge tone={c.status === "OPEN" ? "warning" : "neutral"}>{c.status === "OPEN" ? t(locale, "Open", "مفتوحة") : t(locale, "Closed", "مغلقة")}</StatusBadge></span>
          <span className="cc-row-actions"><button type="button" className="cc-secondary cc-small" onClick={() => setOpen(c.id)}>{t(locale, "Open", "فتح")}</button></span>
        </li>)}</ul>
      )}
    </Section>
    {open && detail.data && <Section id="items" title={t(locale, "Roles to confirm", "أدوار للتأكيد")}>
      <ul className="cc-list">{detail.data.items.map((i) => <li key={i.id}>
        <span>{platformRoleLabel(i.role, locale)}<span className="cc-row-sub"><bdi>{i.subject}</bdi></span></span>
        <span><StatusBadge tone={i.decision === "PENDING" ? "warning" : i.decision === "CERTIFIED" ? "success" : "neutral"}>{i.decision}</StatusBadge></span>
        <span className="cc-row-actions">{admin && i.decision === "PENDING" && <>
          <button type="button" className="cc-small" onClick={() => setDialog({ kind: "item", item: i, certify: true })}>{t(locale, "Still needed", "ما زال مطلوبًا")}</button>
          <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "item", item: i, certify: false })}>{t(locale, "Revoke", "سحب")}</button>
        </>}</span>
      </li>)}</ul>
    </Section>}
    {admin && <Section id="mfa" title={t(locale, "MFA reset requests", "طلبات إعادة تعيين التحقق")}>
      <ErrorNotice error={resets.error} locale={locale} action="load" onRetry={resets.reload} />
      {!resets.data ? <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p> : !resets.data.filter((r) => r.status === "PENDING").length ? <EmptyState title={t(locale, "Nothing is waiting.", "لا يوجد ما ينتظر.")} /> : (
        <ul className="cc-cards">{resets.data.filter((r) => r.status === "PENDING").map((r) => <li className="cc-card" key={r.id}>
          <h3><bdi>{r.subject}</bdi></h3><p>{r.reason}</p><p className="cc-meta">{t(locale, "Requested", "طُلب")} {when(r.requestedAt, locale)} · {t(locale, "Expires", "ينتهي")} {when(r.expiresAt, locale)}</p>
          <div className="cc-step-actions">
            <button type="button" className="cc-small" onClick={() => setDialog({ kind: "mfa", reset: r, approve: true })}>{t(locale, "Approve reset", "الموافقة")}</button>
            <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "mfa", reset: r, approve: false })}>{t(locale, "Reject", "رفض")}</button>
          </div>
        </li>)}</ul>
      )}
    </Section>}
    {dialog?.kind === "start" && <ActionDialog locale={locale} needsReason={false} title={t(locale, "Start a recertification campaign", "بدء حملة إعادة تأكيد")} confirm={t(locale, "Start", "بدء")} onClose={() => setDialog(null)}
      onSubmit={async () => { await api(`${ADMIN}/recertifications?scope=${scope}`, { method: "POST" }); done(t(locale, "Campaign started.", "بدأت الحملة.")); }}>
      <Field label={t(locale, "Scope", "النطاق")}><select value={scope} onChange={(e) => setScope(e.target.value)}><option value="PRIVILEGED">{t(locale, "Privileged roles", "الأدوار الحساسة")}</option><option value="STANDARD">{t(locale, "Standard roles", "الأدوار العادية")}</option></select></Field>
    </ActionDialog>}
    {dialog?.kind === "item" && <ActionDialog locale={locale} danger={!dialog.certify} title={dialog.certify ? t(locale, "Confirm the role is still needed?", "تأكيد أن الدور ما زال مطلوبًا؟") : t(locale, "Revoke this role?", "سحب هذا الدور؟")} confirm={dialog.certify ? t(locale, "Confirm", "تأكيد") : t(locale, "Revoke", "سحب")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${ADMIN}/recertification-items/${dialog.item.id}/decision`, json("POST", { revision: dialog.item.revision, certify: dialog.certify, reason })); done(t(locale, "Decision recorded.", "سُجّل القرار.")); }} />}
    {dialog?.kind === "mfa" && <ActionDialog locale={locale} danger={!dialog.approve} title={dialog.approve ? t(locale, "Approve the MFA reset?", "الموافقة على إعادة تعيين التحقق؟") : t(locale, "Reject the MFA reset?", "رفض إعادة تعيين التحقق؟")} confirm={dialog.approve ? t(locale, "Approve", "موافقة") : t(locale, "Reject", "رفض")} onClose={() => setDialog(null)}
      onSubmit={async (reason) => { await api(`${ADMIN}/mfa-reset-requests/${dialog.reset.id}/decision`, json("POST", { revision: dialog.reset.revision, approve: dialog.approve, reason })); done(t(locale, "Decision recorded.", "سُجّل القرار.")); }} />}
  </>;
}

// ---------------- Service accounts ----------------

/** Access › Service Accounts: machine clients, their accountable owner and credential rotation. */
export function ServiceAccountsPage({ locale }: { locale: Locale }) {
  return <WorkforcePage locale={locale} active="serviceAccounts" title={t(locale, "Service Accounts", "حسابات الخدمة")}
    intro={t(locale, "Every machine client has an accountable owner and a rotation date. Overdue rotations are flagged.", "لكل عميل آلي مالك مسؤول وتاريخ تدوير. يُنبَّه على التدوير المتأخر.")}
    allowed={(a) => a.can("WORKFORCE_READ")}>
    {({ access, api }) => <ServiceAccounts locale={locale} access={access} api={api} />}
  </WorkforcePage>;
}

function ServiceAccounts({ locale, access, api }: { locale: Locale; access: ControlCenterAccess; api: AdminApi }) {
  const { data, error, reload } = useRead<ServiceAccount[]>(api, `${ADMIN}/service-accounts`);
  const admin = access.can("WORKFORCE_ADMINISTER");
  const [dialog, setDialog] = useState<{ kind: "register" } | { kind: "rotate" | "retire"; account: ServiceAccount["account"] } | null>(null);
  const [form, setForm] = useState({ clientId: "", ownerSubject: "", purpose: "", scopes: "", rotated: new Date().toISOString().slice(0, 10) });
  const [notice, setNotice] = useState("");
  const done = (message: string) => { setDialog(null); setNotice(message); reload(); };
  if (error && !data) return <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />;
  if (!data) return <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p>;
  return <>
    <SuccessNotice>{notice || null}</SuccessNotice>
    {admin && <p><button type="button" onClick={() => setDialog({ kind: "register" })}>{t(locale, "Register service account", "تسجيل حساب خدمة")}</button></p>}
    {!data.length ? <EmptyState title={t(locale, "No service accounts registered", "لا توجد حسابات خدمة مسجّلة")} /> : (
      <ul className="cc-cards">{data.map(({ account: a, rotationOverdue }) => <li className="cc-card" key={a.clientId}>
        <h3><bdi dir="ltr">{a.clientId}</bdi></h3>
        <p><StatusBadge tone={a.status === "ACTIVE" ? (rotationOverdue ? "warning" : "success") : "neutral"}>{a.status === "ACTIVE" ? (rotationOverdue ? t(locale, "Rotation overdue", "التدوير متأخر") : t(locale, "Active", "نشط")) : t(locale, "Retired", "متقاعد")}</StatusBadge></p>
        <p>{a.purpose}</p><p className="cc-meta">{t(locale, "Scopes", "النطاقات")}: <bdi dir="ltr">{a.scopes}</bdi> · {t(locale, "Rotated", "آخر تدوير")} {when(a.secretRotatedAt, locale)}</p>
        {admin && a.status === "ACTIVE" && <div className="cc-step-actions">
          <button type="button" className="cc-secondary cc-small" onClick={() => setDialog({ kind: "rotate", account: a })}>{t(locale, "Record rotation", "تسجيل التدوير")}</button>
          <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setDialog({ kind: "retire", account: a })}>{t(locale, "Retire", "إيقاف")}</button>
        </div>}
      </li>)}</ul>
    )}
    {dialog?.kind === "register" && <ActionDialog locale={locale} needsReason={false} title={t(locale, "Register a service account", "تسجيل حساب خدمة")} confirm={t(locale, "Register", "تسجيل")} onClose={() => setDialog(null)}
      onSubmit={async () => { await api(`${ADMIN}/service-accounts`, json("POST", { clientId: form.clientId.trim(), ownerSubject: form.ownerSubject.trim(), purpose: form.purpose.trim(), scopes: form.scopes.trim(), secretRotatedAt: toIso(form.rotated) })); done(t(locale, "Service account registered.", "سُجّل حساب الخدمة.")); }}>
      <Field label={t(locale, "Client ID", "معرّف العميل")} required><input required dir="ltr" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} /></Field>
      <Field label={t(locale, "Owner (account ID)", "المالك (معرّف الحساب)")} required><input required dir="ltr" value={form.ownerSubject} onChange={(e) => setForm({ ...form, ownerSubject: e.target.value })} /></Field>
      <Field label={t(locale, "Purpose", "الغرض")} required><input required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></Field>
      <Field label={t(locale, "Scopes", "النطاقات")} required><input required dir="ltr" value={form.scopes} onChange={(e) => setForm({ ...form, scopes: e.target.value })} /></Field>
      <Field label={t(locale, "Secret last rotated", "آخر تدوير للسر")} required><input type="date" required dir="ltr" value={form.rotated} onChange={(e) => setForm({ ...form, rotated: e.target.value })} /></Field>
    </ActionDialog>}
    {(dialog?.kind === "rotate" || dialog?.kind === "retire") && <ActionDialog locale={locale} needsReason={false} danger={dialog.kind === "retire"} title={dialog.kind === "rotate" ? t(locale, "Record a secret rotation?", "تسجيل تدوير السر؟") : t(locale, "Retire this service account?", "إيقاف حساب الخدمة؟")} confirm={dialog.kind === "rotate" ? t(locale, "Record", "تسجيل") : t(locale, "Retire", "إيقاف")} onClose={() => setDialog(null)}
      onSubmit={async () => { await api(`${ADMIN}/service-accounts/${encodeURIComponent(dialog.account.clientId)}/${dialog.kind === "rotate" ? "rotation" : "retire"}`, json("POST", { revision: dialog.account.revision, secretRotatedAt: new Date().toISOString() })); done(t(locale, "Saved.", "حُفظ.")); }} />}
  </>;
}

// ---------------- Audit ----------------

/** Access › Audit (AUDIT_READ): the governance audit trail — access, workforce and journey governance changes. */
export function AuditPage({ locale }: { locale: Locale }) {
  return <WorkforcePage locale={locale} active="audit" title={t(locale, "Audit", "سجل التدقيق")}
    intro={t(locale, "Every access, workforce and journey governance change, newest first.", "كل تغيير في الصلاحيات وفريق العمل وحوكمة الرحلات، الأحدث أولًا.")}
    allowed={(a) => a.can("AUDIT_READ")}>
    {({ api }) => <Audit locale={locale} api={api} />}
  </WorkforcePage>;
}

function Audit({ locale, api }: { locale: Locale; api: AdminApi }) {
  const [filters, setFilters] = useState({ action: "", offset: 0 });
  const query = new URLSearchParams({ offset: String(filters.offset), ...(filters.action ? { action: filters.action } : {}) });
  const { data, error, reload } = useRead<AuditEntry[]>(api, `${ADMIN}/audit?${query}`);
  return <>
    <div className="cc-filterbar" role="search"><label>{t(locale, "Action", "الإجراء")}<input dir="ltr" value={filters.action} onChange={(e) => setFilters({ action: e.target.value.trim().toUpperCase(), offset: 0 })} placeholder="ROLE_GRANTED" /></label></div>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />
    {!data ? <p role="status">{t(locale, "Loading…", "جارٍ التحميل…")}</p> : !data.length ? <EmptyState title={t(locale, "No audit entries match.", "لا توجد سجلات مطابقة.")} /> : <>
      <ul className="cc-list">{data.map((e, i) => <li key={`${e.occurredAt}-${i}`}>
        <span><strong dir="ltr">{e.action}</strong><span className="cc-row-sub">{when(e.occurredAt, locale)}</span></span>
        <span><StatusBadge tone={e.outcome === "SUCCESS" ? "success" : e.outcome === "DENY" ? "danger" : "neutral"}>{e.outcome}</StatusBadge></span>
        <span className="cc-meta"><bdi dir="ltr">{e.actor}</bdi>{e.reason ? ` · ${e.reason}` : ""}</span>
      </li>)}</ul>
      <div className="cc-form-actions">
        {filters.offset > 0 && <button type="button" className="cc-secondary" onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - 100) })}>{t(locale, "Newer", "أحدث")}</button>}
        {data.length === 100 && <button type="button" className="cc-secondary" onClick={() => setFilters({ ...filters, offset: filters.offset + 100 })}>{t(locale, "Older", "أقدم")}</button>}
      </div>
    </>}
  </>;
}
