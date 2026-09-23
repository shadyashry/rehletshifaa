"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { ActionMenu, EmptyState, ErrorNotice, Facts, Section, SectionTabs, StatusBadge, SuccessNotice, TabPanel, TechnicalDetails } from "./cc-ui";
import { membershipStatusLabel, organizationStatusLabel, personRoleLabel, type Tone } from "./admin-labels";
import { orgTypeLabel } from "./control-center-copy";
import { CLINICIAN_ROLES, PRACTICE_ROLES, personName, type Member, type ProviderDetail } from "./provider-directory";
import { ActivationUnavailable, activationUnavailable, type Readiness } from "./consultant-setup";
import { InvitePersonDialog, RelationshipDialog, memberActions, relationshipSummary, useMemberMutations } from "./ProviderPeople";

export type OrganizationTab = "overview" | "people" | "setup";
const PEOPLE_GROUPS: { role: string; label: [string, string] }[] = [
  { role: "CONSULTANT", label: ["Consultants", "الاستشاريون"] }, { role: "ASSOCIATE_DOCTOR", label: ["Associate doctors", "الأطباء المشاركون"] },
  { role: "PRACTICE_MANAGER", label: ["Practice managers", "مديرو العيادة"] }, { role: "CONSULTANT_ASSISTANT", label: ["Consultant assistants", "مساعدو الاستشاريين"] },
  { role: "ORGANIZATION_OWNER", label: ["Organization owners", "مالكو المؤسسة"] },
];

