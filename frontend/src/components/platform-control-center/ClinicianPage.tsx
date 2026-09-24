"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { ccHref } from "./control-center-nav";
import { ErrorNotice, Facts, Section, SectionTabs, StatusBadge, SuccessNotice, TabPanel, TechnicalDetails } from "./cc-ui";
import { membershipStatusLabel } from "./admin-labels";
import { personName } from "./provider-directory";
import { CredentialRequirements, PracticeRelationships, ProfessionalDetailsForm, useClinician } from "./consultant-setup";
import { PricingManagement } from "./PricingManagement";
import { AvailabilityManagement } from "./AvailabilityManagement";
import { ConsultantSetupChecklist, ReadinessSummary, buildSetupSections, stateBadge, type SetupTab } from "./ConsultantSetup";
import { clinicianHref, clinicianTypeLabel, credentialSummary, directClinicianHref, engagementLabel, providerCaseEligibility, providerSetupStatus, type ProviderClinicianRow } from "./clinician-model";

export type ClinicianTab = "overview" | "setup" | "credentials" | "relationships" | "prices" | "schedule";

/**
 * A clinician who works through a provider organization. One page family: Overview answers who they are, how they work
 * with RehletShifaa, whether they are ready and what needs attention; Setup is the persistent Consultant Setup checklist;
 * the other sections reuse the existing editors. Sections appear only when the caller can read them.
 */
