"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { IdentityReviewQueue } from "@/components/portal/PortalDirectories";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { EmptyState, ErrorNotice, Facts, Section, SectionTabs, StatusBadge, SuccessNotice, TabPanel, TechnicalDetails } from "./cc-ui";
import { accountStatusLabel, approvalStatusLabel, careAreaLabel, formatDate } from "./admin-labels";
import { DirectApproval, DirectPriceList, StaffInviteForm, StaffTeams } from "./legacy-admin";
import type { DirectConsultant } from "./ConsultantDirectory";

const signInButton = (locale: Locale, signIn: () => void) => <button onClick={signIn}>{locale === "ar" ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>;

export type DirectTab = "overview" | "approval" | "pricing" | "access";

/** A consultant invited directly for the current case workflow: approval, price list and account access. */
export function DirectConsultantDetail({ locale, practitionerId, initialTab, justCreated }: { locale: Locale; practitionerId: string; initialTab?: DirectTab; justCreated?: boolean }) {
  const ar = locale === "ar";
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [item, setItem] = useState<DirectConsultant | null | "missing">(null);
  const [error, setError] = useState<unknown>(null); const [actionError, setActionError] = useState<unknown>(null); const [notice, setNotice] = useState(justCreated ? (ar ? "أُرسلت الدعوة وأُنشئ الملف. سجّل الاعتماد ثم قرر الاعتماد للحالات." : "Invitation sent and profile created. Record a credential, then make the approval decision.") : "");
  const [tab, setTab] = useState<DirectTab>(initialTab ?? "overview"); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(null); try { const all = await api<DirectConsultant[]>("/admin/practitioners"); setItem(all.find((p) => p.id === practitionerId) ?? "missing"); } catch (e) { setError(e); } }, [api, practitionerId]);
  useEffect(() => { if (user) void load(); }, [user, load]);
  const change = (t: DirectTab) => { setTab(t); router.replace(ccHref(locale, `/providers/consultants/direct/${practitionerId}?tab=${t}`), { scroll: false }); };
  const name = item && item !== "missing" ? item.displayName ?? (ar ? "بلا اسم" : "Unnamed") : (ar ? "استشاري مباشر" : "Direct consultant");
  const crumbs = ccCrumbs(locale, { label: ar ? "الاستشاريون" : "Consultants", href: ccHref(locale, "/providers/consultants?view=direct") }, { label: name });
  const act = async (action: "resend-invite" | "disable" | "enable") => {
    if (item === null || item === "missing") return;
    if (action === "disable" && !window.confirm(ar ? `تعطيل وصول ${name}؟ لن يتمكن من تسجيل الدخول.` : `Disable ${name}'s access? They will no longer be able to sign in.`)) return;
    setBusy(true); setActionError(null); setNotice("");
    try { await api(`/admin/practitioners/${practitionerId}/${action}${action === "resend-invite" ? `?locale=${locale}` : ""}`, { method: "POST" }); setNotice(action === "resend-invite" ? (ar ? "أُعيد إرسال الدعوة." : "Invitation sent again.") : (ar ? "تم تحديث الوصول." : "Access updated.")); await load(); }
    catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const shell = (body: React.ReactNode, intro?: string, actions?: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={crumbs} title={name} intro={intro} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || access.loading || (item === null && !error)) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(signInButton(locale, () => void signIn()));
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (item === "missing" || !item) return shell(<EmptyState title={ar ? "لم يُعثر على هذا الاستشاري" : "This consultant could not be found"} />);
  const approval = approvalStatusLabel(item.credentialingStatus, locale), account = accountStatusLabel(item.accountStatus, locale);
  const tabs = [
    { key: "overview" as const, label: ar ? "نظرة عامة" : "Overview" },
    { key: "approval" as const, label: ar ? "الاعتماد للحالات" : "Case approval", attention: item.credentialingStatus === "UNDER_REVIEW" },
    { key: "pricing" as const, label: ar ? "قائمة الأسعار" : "Price list" },
    { key: "access" as const, label: ar ? "الوصول للحساب" : "Account access" },
  ];
  return shell(
    <>
      <p style={{ marginTop: -8, marginBottom: 18, display: "flex", gap: 8, flexWrap: "wrap" }}><StatusBadge tone={approval.tone}>{approval.label}</StatusBadge><StatusBadge tone={account.tone}>{account.label}</StatusBadge></p>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={actionError} locale={locale} />
      <SectionTabs attentionLabel={locale === "ar" ? "يحتاج إجراء" : "needs attention"} label={name} tabs={tabs} active={tab} onChange={change} />
      <TabPanel id={tab}>
        {tab === "overview" && <Section title={ar ? "الملخص" : "Summary"} id="summary">
          <Facts items={[[ar ? "التخصص" : "Speciality", [item.specialty, item.subspecialty].filter(Boolean).join(" · ") || "—"], [ar ? "مجال الرعاية" : "Care area", careAreaLabel(item.careCategory, locale)], [ar ? "بريد العمل" : "Work email", item.email ? <bdi dir="ltr">{item.email}</bdi> : "—"], [ar ? "أُرسلت الدعوة" : "Invited", formatDate(item.invitedAt, locale)]]} />
          <TechnicalDetails locale={locale} items={[[ar ? "معرّف الطبيب" : "Practitioner ID", item.id], [ar ? "حالة الاعتماد" : "Credentialing code", item.credentialingStatus ?? "—"], [ar ? "حالة التوافر" : "Availability code", item.availabilityStatus ?? "—"]]} />
        </Section>}
        {tab === "approval" && <DirectApproval locale={locale} api={api} practitionerId={item.id} status={approval.label} editable={access.legacy.canManage} onChanged={() => void load()} />}
        {tab === "pricing" && <DirectPriceList locale={locale} api={api} practitionerId={item.id} careArea={item.careCategory} editable={access.legacy.systemAdmin} />}
        {tab === "access" && <Section title={ar ? "الوصول للحساب" : "Account access"} description={ar ? "يُتابَع تفعيل الحساب بشكل منفصل عن اعتماد المؤهلات." : "Account activation is tracked separately from credential approval."} id="access">
          <Facts items={[[ar ? "الحساب" : "Account", <StatusBadge key="a" tone={account.tone}>{account.label}</StatusBadge>]]} />
          {access.legacy.systemAdmin ? <div className="cc-form-actions" style={{ marginTop: 16 }}>
            {item.accountStatus === "INVITED" && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void act("resend-invite")}>{ar ? "إعادة إرسال الدعوة" : "Resend invitation"}</button>}
            {item.accountStatus === "DISABLED" ? <button type="button" className="cc-secondary" disabled={busy} onClick={() => void act("enable")}>{ar ? "استعادة الوصول" : "Restore access"}</button> : <button type="button" className="cc-secondary cc-danger-button" disabled={busy} onClick={() => void act("disable")}>{ar ? "تعطيل الوصول" : "Disable access"}</button>}
          </div> : <p className="cc-meta">{ar ? "يدير مسؤول النظام الوصول للحسابات." : "A system administrator manages account access."}</p>}
        </Section>}
      </TabPanel>
    </>,
    [item.specialty, careAreaLabel(item.careCategory, locale)].filter(Boolean).join(" · "),
  );
}