/** One organization's workspace: what it is, who works there, and what remains before it can be activated. */
export function ProviderOrganizationDetail({ locale, organizationId, initialTab }: { locale: Locale; organizationId: string; initialTab?: OrganizationTab }) {
  const ar = locale === "ar";
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<OrganizationTab>(initialTab ?? "overview");
  const [readiness, setReadiness] = useState<Record<string, Readiness | "error">>({});
  const [inviting, setInviting] = useState(false); const [relating, setRelating] = useState<Member | null>(null);
  const [activating, setActivating] = useState(false); const [activationError, setActivationError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(null); try { setDetail(await api<ProviderDetail>(`/admin/providers/${organizationId}`)); } catch (e) { setError(e); } }, [api, organizationId]);
  const canView = access.can("provider.view");
  useEffect(() => { if (user && canView) void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile?.sub, canView, load]);
  const mutations = useMemberMutations(locale, api, load);
  // Setup progress needs every clinician's real backend readiness, never a client-side guess.
  useEffect(() => {
    if (!detail) return;
    let live = true;
    const clinicians = detail.members.filter((m) => m.kind === "CLINICIAN" && m.practitionerId);
    void Promise.all(clinicians.map((m) => api<Readiness>(`/admin/providers/${organizationId}/clinicians/${m.practitionerId}/readiness`).then((r) => [m.practitionerId!, r] as const).catch(() => [m.practitionerId!, "error" as const] as const)))
      .then((rows) => { if (live) setReadiness(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [detail, api, organizationId]);
  const change = (t: OrganizationTab) => { setTab(t); router.replace(ccHref(locale, `/providers/${organizationId}?tab=${t}`), { scroll: false }); };
  const name = detail?.organization.displayName ?? (ar ? "المؤسسة" : "Organization");
  const crumbs = ccCrumbs(locale, { label: ar ? "المؤسسات" : "Organizations", href: ccHref(locale, "/providers") }, { label: name });
  const canAddClinician = access.can("provider.clinician.invite"), canAddPractice = access.can("provider.practice_staff.manage");
  const actions = detail && (canAddClinician || canAddPractice) ? <>
    {canAddClinician && <Link className="cc-primary" href={ccHref(locale, `/providers/onboarding/new?org=${organizationId}`)}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link>}
    {canAddPractice && <button type="button" className="cc-secondary" onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden />{ar ? "إضافة عضو لفريق العيادة" : "Add practice team member"}</button>}
  </> : undefined;
  const shell = (body: React.ReactNode, intro?: string) => <ControlCenterShell locale={locale} active="organizations" crumbs={crumbs} title={name} intro={intro} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || access.loading || (canView && !detail && !error)) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canView) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You do not have access to this area"} />);
  if (error || !detail) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);

  const org = detail.organization;
  const status = organizationStatusLabel(org.status, locale);
  const clinicians = detail.members.filter((m) => m.kind === "CLINICIAN");
  const staff = detail.members.filter((m) => m.kind !== "CLINICIAN");
  const tabs = [
    { key: "overview" as const, label: ar ? "نظرة عامة" : "Overview" },
    { key: "people" as const, label: ar ? "الأشخاص" : "People", count: detail.members.filter((m) => m.status !== "REVOKED").length },
    { key: "setup" as const, label: ar ? "الإعداد والتفعيل" : "Setup & activation", attention: org.status !== "ACTIVE" },
  ];

  const activate = async () => {
    setBusy(true); setActivationError(null);
    try { await api(`/admin/providers/${organizationId}/activate?version=${org.version}`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }); setActivating(false); mutations.setNotice(ar ? "تم تفعيل المؤسسة." : "Organization activated."); await load(); }
    catch (e) { setActivationError(e); } finally { setBusy(false); }
  };

  const loaded = clinicians.filter((m) => m.practitionerId).map((m) => readiness[m.practitionerId!]).filter((r): r is Readiness => !!r && r !== "error");
  const allLoaded = clinicians.length > 0 && loaded.length === clinicians.filter((m) => m.practitionerId).length;
  const owner = detail.members.find((m) => m.roles.includes("ORGANIZATION_OWNER"));
  const outstandingCredentials = loaded.filter((r) => !r.requiredCredentialsVerified || !r.mandatoryCredentialsUnexpired).length;
  const workingOutstanding = loaded.filter((r) => !r.pricingSetupComplete || (r.availabilitySetupRequired && !r.availabilitySetupComplete)).length;
  const commercialOutstanding = loaded.filter((r) => r.blockers.some((b) => b.code === "COMMERCIAL_ACCEPTANCE_MISSING")).length;
  const readyClinicians = loaded.filter((r) => r.readyForActivation).length;
  const orgActive = org.status === "ACTIVE";
  // Provider activation needs at least one clinician ready to activate; when every clinician is blocked by a step that
  // is not in this release, activation cannot complete (UX-0 Decision D, case 3).
  const releaseBlocked = loaded.length > 0 && loaded.every(activationUnavailable);
  const readinessFailed = clinicians.some((m) => m.practitionerId && readiness[m.practitionerId] === "error");
  const ownerActive = owner?.status === "ACTIVE";
  const waitingFor = [
    ...(!ownerActive ? [ar ? "مالك مؤسسة نشط" : "An active organization owner"] : []),
    ...(readyClinicians === 0 ? [ar ? "طبيب واحد على الأقل جاهز للتفعيل" : "At least one clinician who is ready to activate"] : []),
  ];
  const step = (key: string, title: string, tone: Tone, state: string, body: React.ReactNode, action?: React.ReactNode) => (
    <div className="cc-requirement" key={key}><div><h3>{title}</h3><div className="cc-meta">{body}</div></div><div className="cc-row-actions"><StatusBadge tone={tone}>{state}</StatusBadge>{action}</div></div>
  );
  const done = ar ? "مكتمل" : "Complete", todo = ar ? "يحتاج إجراء" : "Needs action", checking = ar ? "جارٍ التحقق" : "Checking";

  return shell(
    <>
      <p style={{ marginTop: -8, marginBottom: 18 }}><StatusBadge tone={status.tone}>{status.label}</StatusBadge></p>
      <SuccessNotice>{mutations.notice || null}</SuccessNotice>
      <ErrorNotice error={mutations.error} locale={locale} />
      <SectionTabs attentionLabel={locale === "ar" ? "يحتاج إجراء" : "needs attention"} label={name} tabs={tabs} active={tab} onChange={change} />
      <TabPanel id={tab}>
        {tab === "overview" && <Section title={ar ? "الملخص" : "Summary"} id="summary">
          <Facts items={[
            [ar ? "الاسم القانوني" : "Legal name", org.legalName], [ar ? "النوع" : "Type", orgTypeLabel(org.type, locale)], [ar ? "الدولة" : "Country", org.countryCode],
            [ar ? "المنطقة الزمنية" : "Time zone", <bdi key="tz" dir="ltr">{org.timeZone}</bdi>], [ar ? "العملة" : "Currency", org.defaultCurrency],
            [ar ? "الأطباء" : "Clinicians", String(clinicians.filter((m) => m.status !== "REVOKED").length)], [ar ? "فريق العيادة" : "Practice team", String(staff.filter((m) => m.status !== "REVOKED").length)],
          ]} />
          <TechnicalDetails locale={locale} items={[[ar ? "معرّف المؤسسة" : "Organization ID", org.id], [ar ? "حالة الربط القديم" : "Legacy mapping", org.legacyMappingStatus ?? "—"], [ar ? "إصدار السجل" : "Record version", String(org.version)]]} />
        </Section>}

        {tab === "people" && (detail.members.length === 0 ? <EmptyState title={ar ? "لا يوجد أشخاص في هذه المؤسسة بعد" : "Nobody works here yet"} body={ar ? "أضف أول استشاري أو عضو في فريق العيادة." : "Add the first consultant or practice team member."} action={actions} /> : PEOPLE_GROUPS.map((g) => {
          const people = detail.members.filter((m) => m.roles.includes(g.role));
          if (!people.length) return null;
          return (
            <Section key={g.role} title={g.label[ar ? 1 : 0]} id={`people-${g.role}`}>
              <ul className="cc-list" aria-label={g.label[ar ? 1 : 0]}>
                {people.map((m) => {
                  const s = membershipStatusLabel(m.status, locale); const rel = relationshipSummary(detail, m, locale);
                  const clinician = m.practitionerId && m.roles.some((r) => CLINICIAN_ROLES.includes(r));
                  return (
                    <li key={m.subject}>
                      <span>{clinician ? <Link className="cc-row-title" href={ccHref(locale, `/providers/consultants/${organizationId}/${m.practitionerId}`)}>{personName(m, locale)}</Link> : <strong>{personName(m, locale)}</strong>}
                        <span className="cc-row-sub">{m.roles.filter((r) => r !== g.role && [...CLINICIAN_ROLES, ...PRACTICE_ROLES].includes(r)).map((r) => personRoleLabel(r, locale)).join(" · ")}</span></span>
                      <span className="cc-meta">{rel || "—"}</span>
                      <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>
                      <span className="cc-row-actions"><ActionMenu label={(ar ? "إجراءات: " : "Actions: ") + personName(m, locale)} actions={memberActions(locale, access, detail, m, { activate: () => void mutations.setActive(organizationId, m, true), deactivate: () => void mutations.setActive(organizationId, m, false), relate: () => setRelating(m) })} /></span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          );
        }))}

        {tab === "setup" && <>
          <p className="cc-meta" style={{ marginBottom: 14 }}>{ar ? "ما تحتاجه المؤسسة قبل تفعيلها. الحالة مأخوذة من جاهزية كل طبيب في النظام." : "What the organization needs before activation. Status comes from each clinician's readiness in the platform."}</p>
          {step("owner", ar ? "مالك المؤسسة" : "Organization owner", ownerActive ? "success" : "warning", ownerActive ? done : todo, owner ? (ownerActive ? personName(owner, locale) : (ar ? `${personName(owner, locale)} — العضوية غير نشطة بعد` : `${personName(owner, locale)} — membership not active yet`)) : (ar ? "لم يُعيَّن بعد" : "Not assigned yet"),
            !ownerActive && <button type="button" className="cc-secondary cc-small" onClick={() => change("people")}>{ar ? "فتح الأشخاص" : "Open People"}</button>)}
          {step("clinical", ar ? "الفريق الطبي" : "Clinical team", clinicians.length ? "success" : "warning", clinicians.length ? done : todo, ar ? `${clinicians.length} طبيب` : `${clinicians.length} clinician(s)`, canAddClinician && <Link className="cc-secondary cc-small" href={ccHref(locale, `/providers/onboarding/new?org=${organizationId}`)}>{ar ? "إضافة استشاري" : "Add consultant"}</Link>)}
          {step("practice", ar ? "فريق العيادة" : "Practice team", staff.length ? "success" : "warning", staff.length ? done : todo, ar ? `${staff.length} عضو` : `${staff.length} member(s)`)}
          {step("credentials", ar ? "الاعتمادات" : "Credentials", !allLoaded ? "neutral" : outstandingCredentials ? "warning" : "success", !allLoaded ? checking : outstandingCredentials ? todo : done, !allLoaded ? (ar ? "جارٍ التحقق من الأطباء…" : "Checking clinicians…") : outstandingCredentials ? (ar ? `${outstandingCredentials} طبيب بحاجة إلى اعتمادات موثّقة` : `${outstandingCredentials} clinician(s) still need verified credentials`) : (ar ? "كل الاعتمادات موثّقة" : "All credentials verified"),
            outstandingCredentials > 0 && <Link className="cc-secondary cc-small" href={ccHref(locale, `/credentials?org=${organizationId}`)}>{ar ? "فتح المراجعات" : "Open reviews"}</Link>)}
          {step("working", ar ? "الأسعار والمواعيد" : "Prices & availability", !allLoaded ? "neutral" : workingOutstanding ? "warning" : "success", !allLoaded ? checking : workingOutstanding ? todo : done, !allLoaded ? "—" : workingOutstanding ? (ar ? `${workingOutstanding} طبيب بلا أسعار أو مواعيد مكتملة` : `${workingOutstanding} clinician(s) without complete prices or availability`) : (ar ? "مكتمل لكل الأطباء" : "Complete for every clinician"))}
          {commercialOutstanding > 0 && releaseBlocked
            ? step("commercial", ar ? "القبول التجاري والقانوني" : "Commercial & legal acceptance", "neutral", ar ? "غير متاح بعد" : "Not available yet", ar ? "هذه الخطوة غير متاحة في الإصدار الحالي، ولا يمكن لأحد إكمالها الآن." : "This step isn't available in the current release, so nobody can complete it yet.")
            : step("commercial", ar ? "القبول التجاري والقانوني" : "Commercial & legal acceptance", !allLoaded ? "neutral" : commercialOutstanding ? "warning" : "success", !allLoaded ? checking : commercialOutstanding ? todo : done, !allLoaded ? "—" : commercialOutstanding ? (ar ? `${commercialOutstanding} طبيب بانتظار القبول` : `${commercialOutstanding} clinician(s) awaiting acceptance`) : (ar ? "لا يوجد ما ينتظر" : "Nothing outstanding"))}
          <Section title={ar ? "تفعيل المؤسسة" : "Activate organization"} id="activate">
            <ErrorNotice error={activationError} locale={locale} />
            {orgActive ? <SuccessNotice>{ar ? "المؤسسة نشطة." : "The organization is active."}</SuccessNotice>
              : clinicians.length > 0 && !allLoaded && !readinessFailed ? <p role="status" className="cc-meta">{ar ? "جارٍ التحقق من جاهزية الأطباء…" : "Checking clinicians' readiness…"}</p>
              : readinessFailed ? <p className="cc-meta">{ar ? "تعذّر التحقق من جاهزية بعض الأطباء، لذا لا يُعرض التفعيل. حدّث الصفحة لاحقًا." : "Some clinicians' readiness couldn't be checked, so activation isn't offered. Refresh to try again."}</p>
              : releaseBlocked ? <ActivationUnavailable locale={locale} subject="organization" />
              : <>
                {waitingFor.length > 0 && <div id="org-activation-waiting"><p><strong>{ar ? "غير جاهزة للتفعيل" : "Not ready to activate"}</strong></p><p className="cc-meta">{ar ? "بانتظار:" : "Waiting for:"}</p><ul>{waitingFor.map((w) => <li key={w}>{w}</li>)}</ul></div>}
                {!access.can("provider.activate") ? <p className="cc-meta">{ar ? "يفعّل مدير عمليات مقدمي الرعاية المؤسسة عندما تصبح جاهزة." : "A provider operations manager activates the organization once it's ready."}</p>
                  : activating ? <div className="cc-card" role="group" aria-label={ar ? "تأكيد التفعيل" : "Confirm activation"}><p>{ar ? `تفعيل ${name}؟ بعد التفعيل يمكن للمؤسسة استقبال الحالات لأطبائها المفعّلين.` : `Activate ${name}? Once active, the organization can receive cases for its activated clinicians.`}</p><div className="cc-form-actions"><button type="button" disabled={busy} onClick={() => void activate()}>{ar ? "نعم، فعّل المؤسسة" : "Yes, activate"}</button><button type="button" className="cc-secondary" onClick={() => setActivating(false)}>{ar ? "إلغاء" : "Cancel"}</button></div></div>
                  : <button type="button" disabled={waitingFor.length > 0} aria-describedby={waitingFor.length ? "org-activation-waiting" : undefined} onClick={() => setActivating(true)}>{ar ? "تفعيل المؤسسة" : "Activate organization"}</button>}
              </>}
          </Section>
        </>}
      </TabPanel>
      {inviting && <InvitePersonDialog locale={locale} api={api} organizations={[org]} initialOrg={org.id} roles={PRACTICE_ROLES} onClose={() => setInviting(false)} onInvited={() => { setInviting(false); mutations.setNotice(ar ? "أُرسلت الدعوة." : "Invitation sent."); change("people"); void load(); }} />}
      {relating && <RelationshipDialog locale={locale} api={api} detail={detail} member={relating} onClose={() => setRelating(null)} onSaved={() => { setRelating(null); mutations.setNotice(ar ? "تم حفظ العلاقة." : "Relationship saved."); void load(); }} />}
    </>,
    `${orgTypeLabel(org.type, locale)} · ${org.countryCode} · ${org.defaultCurrency}`,
  );
}