export function ClinicianPage({ locale, organizationId, practitionerId, initialTab, invited }: { locale: Locale; organizationId: string; practitionerId: string; initialTab?: ClinicianTab; invited?: boolean }) {
  const ar = locale === "ar";
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const { api, detail, onboarding, readiness, member, loading, error, reload } = useClinician(organizationId, practitionerId);
  const [row, setRow] = useState<ProviderClinicianRow | null>(null);
  const [tab, setTab] = useState<ClinicianTab | undefined>(initialTab);
  const [notice, setNotice] = useState(invited ? (ar ? "أُرسلت الدعوة. يستمر الإعداد هنا، ويُحفظ كل قسم عند حفظه." : "Invitation sent. Setup continues here — each section saves on its own, so you can come back any time.") : "");
  const noticeRef = useRef<HTMLDivElement>(null);
  const loadRow = useCallback(async () => {
    try { setRow((await api<ProviderClinicianRow[]>(`/admin/providers/clinicians?organizationId=${organizationId}`)).find((r) => r.practitionerId === practitionerId) ?? null); } catch { setRow(null); }
  }, [api, organizationId, practitionerId]);
  const signedIn = !!user;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { if (signedIn) void loadRow(); }, [signedIn, loadRow]);
  // After "Send invitation" the person lands here: move focus to the confirmation so it is announced and the next step is obvious.
  const ready = !loading && !access.loading && !!onboarding;
  useEffect(() => { if (invited && ready) noticeRef.current?.focus(); }, [invited, ready]);
  const refresh = () => { void reload(); void loadRow(); };
  const name = member ? personName(member, locale) : (ar ? "الطبيب" : "Clinician");
  const shell = (body: React.ReactNode, intro?: string, actions?: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={[{ label: name }]} title={name} intro={intro} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || loading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (error || !onboarding || !detail) return shell(<ErrorNotice error={error ?? new Error(ar ? "تعذّر العثور على هذا الطبيب." : "This clinician could not be found.")} locale={locale} action="load" onRetry={refresh} />);

  const active = onboarding.status === "ACTIVE";
  const current: ClinicianTab = tab ?? (active ? "overview" : "setup");
  const go = (t: ClinicianTab, anchor?: string) => {
    setTab(t); router.replace(clinicianHref(locale, organizationId, practitionerId, t), { scroll: false });
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }));
  };
  const facts = { onboardingStatus: onboarding.status, membershipStatus: member?.status ?? "PENDING", providerCredentialing: row?.providerCredentialing ?? true };
  const setupStatus = providerSetupStatus(facts, locale);
  const credentials = row ? credentialSummary(row, locale) : null;
  const eligibility = providerCaseEligibility(facts, locale, readiness);
  const sections = readiness ? buildSetupSections({ locale, readiness, onboarding, member, detail, credentials, credentialStatuses: row?.credentialStatuses, access }) : null;
  const done = sections?.filter((s) => s.state === "complete").length ?? 0;
  const next = sections?.find((s) => s.state !== "complete" && s.state !== "unavailable");
  const tabs = [
    { key: "overview" as const, label: ar ? "نظرة عامة" : "Overview" },
    { key: "setup" as const, label: ar ? "الإعداد" : "Setup", attention: !active && !!next },
    ...(access.can("credential.view") ? [{ key: "credentials" as const, label: ar ? "الاعتمادات" : "Credentials" }] : []),
    { key: "relationships" as const, label: ar ? "العلاقات المهنية" : "Professional Relationships" },
    ...(access.can("price_list.view") ? [{ key: "prices" as const, label: ar ? "الأسعار" : "Prices" }] : []),
    ...(access.can("availability.view") ? [{ key: "schedule" as const, label: ar ? "الجدول" : "Schedule" }] : []),
  ];
  const shown = tabs.some((x) => x.key === current) ? current : "overview";
  const headerAction = !active && shown !== "setup" ? <button type="button" onClick={() => go("setup")}>{ar ? "متابعة الإعداد" : "Continue setup"}</button> : undefined;

  return shell(
    <>
      <p className="cc-clinician-badges"><span className="cc-engagement">{engagementLabel("provider", locale)}</span><StatusBadge tone={setupStatus.tone}>{setupStatus.label}</StatusBadge></p>
      <div ref={noticeRef} tabIndex={-1} className="cc-focus-target"><SuccessNotice>{notice || null}</SuccessNotice></div>
      {row && !row.providerCredentialing && <p className="cc-notice cc-notice-info" role="note">{ar ? "هذا سجل مستورد من استشاري مباشر ولم يُعتمد بعد لدى الجهة. ما زال اعتماد الحالات يتبع السجل المباشر." : "This organization record was imported from a Direct consultant and hasn't been adopted yet. Case approval still follows the Direct record."}{access.legacy.admin && <> <Link href={directClinicianHref(locale, practitionerId)}>{ar ? "فتح السجل المباشر" : "Open the Direct record"}</Link></>}</p>}
      <SectionTabs attentionLabel={ar ? "يحتاج إجراء" : "needs attention"} label={name} tabs={tabs} active={shown} onChange={(k) => go(k)} />
      <TabPanel id={shown}>
        {shown === "overview" && <>
          <Section title={ar ? "الملخص" : "Summary"} id="summary">
            <Facts items={[
              [ar ? "نوع الطبيب" : "Clinician type", clinicianTypeLabel(onboarding.clinicianType, locale)],
              [ar ? "الجهة" : "Organization", <Link key="org" href={ccHref(locale, `/providers/${organizationId}`)}><bdi>{detail.organization.displayName}</bdi></Link>],
              [ar ? "طريقة العمل" : "Engagement", engagementLabel("provider", locale)],
              [ar ? "العضوية في الجهة" : "Organization membership", member ? <StatusBadge key="m" tone={membershipStatusLabel(member.status, locale).tone}>{membershipStatusLabel(member.status, locale).label}</StatusBadge> : "—"],
              [ar ? "حالة الاعتمادات" : "Credential status", credentials ? <span key="c"><StatusBadge tone={credentials.tone}>{credentials.label}</StatusBadge>{credentials.detail && <span className="cc-row-sub">{credentials.detail}</span>}</span> : "—"],
              [ar ? "أهلية الحالات" : "Case eligibility", <span key="e"><StatusBadge tone={eligibility.tone}>{eligibility.label}</StatusBadge>{eligibility.detail && <span className="cc-row-sub">{eligibility.detail}</span>}</span>],
              [ar ? "الإعداد" : "Setup", sections ? <span key="s">{ar ? `${done} من ${sections.length} أقسام مكتملة` : `${done} of ${sections.length} sections complete`}{setupStatus.detail && <span className="cc-row-sub">{setupStatus.detail}</span>}</span> : "—"],
            ]} />
            {sections && readiness && <div className="cc-overview-readiness" aria-labelledby="readiness-title">
              <h3 id="readiness-title">{ar ? "الجاهزية التشغيلية" : "Operational readiness"}</h3>
              <p className="cc-meta">{ar ? "من فحص الجاهزية في النظام. حالة الاعتمادات وأهلية الحالات حقيقتان منفصلتان." : "From the platform's readiness check. Credential status and case eligibility are separate facts."}</p>
              <ReadinessSummary locale={locale} sections={sections} readiness={readiness} />
            </div>}
            {next && !active && (
              <div className="cc-next" aria-labelledby="next-title">
                <p id="next-title"><strong>{ar ? "ما يحتاج إلى متابعة" : "What needs attention"}</strong></p>
                <p>{next.title} — {stateBadge(next.state, locale).label}{next.remaining[0] ? `: ${next.remaining[0].label}` : ""}</p>
                <p className="cc-meta">{ar ? "المسؤول: " : "Responsible: "}{next.owner}</p>
                <button type="button" className="cc-secondary cc-small" onClick={() => go("setup")}>{ar ? "فتح الإعداد" : "Open setup"}</button>
              </div>
            )}
          </Section>
          <Section title={ar ? "الملف المهني" : "Professional Profile"} description={access.can("provider.update") ? undefined : (readiness?.clinicianProfileComplete ? (ar ? "مكتمل. تديره عمليات مقدمي الرعاية." : "Complete. Managed by Provider Operations.") : (ar ? "غير مكتمل بعد. تديره عمليات مقدمي الرعاية." : "Not complete yet. Managed by Provider Operations."))} id="profile">
            {access.can("provider.update") && <ProfessionalDetailsForm locale={locale} api={api} organizationId={organizationId} onboarding={onboarding} complete={!!readiness?.clinicianProfileComplete} canEdit onSaved={refresh} />}
          </Section>
          <TechnicalDetails locale={locale} items={[[ar ? "معرّف الطبيب" : "Practitioner ID", practitionerId], [ar ? "معرّف الحساب" : "Account ID", onboarding.ownerSubject], [ar ? "الحالة التقنية" : "Status code", onboarding.status], [ar ? "إصدار السجل" : "Record version", String(onboarding.version)]]} />
        </>}
        {shown === "setup" && (sections && readiness
          ? <ConsultantSetupChecklist locale={locale} sections={sections} api={api} onboarding={onboarding} readiness={readiness} member={member} organizationId={organizationId} organizationActive={detail.organization.status === "ACTIVE"} canActivate={access.can("provider.activate")}
              onGo={(t: SetupTab, anchor) => go(t, anchor)} onChanged={(n) => { setNotice(n); refresh(); }} />
          : <ErrorNotice error={new Error(ar ? "تعذّر التحقق من حالة الإعداد الآن. لم يتغير شيء." : "Setup status couldn't be checked right now. Nothing has changed.")} locale={locale} action="load" onRetry={refresh} />)}
        {shown === "credentials" && <Section title={ar ? "الاعتمادات المطلوبة" : "Required credentials"} description={ar ? "يراجع كل اعتماد مراجع مستقل في «مراجعة التراخيص والمؤهلات». حالة الاعتماد لا تعني الأهلية لاستقبال الحالات." : "Each credential is checked by an independent reviewer in Credential Reviews. A verified credential does not by itself make the clinician eligible for cases."} id="creds">
          <CredentialRequirements locale={locale} api={api} organizationId={organizationId} practitionerId={practitionerId} canSubmit={access.can("credential.submit")} canReview={access.can("credential.review")} onChanged={refresh} legacy={onboarding.status === "LEGACY_UNREVIEWED" || (!!row && !row.providerCredentialing)} />
        </Section>}
        {shown === "relationships" && <PracticeRelationships locale={locale} api={api} detail={detail} practitionerId={practitionerId} clinicianType={onboarding.clinicianType} canManage={access.can("provider.relationship.manage")} onChanged={refresh} />}
        {shown === "prices" && <PricingManagement locale={locale} organizationId={organizationId} practitionerId={practitionerId} organizationName={row?.organizationName} onChanged={refresh} />}
        {shown === "schedule" && <AvailabilityManagement locale={locale} organizationId={organizationId} practitionerId={practitionerId} onChanged={refresh} />}
      </TabPanel>
    </>,
    `${clinicianTypeLabel(onboarding.clinicianType, locale)} · ${detail.organization.displayName}`,
    headerAction,
  );
}
