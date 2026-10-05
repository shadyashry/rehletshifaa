"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Facts, Section, SectionTabs, StatusBadge, SuccessNotice, TabPanel, TechnicalDetails } from "./cc-ui";
import { accountStatusLabel, approvalStatusLabel, careAreaLabel, formatDate, type Tone } from "./admin-labels";
import { ConsultantApproval, ConsultantPriceList } from "./catalog-admin";
import { caseEligibility, consultantHref, credentialStatus, setupStatus, type Consultant } from "./consultant-model";
import { ConsultantOwnershipPanel } from "./ConsultantOwnershipPanel";

type SectionState = "complete" | "attention" | "waiting";
const stateBadge = (state: SectionState, locale: Locale): { label: string; tone: Tone } => ({
  complete: { label: locale === "ar" ? "مكتمل" : "Complete", tone: "success" as Tone },
  attention: { label: locale === "ar" ? "يحتاج إجراء" : "Needs attention", tone: "warning" as Tone },
  waiting: { label: locale === "ar" ? "بالانتظار" : "Waiting", tone: "info" as Tone },
})[state];

export type ConsultantTab = "overview" | "approval" | "prices" | "access";

/**
 * A Consultant's page: one credential & case-approval decision (CREDENTIAL_DECIDE), their price list
 * (CONSULTANT_CATALOG_MANAGE) and account access (CONSULTANT_ONBOARD). Each control shows only to its holder;
 * the backend authorizes every call.
 */