/** Coordination, Operations and Finance staff: invitations, team leads and account access. */
export function StaffAndTeams({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [inviting, setInviting] = useState(false); const [version, setVersion] = useState(0); const [notice, setNotice] = useState("");
  const title = ar ? "الموظفون والفرق" : "Staff & teams";
  const actions = access.legacy.canManage && !inviting ? <button type="button" onClick={() => { setInviting(true); setNotice(""); }}><UserPlus size={16} aria-hidden />{ar ? "دعوة موظف" : "Invite staff member"}</button> : undefined;
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="staff" crumbs={ccCrumbs(locale, { label: title })} title={title} intro={ar ? "موظفو التنسيق والعمليات والمالية، وقادة فرقهم، ووصول حساباتهم." : "Coordination, operations and finance staff, their team leads and their account access."} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(signInButton(locale, () => void signIn()));
  if (!access.legacy.admin) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You don't have access to this area"} />);
  return shell(
    <>
      <SuccessNotice>{notice || null}</SuccessNotice>
      {inviting && <StaffInviteForm locale={locale} api={api} onCancel={() => setInviting(false)} onInvited={() => { setInviting(false); setVersion((v) => v + 1); setNotice(ar ? "أُرسلت الدعوة. سيختار الموظف كلمة المرور من الرابط الآمن." : "Invitation sent. They will choose their password from the secure link."); }} />}
      <StaffTeams locale={locale} api={api} editable={access.legacy.systemAdmin} version={version} />
    </>
  );
}

/** Patient and representative identity verification requests. */
export function IdentityChecks({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const legacyApi = useCallback(<T,>(path: string, init?: RequestInit) => api<T>(path, { method: init?.method, raw: init?.body ?? undefined }), [api]);
  const title = ar ? "التحقق من الهوية" : "Identity checks";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="identity" crumbs={ccCrumbs(locale, { label: title })} title={title} intro={ar ? "راجع أدلة هوية المرضى والممثلين وسجّل القرار." : "Review patient and representative identity evidence and record a decision."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(signInButton(locale, () => void signIn()));
  if (!access.legacy.identityReviewer) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You don't have access to this area"} />);
  return shell(<div className="cc-identity"><IdentityReviewQueue api={legacyApi} locale={locale} /></div>);
}
