"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { ccHref } from "./control-center-nav";
import { ActionMenu, ErrorNotice, Facts, Section, SectionTabs, StatusBadge, SuccessNotice, TabPanel, TechnicalDetails } from "./cc-ui";
import { clinicianStatusLabel, membershipStatusLabel, personRoleLabel, type SetupArea } from "./admin-labels";
import { personName } from "./provider-directory";
import { ActivationPanel, CredentialRequirements, PracticeRelationships, ProfessionalDetailsForm, ReadinessChecklist, SetupIssues, activationUnavailable, issuesFor, readinessSummary, useClinician } from "./consultant-setup";
import { PricingManagement } from "./PricingManagement";
import { AvailabilityManagement } from "./AvailabilityManagement";
import { firstOpenStep, setupHref } from "./ConsultantOnboardingWizard";

export type ConsultantTab = "overview" | "credentials" | "relationships" | "pricing" | "availability" | "readiness";

/** One consultant's workspace: everyday management in sections, with the setup wizard only for what is still missing. */
export function ConsultantWorkspace({ locale, organizationId, practitionerId, initialTab }: { locale: Locale; organizationId: string; practitionerId: string; initialTab?: ConsultantTab }) {
  const ar = locale === "ar";
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const { api, detail, onboarding, readiness, member, loading, error, reload } = useClinician(organizationId, practitionerId);
  const [tab, setTab] = useState<ConsultantTab>(initialTab ?? "overview");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState<unknown>(null);
  const change = (t: ConsultantTab) => { setTab(t); setNotice(""); router.replace(ccHref(locale, `/providers/consultants/${organizationId}/${practitionerId}?tab=${t}`), { scroll: false }); };
  const name = member ? personName(member, locale) : (ar ? "الطبيب" : "Clinician");
  const crumbs = [{ label: name }];
  const shell = (body: React.ReactNode, intro?: string, actions?: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={crumbs} title={name} intro={intro} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (error || !onboarding || !detail) return shell(<ErrorNotice error={error ?? new Error(ar ? "تعذّر العثور على هذا الاستشاري." : "This consultant could not be found.")} locale={locale} action="load" onRetry={() => void reload()} />);

  const status = clinicianStatusLabel(onboarding.status, locale);
  const active = onboarding.status === "ACTIVE";
  const tabForArea: Record<SetupArea, ConsultantTab> = { details: "overview", organization: "overview", professional: "credentials", working: "pricing" };
  const activateMembership = async () => {
    if (!member) return; setBusy(true); setActionError(null);
    try { await api(`/admin/providers/${organizationId}/members/${encodeURIComponent(member.subject)}/activate?revision=${member.revision}`, { method: "POST", body: { reason: ar ? "تفعيل العضوية من صفحة الاستشاري" : "Membership activated from the consultant workspace" } }); setNotice(ar ? "أصبحت العضوية نشطة." : "Membership is now active."); await reload(); }
    catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const actions = <>
    {!active && <Link className="cc-primary" href={setupHref(locale, organizationId, practitionerId, firstOpenStep(readiness, onboarding.status))}>{ar ? "متابعة الإعداد" : "Continue setup"}</Link>}
    <ActionMenu label={ar ? "إجراءات أخرى" : "More actions"} actions={[
      ...(access.can("provider.update") ? [{ label: ar ? "تعديل البيانات المهنية" : "Edit professional details", onSelect: () => change("credentials") }] : []),
      ...(access.can("credential.submit") ? [{ label: ar ? "إضافة اعتماد" : "Add credential", onSelect: () => change("credentials") }] : []),
      ...(access.can("price_list.view") ? [{ label: ar ? "تحديث الأسعار" : "Update pricing", onSelect: () => change("pricing") }] : []),
      ...(access.can("availability.view") ? [{ label: ar ? "إدارة المواعيد" : "Manage availability", onSelect: () => change("availability") }] : []),
      { label: ar ? "فتح المؤسسة" : "Open organization", onSelect: () => undefined, href: ccHref(locale, `/providers/${organizationId}`) },
    ]} />
  </>;
  const tabs = [
    { key: "overview" as const, label: ar ? "نظرة عامة" : "Overview" },
    { key: "credentials" as const, label: ar ? "الاعتمادات" : "Credentials", attention: issuesFor(readiness, "professional", locale).length > 0 },
    { key: "relationships" as const, label: ar ? "علاقات العيادة" : "Practice relationships" },
    ...(access.can("price_list.view") ? [{ key: "pricing" as const, label: ar ? "الأسعار" : "Pricing", attention: !!readiness && readiness.pricingSetupRequired && !readiness.pricingSetupComplete }] : []),
    ...(access.can("availability.view") ? [{ key: "availability" as const, label: ar ? "الجدول" : "Schedule", attention: !!readiness && readiness.availabilitySetupRequired && !readiness.availabilitySetupComplete }] : []),
    { key: "readiness" as const, label: ar ? "الجاهزية" : "Readiness", attention: !!readiness && !readiness.readyForActivation && !active && !(activationUnavailable(readiness) && readiness.blockers.length === 1) },
  ];
  const current = tabs.some((t) => t.key === tab) ? tab : "overview";

  return shell(
    <>
      <p style={{ marginTop: -8, marginBottom: 18 }}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></p>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={actionError} locale={locale} />
      <SectionTabs attentionLabel={locale === "ar" ? "يحتاج إجراء" : "needs attention"} label={name} tabs={tabs} active={current} onChange={change} />
      <TabPanel id={current}>
        {current === "overview" && <>
          <Section title={ar ? "الملخص" : "Summary"} id="summary">
            <Facts items={[
              [ar ? "النوع" : "Type", personRoleLabel(onboarding.clinicianType, locale)],
              [ar ? "المؤسسة" : "Organization", <Link key="org" href={ccHref(locale, `/providers/${organizationId}`)}>{detail.organization.displayName}</Link>],
              [ar ? "العضوية" : "Membership", member ? <StatusBadge tone={membershipStatusLabel(member.status, locale).tone}>{membershipStatusLabel(member.status, locale).label}</StatusBadge> : "—"],
              [ar ? "دولة الترخيص" : "Licensing country", onboarding.jurisdiction ?? "—"],
              [ar ? "الجاهزية" : "Readiness", readiness ? (active ? (ar ? "نشط" : "Active") : readinessSummary(readiness, locale)) : "—"],
            ]} />
            <SetupIssues issues={issuesFor(readiness, "details", locale)} locale={locale} />
            {member?.status === "PENDING" && access.can("provider.member.invite") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void activateMembership()}>{ar ? "تفعيل العضوية" : "Activate membership"}</button>}
            <TechnicalDetails locale={locale} items={[[ar ? "معرّف الطبيب" : "Practitioner ID", practitionerId], [ar ? "معرّف الحساب" : "Account ID", onboarding.ownerSubject], [ar ? "الحالة التقنية" : "Status code", onboarding.status], [ar ? "إصدار السجل" : "Record version", String(onboarding.version)]]} />
          </Section>
        </>}
        {current === "credentials" && <>
          <SetupIssues issues={issuesFor(readiness, "professional", locale)} locale={locale} />
          <Section title={ar ? "الاعتمادات المطلوبة" : "Required credentials"} id="creds">
            <CredentialRequirements locale={locale} api={api} organizationId={organizationId} practitionerId={practitionerId} canSubmit={access.can("credential.submit")} canReview={access.can("credential.review")} onChanged={() => void reload()} />
          </Section>
          <Section title={ar ? "البيانات المهنية" : "Professional details"} id="prof">
            <ProfessionalDetailsForm locale={locale} api={api} organizationId={organizationId} onboarding={onboarding} complete={!!readiness?.clinicianProfileComplete} canEdit={access.can("provider.update")} onSaved={() => void reload()} />
          </Section>
        </>}
        {current === "relationships" && <PracticeRelationships locale={locale} api={api} detail={detail} practitionerId={practitionerId} clinicianType={onboarding.clinicianType} canManage={access.can("provider.relationship.manage")} onChanged={() => void reload()} />}
        {current === "pricing" && <PricingManagement locale={locale} organizationId={organizationId} practitionerId={practitionerId} onChanged={() => void reload()} />}
        {current === "availability" && <AvailabilityManagement locale={locale} organizationId={organizationId} practitionerId={practitionerId} onChanged={() => void reload()} />}
        {current === "readiness" && <>
          {readiness && <ReadinessChecklist locale={locale} readiness={readiness} onGoTo={(area) => change(tabForArea[area])} />}
          <Section title={ar ? "التفعيل" : "Activation"} id="activate">
            <ActivationPanel locale={locale} api={api} organizationId={organizationId} onboarding={onboarding} readiness={readiness} organizationActive={detail.organization.status === "ACTIVE"} canActivate={access.can("provider.activate")} onActivated={() => { setNotice(ar ? "تم تفعيل الاستشاري." : "Consultant activated."); void reload(); }} />
          </Section>
        </>}
      </TabPanel>
    </>,
    `${personRoleLabel(onboarding.clinicianType, locale)} · ${detail.organization.displayName}`,
    actions,
  );
}