export function ConsultantPage({ locale, practitionerId, initialTab, invited }: { locale: Locale; practitionerId: string; initialTab?: ConsultantTab; invited?: boolean }) {
  const ar = locale === "ar";
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [item, setItem] = useState<Consultant | null | "missing">(null);
  const [error, setError] = useState<unknown>(null); const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState(invited ? (ar ? "أُرسلت الدعوة وأُنشئ الملف. الخطوة التالية: تسجيل الاعتماد ثم قرار الاعتماد للحالات." : "Invitation sent and profile created. Next: record their credential, then make the case-approval decision.") : "");
  const [tab, setTab] = useState<ConsultantTab>(initialTab ?? "overview"); const [busy, setBusy] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => { setError(null); try { const all = await api<Consultant[]>("/admin/practitioners"); setItem(all.find((p) => p.id === practitionerId) ?? "missing"); } catch (e) { setError(e); } }, [api, practitionerId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { if (user) void load(); }, [user, load]);
  const rendered = !access.loading && !!item && item !== "missing";
  useEffect(() => { if (invited && rendered) noticeRef.current?.focus(); }, [invited, rendered]);
  const change = (t: ConsultantTab) => { setTab(t); router.replace(consultantHref(locale, practitionerId, t), { scroll: false }); };
  const name = item && item !== "missing" ? item.displayName ?? (ar ? "بلا اسم" : "Unnamed") : (ar ? "استشاري" : "Consultant");
  const act = async (action: "resend-invite" | "disable" | "enable") => {
    if (item === null || item === "missing") return;
    if (action === "disable" && !window.confirm(ar ? `تعطيل وصول ${name}؟ لن يتمكن من تسجيل الدخول.` : `Disable ${name}'s access? They will no longer be able to sign in.`)) return;
    setBusy(true); setActionError(null); setNotice("");
    try { await api(`/admin/practitioners/${practitionerId}/${action}${action === "resend-invite" ? `?locale=${locale}` : ""}`, { method: "POST" }); setNotice(action === "resend-invite" ? (ar ? "أُعيد إرسال الدعوة." : "Invitation sent again.") : (ar ? "تم تحديث الوصول." : "Access updated.")); await load(); }
    catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const shell = (body: React.ReactNode, intro?: string) => <ControlCenterShell locale={locale} active="consultants" crumbs={[{ label: name }]} title={name} intro={intro}>{body}</ControlCenterShell>;
  if (authLoading || access.loading || (item === null && !error)) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (item === "missing" || !item) return shell(<EmptyState title={ar ? "لم يُعثر على هذا الاستشاري" : "This consultant could not be found"} />);

  const approval = approvalStatusLabel(item.credentialingStatus, locale), account = accountStatusLabel(item.accountStatus, locale);
  const setup = setupStatus(item, locale), credential = credentialStatus(item, locale), eligibility = caseEligibility(item, locale);
  const steps: { key: string; title: string; state: SectionState; owner: string; body: string; tab?: ConsultantTab }[] = [
    { key: "account", title: ar ? "الحساب" : "Account", state: item.accountStatus === "ACTIVE" ? "complete" : item.accountStatus === "DISABLED" ? "attention" : "waiting", owner: ar ? "الطبيب المدعو" : "The invited consultant", body: item.accountStatus === "INVITED" ? (ar ? "بانتظار قبول الدعوة وإنشاء كلمة المرور." : "Waiting for them to accept the invitation and set a password.") : account.label, tab: "access" },
    { key: "approval", title: ar ? "الاعتماد والموافقة على الحالات" : "Credential & case approval", state: (item.credentialingStatus === "VERIFIED" ? "complete" : "attention") as SectionState, owner: ar ? "فريق اعتماد رحلة شفاء" : "RehletShifaa credentialing team", body: approval.label, tab: "approval" as ConsultantTab },
    { key: "availability", title: ar ? "التوفر للحالات" : "Availability for cases", state: item.availabilityStatus === "AVAILABLE" ? "complete" : "waiting", owner: ar ? "الطبيب" : "The consultant", body: item.availabilityStatus === "AVAILABLE" ? (ar ? "متاح" : "Available") : (ar ? "مسجَّل غير متاح" : "Marked unavailable") },
  ];

  const tabs = [
    { key: "overview" as const, label: ar ? "نظرة عامة" : "Overview" },
    { key: "approval" as const, label: ar ? "الاعتماد والموافقة على الحالات" : "Credential & case approval", attention: item.credentialingStatus === "UNDER_REVIEW" },
    { key: "prices" as const, label: ar ? "قائمة الأسعار" : "Price list" },
    { key: "access" as const, label: ar ? "الوصول للحساب" : "Account access" },
  ];
  const shown = tabs.some((x) => x.key === tab) ? tab : "overview";
  return shell(
    <>
      <p className="cc-clinician-badges"><StatusBadge tone={setup.tone}>{setup.label}</StatusBadge></p>
      <div ref={noticeRef} tabIndex={-1} className="cc-focus-target"><SuccessNotice>{notice || null}</SuccessNotice></div>
      <ErrorNotice error={actionError} locale={locale} />
      <SectionTabs attentionLabel={ar ? "يحتاج إجراء" : "needs attention"} label={name} tabs={tabs} active={shown} onChange={change} />
      <TabPanel id={shown}>
        {shown === "overview" && <>
          <Section title={ar ? "الملخص" : "Summary"} id="summary">
            <Facts items={[
              [ar ? "التخصص" : "Specialty", [item.specialty, item.subspecialty].filter(Boolean).join(" · ") || "—"],
              [ar ? "مجال الرعاية" : "Care area", careAreaLabel(item.careCategory, locale)],
              [ar ? "الحساب" : "Account", <StatusBadge key="a" tone={account.tone}>{account.label}</StatusBadge>],
              [ar ? "الاعتمادات" : "Credentials", <span key="c"><StatusBadge tone={credential.tone}>{credential.label}</StatusBadge>{credential.detail && <span className="cc-row-sub">{credential.detail}</span>}</span>],
              [ar ? "أهلية الحالات" : "Case eligibility", <span key="e"><StatusBadge tone={eligibility.tone}>{eligibility.label}</StatusBadge>{eligibility.detail && <span className="cc-row-sub">{eligibility.detail}</span>}</span>],
              [ar ? "بريد العمل" : "Work email", item.email ? <bdi key="m" dir="ltr">{item.email}</bdi> : "—"],
              [ar ? "أُرسلت الدعوة" : "Invited", formatDate(item.invitedAt, locale)],
            ]} />
          </Section>
          <Section title={ar ? "الإعداد" : "Setup"} description={ar ? "الإعداد: الحساب، ثم قرار واحد يغطي الاعتماد والموافقة على الحالات." : "Setup: the account, then one decision that covers the credential check and approval for cases."} id="setup">
            <ol className="cc-setup-list">
              {steps.map((s, i) => { const b = stateBadge(s.state, locale); return (
                <li key={s.key} className={`cc-setup-section cc-setup-${s.state}`}>
                  <div className="cc-setup-head"><h3><span className="cc-setup-number" aria-hidden>{i + 1}</span>{s.title}</h3><StatusBadge tone={b.tone}>{b.label}</StatusBadge></div>
                  <p className="cc-meta">{ar ? "المسؤول: " : "Responsible: "}{s.owner}</p>
                  <p>{s.body}</p>
                  {s.tab && s.state === "attention" && tabs.some((x) => x.key === s.tab) && <div className="cc-form-actions cc-setup-actions"><button type="button" className="cc-small" onClick={() => change(s.tab!)}>{ar ? "فتح" : "Open"} {s.title}</button></div>}
                </li>
              ); })}
            </ol>
          </Section>
          {access.can("CONSULTANT_ONBOARD") && <ConsultantOwnershipPanel locale={locale} api={api} practitionerId={item.id} />}
          <TechnicalDetails locale={locale} items={[[ar ? "معرّف الطبيب" : "Practitioner ID", item.id], [ar ? "حالة الاعتماد" : "Credentialing code", item.credentialingStatus ?? "—"], [ar ? "حالة التوافر" : "Availability code", item.availabilityStatus ?? "—"]]} />
        </>}
        {shown === "approval" && <ConsultantApproval locale={locale} api={api} practitionerId={item.id} status={approval.label} editable={access.can("CREDENTIAL_DECIDE")} onChanged={() => void load()} />}
        {shown === "prices" && <ConsultantPriceList locale={locale} api={api} practitionerId={item.id} careArea={item.careCategory} editable={access.can("CONSULTANT_CATALOG_MANAGE")} />}
        {shown === "access" && <Section title={ar ? "الوصول للحساب" : "Account access"} description={ar ? "يُتابَع تفعيل الحساب بشكل منفصل عن اعتماد المؤهلات." : "Account activation is tracked separately from credential approval."} id="access">
          <Facts items={[[ar ? "الحساب" : "Account", <StatusBadge key="a" tone={account.tone}>{account.label}</StatusBadge>]]} />
          {access.can("CONSULTANT_ONBOARD") ? <div className="cc-form-actions" style={{ marginTop: 16 }}>
            {item.accountStatus === "INVITED" && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void act("resend-invite")}>{ar ? "إعادة إرسال الدعوة" : "Resend invitation"}</button>}
            {item.accountStatus === "DISABLED" ? <button type="button" className="cc-secondary" disabled={busy} onClick={() => void act("enable")}>{ar ? "استعادة الوصول" : "Restore access"}</button> : <button type="button" className="cc-secondary cc-danger-button" disabled={busy} onClick={() => void act("disable")}>{ar ? "تعطيل الوصول" : "Disable access"}</button>}
          </div> : <p className="cc-meta">{ar ? "يدير مدير عمليات الاستشاريين الوصول للحسابات." : "The Consultant Operations Manager manages account access."}</p>}
        </Section>}
      </TabPanel>
    </>,
    [item.specialty, careAreaLabel(item.careCategory, locale)].filter(Boolean).join(" · "),
  );
}
