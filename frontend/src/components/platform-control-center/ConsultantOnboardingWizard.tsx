"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { EmptyState, ErrorNotice, Facts, Field, SectionTabs, Section, StatusBadge, SuccessNotice, TabPanel, WizardProgress } from "./cc-ui";
import { CARE_AREAS, careAreaLabel, clinicianStatusLabel, membershipStatusLabel, personRoleLabel, type SetupArea } from "./admin-labels";
import { personName, useProviderDirectory, type ProviderDetail } from "./provider-directory";
import { ActivationPanel, CredentialRequirements, PracticeRelationships, ProfessionalDetailsForm, ReadinessChecklist, SetupIssues, issuesFor, readinessSummary, useClinician, type Readiness } from "./consultant-setup";
import { PricingManagement } from "./PricingManagement";
import { AvailabilityManagement } from "./AvailabilityManagement";

export type WizardStep = "details" | "professional" | "working" | "review";
const STEPS: WizardStep[] = ["details", "professional", "working", "review"];

const stepCopy = (locale: Locale): Record<WizardStep, { label: string; title: string; intro: string }> => locale === "ar" ? {
  details: { label: "بيانات الاستشاري", title: "بيانات الاستشاري", intro: "من هو الاستشاري وأين سيعمل. نرسل له دعوة آمنة لإنشاء كلمة المرور." },
  professional: { label: "الإعداد المهني", title: "الإعداد المهني", intro: "البيانات المهنية والاعتمادات المطلوبة وعلاقات العيادة." },
  working: { label: "إعداد العمل", title: "إعداد العمل", intro: "الأسعار والمواعيد التي يحتاجها الاستشاري لاستقبال الحالات." },
  review: { label: "المراجعة والتفعيل", title: "المراجعة والتفعيل", intro: "راجع ما اكتمل وما بقي، ثم فعّل الاستشاري." },
} : {
  details: { label: "Consultant details", title: "Consultant details", intro: "Who the consultant is and where they will work. We send them a secure invitation to set their password." },
  professional: { label: "Professional setup", title: "Professional setup", intro: "Professional details, required credentials and practice relationships." },
  working: { label: "Working setup", title: "Working setup", intro: "The prices and availability the consultant needs before they can take cases." },
  review: { label: "Review & activate", title: "Review & activate", intro: "Check what is complete and what remains, then activate the consultant." },
};

const areaStep: Record<SetupArea, WizardStep> = { details: "details", organization: "details", professional: "professional", working: "working" };
export const setupHref = (locale: Locale, orgId: string, practitionerId: string, step?: WizardStep) => ccHref(locale, `/providers/consultants/${orgId}/${practitionerId}/setup${step ? `?step=${step}` : ""}`);
export const consultantHref = (locale: Locale, orgId: string, practitionerId: string, tab?: string) => ccHref(locale, `/providers/consultants/${orgId}/${practitionerId}${tab ? `?tab=${tab}` : ""}`);

function stepDone(step: WizardStep, r: Readiness | null, status?: string) {
  if (!r) return false;
  if (step === "details") return r.identityProvisioned && r.organizationMembershipActive;
  if (step === "professional") return r.clinicianProfileComplete && r.requiredCredentialsSubmitted && r.requiredRelationshipsComplete;
  if (step === "working") return (!r.pricingSetupRequired || r.pricingSetupComplete) && (!r.availabilitySetupRequired || r.availabilitySetupComplete);
  return status === "ACTIVE";
}
/** Where to resume: the first milestone the backend still reports as incomplete. */
export function firstOpenStep(r: Readiness | null, status?: string): WizardStep { return STEPS.find((s) => !stepDone(s, r, status)) ?? "review"; }

export function ConsultantOnboardingWizard({ locale, organizationId, practitionerId, initialStep, initialOrg }: { locale: Locale; organizationId?: string; practitionerId?: string; initialStep?: WizardStep; initialOrg?: string }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const title = ar ? "إضافة استشاري" : "Add consultant";
  const crumbs = [{ label: title }];
  if (authLoading) return <ControlCenterShell locale={locale} active="consultants" crumbs={crumbs} title={title}><p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="consultants" crumbs={crumbs} title={title}><button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button></ControlCenterShell>;
  if (!organizationId || !practitionerId) return <NewConsultant locale={locale} initialOrg={initialOrg} />;
  return <ResumeSetup locale={locale} organizationId={organizationId} practitionerId={practitionerId} initialStep={initialStep} />;
}

/** Step 1 for a new consultant. Offers the two real onboarding routes only when the caller can use both. */
function NewConsultant({ locale, initialOrg }: { locale: Locale; initialOrg?: string }) {
  const ar = locale === "ar";
  const router = useRouter();
  const api = useAdminApi();
  const access = useControlCenterAccess();
  const canProvider = access.can("provider.clinician.invite") && access.can("provider.view");
  const canDirect = access.legacy.canManage;
  const directory = useProviderDirectory(canProvider);
  const [route, setRoute] = useState<"provider" | "direct">("provider");
  useEffect(() => { if (!access.loading && !canProvider && canDirect) setRoute("direct"); }, [access.loading, canProvider, canDirect]);
  const [form, setForm] = useState({ org: initialOrg ?? "", role: "CONSULTANT", name: "", email: "", language: locale as string, specialty: "", careArea: "", reason: ar ? "إضافة استشاري جديد" : "New consultant onboarding" });
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<{ id: string; organizationId: string; status: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const required = (v: string) => touched && !v.trim() ? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined;
  const emailError = touched && form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? (ar ? "أدخل بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address.") : required(form.email);
  const orgs = directory.details.map((d) => d.organization);
  useEffect(() => { if (!form.org && orgs.length === 1) setForm((f) => ({ ...f, org: orgs[0].id })); }, [orgs, form.org]);

  const finishProviderInvite = async (orgId: string, subject: string) => {
    const detail = await api<ProviderDetail>(`/admin/providers/${orgId}`);
    const member = detail.members.find((m) => m.subject === subject && m.practitionerId);
    if (!member?.practitionerId) throw new Error(ar ? "أُرسلت الدعوة لكن تعذّر العثور على ملف الاستشاري. افتحه من قائمة الاستشاريين." : "The invitation was sent but the consultant's record could not be found. Open it from the consultants list.");
    router.push(setupHref(locale, orgId, member.practitionerId, "professional"));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); setError(null);
    const base = !form.name.trim() || !form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email);
    if (route === "provider" && (base || !form.org || !form.reason.trim())) return;
    if (route === "direct" && (base || !form.specialty.trim() || !form.careArea)) return;
    setBusy(true);
    try {
      if (route === "direct") {
        const created = await api<{ id: string }>("/admin/practitioners", { method: "POST", body: { legalName: form.name.trim(), displayName: form.name.trim(), email: form.email.trim(), locale: form.language, specialty: form.specialty.trim(), careCategory: form.careArea, practitionerType: "CONSULTANT", contractStatus: "ACTIVE", availabilityStatus: "UNAVAILABLE", expectedReviewHours: 48 } });
        router.push(ccHref(locale, `/providers/consultants/direct/${created.id}?tab=approval&created=1`));
        return;
      }
      const op = await api<{ id: string | null; organizationId: string; subject: string | null; status: string }>(`/admin/providers/${form.org}/members/invite`, { method: "POST", body: { name: form.name.trim(), email: form.email.trim(), role: form.role, locale: form.language, reason: form.reason.trim() } });
      if (op.status === "COMPLETED" && op.subject) await finishProviderInvite(form.org, op.subject);
      else if (op.id) setPending({ id: op.id, organizationId: form.org, status: op.status });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const retry = async () => {
    if (!pending) return; setBusy(true); setError(null);
    try {
      const op = await api<{ subject: string | null; status: string }>(`/admin/providers/${pending.organizationId}/identity-operations/${pending.id}/reconcile`, { method: "POST", body: { reason: form.reason || "Retry consultant invitation" } });
      if (op.status === "COMPLETED" && op.subject) await finishProviderInvite(pending.organizationId, op.subject);
      else setPending({ ...pending, status: op.status });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const steps = stepCopy(locale);
  const title = ar ? "إضافة استشاري" : "Add consultant";
  const crumbs = [{ label: title }];
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={crumbs} title={title} intro={ar ? "أربع خطوات قصيرة. يُحفظ كل ما تدخله فورًا، ويمكنك المتابعة لاحقًا." : "Four short steps. Everything you enter is saved as you go, so you can finish later."}>{body}</ControlCenterShell>;
  if (access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!canProvider && !canDirect) return shell(<EmptyState title={ar ? "لا يمكنك إضافة استشاريين" : "You can't add consultants"} body={ar ? "اطلب من مسؤول الوصول صلاحية دعوة الأطباء." : "Ask your access administrator for permission to invite clinicians."} />);

  return shell(
    <>
      <WizardProgress locale={locale} current={0} steps={STEPS.map((s) => ({ key: s, label: steps[s].label }))} />
      <div className="cc-wizard">
        <form className="cc-wizard-body" onSubmit={submit} noValidate aria-labelledby="wizard-step-title">
          <h2 id="wizard-step-title" className="cc-wizard-step-title">{steps.details.title}</h2>
          <p className="cc-wizard-step-intro">{steps.details.intro}</p>
          <ErrorNotice error={error} locale={locale} />
          {pending && (
            <div className="cc-notice cc-notice-info" role="status">
              <div><p>{ar ? "طُلب إنشاء حساب الدخول لكنه لم يكتمل بعد. لم تُفقد أي بيانات." : "The sign-in account was requested but isn't finished yet. Nothing was lost."}</p></div>
              <button type="button" className="cc-secondary cc-small" disabled={busy} onClick={() => void retry()}>{ar ? "إكمال إنشاء الحساب" : "Finish account setup"}</button>
            </div>
          )}
          {canProvider && canDirect && (
            <fieldset className="cc-choices" style={{ border: 0, padding: 0 }}>
              <legend className="cc-field-label">{ar ? "أين سيعمل هذا الاستشاري؟" : "Where will this consultant work?"}</legend>
              <label className="cc-choice"><input type="radio" name="route" checked={route === "provider"} onChange={() => setRoute("provider")} /><span><strong>{ar ? "ضمن مؤسسة مقدم رعاية" : "In a provider organization"}</strong><small>{ar ? "يُعدّ باعتمادات وأسعار ومواعيد المؤسسة، ثم يُفعَّل." : "Set up with the organization's credentials, prices and availability, then activated."}</small></span></label>
              <label className="cc-choice"><input type="radio" name="route" checked={route === "direct"} onChange={() => setRoute("direct")} /><span><strong>{ar ? "مباشرة مع رحلة الشفاء" : "Directly with RehletShifaa"}</strong><small>{ar ? "يُعتمد لسير عمل الحالات الحالي بعد مراجعة اعتماده." : "Approved for the current case workflow after a credential check."}</small></span></label>
            </fieldset>
          )}
          <div className="cc-form-grid">
            {route === "provider" && <>
              <Field label={ar ? "المؤسسة" : "Organization"} required error={touched && !form.org ? (ar ? "اختر مؤسسة." : "Choose an organization.") : undefined}>
                <select value={form.org} onChange={set("org")} aria-required disabled={directory.loading}>
                  <option value="">{directory.loading ? (ar ? "جارٍ التحميل…" : "Loading…") : (ar ? "اختر مؤسسة" : "Choose an organization")}</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
                </select>
              </Field>
              <Field label={ar ? "نوع الطبيب" : "Clinician type"} required>
                <select value={form.role} onChange={set("role")}><option value="CONSULTANT">{personRoleLabel("CONSULTANT", locale)}</option><option value="ASSOCIATE_DOCTOR">{personRoleLabel("ASSOCIATE_DOCTOR", locale)}</option></select>
              </Field>
            </>}
            <Field label={ar ? "الاسم الكامل" : "Full name"} required error={required(form.name)}><input autoComplete="name" maxLength={160} value={form.name} onChange={set("name")} aria-required /></Field>
            <Field label={ar ? "بريد العمل" : "Work email"} hint={ar ? "تصل الدعوة الآمنة إلى هذا البريد." : "The secure invitation goes to this address."} required error={emailError}><input type="email" dir="ltr" inputMode="email" autoComplete="email" maxLength={254} value={form.email} onChange={set("email")} aria-required /></Field>
            {route === "direct" && <>
              <Field label={ar ? "التخصص" : "Speciality"} required error={required(form.specialty)}><input maxLength={120} value={form.specialty} onChange={set("specialty")} aria-required /></Field>
              <Field label={ar ? "مجال الرعاية" : "Care area"} required error={touched && !form.careArea ? (ar ? "اختر مجال الرعاية." : "Choose a care area.") : undefined}>
                <select value={form.careArea} onChange={set("careArea")} aria-required><option value="">{ar ? "اختر مجال الرعاية" : "Choose a care area"}</option>{CARE_AREAS.map((c) => <option key={c} value={c}>{careAreaLabel(c, locale)}</option>)}</select>
              </Field>
            </>}
            <Field label={ar ? "لغة الدعوة" : "Invitation language"} required><select value={form.language} onChange={set("language")}><option value="en">English</option><option value="ar">العربية</option></select></Field>
            {route === "provider" && <Field label={ar ? "ملاحظة لسجل التدقيق" : "Note for the audit trail"} hint={ar ? "تُحفظ مع الدعوة." : "Saved with the invitation."} required error={required(form.reason)}><input maxLength={500} value={form.reason} onChange={set("reason")} aria-required /></Field>}
          </div>
          <div className="cc-wizard-nav">
            <Link className="cc-secondary" href={ccHref(locale, "/providers/consultants")}>{ar ? "إلغاء" : "Cancel"}</Link>
            <div className="cc-push"><button disabled={busy}>{busy ? (ar ? "جارٍ إرسال الدعوة…" : "Sending invitation…") : (ar ? "إرسال الدعوة والمتابعة" : "Send invitation & continue")}</button></div>
          </div>
        </form>
        <aside className="cc-wizard-aside" aria-label={ar ? "ما الذي سيحدث" : "What happens next"}>
          <h2>{ar ? "ما الذي سيحدث" : "What happens next"}</h2>
          <ol className="cc-readiness" style={{ paddingInlineStart: 0 }}>
            <li>{ar ? "١. يستلم الاستشاري دعوة آمنة لإنشاء كلمة المرور." : "1. The consultant receives a secure invitation to set a password."}</li>
            <li>{route === "direct" ? (ar ? "٢. تسجّل مستند اعتماده وتقرر اعتماده للحالات." : "2. You record their credential and approve them for cases.") : (ar ? "٢. تضيف بياناته المهنية واعتماداته لمراجعتها." : "2. You add their professional details and credentials for review.")}</li>
            <li>{route === "direct" ? (ar ? "٣. تضبط قائمة أسعاره." : "3. You set their price list.") : (ar ? "٣. تضبط الأسعار والمواعيد، ثم تفعّله." : "3. You set prices and availability, then activate them.")}</li>
          </ol>
        </aside>
      </div>
    </>
  );
}

/** Steps 1–4 for an existing clinician. Each section saves on its own; the step only groups them. */
function ResumeSetup({ locale, organizationId, practitionerId, initialStep }: { locale: Locale; organizationId: string; practitionerId: string; initialStep?: WizardStep }) {
  const ar = locale === "ar";
  const router = useRouter();
  const access = useControlCenterAccess();
  const { api, detail, onboarding, readiness, member, loading, error, reload } = useClinician(organizationId, practitionerId);
  const [step, setStep] = useState<WizardStep>(initialStep ?? "professional");
  const [workTab, setWorkTab] = useState<"pricing" | "availability">("pricing");
  const [activating, setActivating] = useState(false); const [memberError, setMemberError] = useState<unknown>(null); const [notice, setNotice] = useState("");
  const [resumed, setResumed] = useState(!!initialStep);
  useEffect(() => { if (!resumed && onboarding && !loading) { setResumed(true); setStep(firstOpenStep(readiness, onboarding.status)); } }, [resumed, onboarding, readiness, loading]);
  const steps = stepCopy(locale);
  const name = member ? personName(member, locale) : "";
  const title = name ? (ar ? `إعداد ${name}` : `Set up ${name}`) : (ar ? "إعداد الاستشاري" : "Consultant setup");
  const crumbs = [...(name ? [{ label: name, href: consultantHref(locale, organizationId, practitionerId) }] : []), { label: ar ? "الإعداد" : "Setup" }];
  const go = (s: WizardStep) => { setStep(s); setNotice(""); router.replace(setupHref(locale, organizationId, practitionerId, s), { scroll: false }); requestAnimationFrame(() => document.getElementById("wizard-step-title")?.focus()); };
  const index = STEPS.indexOf(step);
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={crumbs} title={title} intro={ar ? "يُحفظ كل قسم فور حفظه. يمكنك المتابعة لاحقًا من صفحة الاستشاري." : "Each section saves as soon as you save it. You can finish later from the consultant's page."}>{body}</ControlCenterShell>;
  if (loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (error || !onboarding || !detail) return shell(<ErrorNotice error={error ?? new Error(ar ? "تعذّر العثور على هذا الاستشاري." : "This consultant could not be found.")} locale={locale} action="load" onRetry={() => void reload()} />);

  const activateMembership = async () => {
    if (!member) return; setActivating(true); setMemberError(null);
    try { await api(`/admin/providers/${organizationId}/members/${encodeURIComponent(member.subject)}/activate?revision=${member.revision}`, { method: "POST", body: { reason: ar ? "تفعيل العضوية أثناء إعداد الاستشاري" : "Membership activated during consultant setup" } }); setNotice(ar ? "أصبحت العضوية نشطة." : "Membership is now active."); await reload(); }
    catch (e) { setMemberError(e); } finally { setActivating(false); }
  };
  const status = clinicianStatusLabel(onboarding.status, locale);
  const orgActive = detail.organization.status === "ACTIVE";

  return shell(
    <>
      <WizardProgress locale={locale} current={index} onStep={(i) => go(STEPS[i])}
        steps={STEPS.map((s) => ({ key: s, label: steps[s].label, done: stepDone(s, readiness, onboarding.status), attention: s !== step && issuesFor(readiness, s === "details" ? "details" : s === "review" ? "organization" : s, locale).length > 0 }))} />
      <div className="cc-wizard">
        <div className="cc-wizard-body">
          <h2 id="wizard-step-title" tabIndex={-1} className="cc-wizard-step-title">{steps[step].title}</h2>
          <p className="cc-wizard-step-intro">{steps[step].intro}</p>
          <SuccessNotice>{notice || null}</SuccessNotice>

          {step === "details" && <>
            <SetupIssues issues={[...issuesFor(readiness, "details", locale), ...issuesFor(readiness, "organization", locale)]} locale={locale} />
            <Facts items={[
              [ar ? "الاسم" : "Name", name],
              [ar ? "النوع" : "Type", personRoleLabel(onboarding.clinicianType, locale)],
              [ar ? "المؤسسة" : "Organization", detail.organization.displayName],
              [ar ? "العضوية" : "Membership", member ? <StatusBadge tone={membershipStatusLabel(member.status, locale).tone}>{membershipStatusLabel(member.status, locale).label}</StatusBadge> : "—"],
            ]} />
            <ErrorNotice error={memberError} locale={locale} />
            {member && member.status === "PENDING" && access.can("provider.member.invite") && (
              <div className="cc-requirement" style={{ marginTop: 16 }}>
                <div><h3>{ar ? "تفعيل العضوية في المؤسسة" : "Activate organization membership"}</h3><p className="cc-meta">{ar ? "مطلوبة قبل أن يصبح الاستشاري جاهزًا. فعّلها عندما تتأكد من انضمامه." : "Needed before the consultant can be ready. Activate it once you've confirmed they have joined."}</p></div>
                <div className="cc-row-actions"><button type="button" className="cc-secondary cc-small" disabled={activating} onClick={() => void activateMembership()}>{ar ? "تفعيل العضوية" : "Activate membership"}</button></div>
              </div>
            )}
          </>}

          {step === "professional" && <>
            <SetupIssues issues={issuesFor(readiness, "professional", locale)} locale={locale} />
            <Section title={ar ? "البيانات المهنية" : "Professional details"} id="prof">
              <ProfessionalDetailsForm locale={locale} api={api} organizationId={organizationId} onboarding={onboarding} complete={!!readiness?.clinicianProfileComplete} canEdit={access.can("provider.update")} onSaved={() => void reload()} />
            </Section>
            <Section title={ar ? "الاعتمادات المطلوبة" : "Required credentials"} description={ar ? "يراجعها شخص مستقل قبل التفعيل." : "An independent reviewer checks each one before activation."} id="creds">
              <CredentialRequirements locale={locale} api={api} organizationId={organizationId} practitionerId={practitionerId} canSubmit={access.can("credential.submit")} canReview={access.can("credential.review")} onChanged={() => void reload()} />
            </Section>
            <Section title={ar ? "علاقات العيادة" : "Practice relationships"} description={onboarding.clinicianType === "ASSOCIATE_DOCTOR" ? (ar ? "مطلوب استشاري مشرف." : "A supervising consultant is required.") : (ar ? "اختياري: مدير العيادة والمساعدون." : "Optional: practice manager and assistants.")} id="rels">
              <PracticeRelationships locale={locale} api={api} detail={detail} practitionerId={practitionerId} clinicianType={onboarding.clinicianType} canManage={access.can("provider.relationship.manage")} onChanged={() => void reload()} />
            </Section>
          </>}

          {step === "working" && <>
            <SetupIssues issues={issuesFor(readiness, "working", locale)} locale={locale} />
            {issuesFor(readiness, "working", locale).some((i) => i.code === "ROUTING_INCOMPLETE") && access.canAny(["assignment.policy.view"]) && <p className="cc-meta"><Link href={ccHref(locale, "/coordination")}>{ar ? "افتح تنسيق الرعاية لضبط التوجيه" : "Open Care coordination to set routing"}</Link></p>}
            <SectionTabs attentionLabel={locale === "ar" ? "يحتاج إجراء" : "needs attention"} label={steps.working.title} active={workTab} onChange={setWorkTab} tabs={[
              { key: "pricing", label: ar ? "الأسعار" : "Pricing", attention: !!readiness && readiness.pricingSetupRequired && !readiness.pricingSetupComplete },
              { key: "availability", label: ar ? "الجدول" : "Schedule", attention: !!readiness && readiness.availabilitySetupRequired && !readiness.availabilitySetupComplete },
            ]} />
            <TabPanel id={workTab}>
              {workTab === "pricing" ? <PricingManagement locale={locale} organizationId={organizationId} practitionerId={practitionerId} onChanged={() => void reload()} />
                : <AvailabilityManagement locale={locale} organizationId={organizationId} practitionerId={practitionerId} onChanged={() => void reload()} />}
            </TabPanel>
          </>}

          {step === "review" && <>
            {readiness ? <ReadinessChecklist locale={locale} readiness={readiness} onGoTo={(area) => go(areaStep[area])} /> : <ErrorNotice error={new Error(ar ? "تعذّر تحميل حالة الجاهزية." : "Readiness could not be loaded.")} locale={locale} action="load" onRetry={() => void reload()} />}
            <Section title={ar ? "التفعيل" : "Activation"} id="activate">
              <ActivationPanel locale={locale} api={api} organizationId={organizationId} onboarding={onboarding} readiness={readiness} organizationActive={orgActive} canActivate={access.can("provider.activate")} onActivated={() => { setNotice(ar ? "تم تفعيل الاستشاري." : "Consultant activated."); void reload(); }} />
            </Section>
          </>}

          <div className="cc-wizard-nav">
            {index > 0 && <button type="button" className="cc-secondary" onClick={() => go(STEPS[index - 1])}>{ar ? "رجوع" : "Back"}</button>}
            <div className="cc-push">
              <Link className="cc-secondary" href={consultantHref(locale, organizationId, practitionerId)}>{ar ? "حفظ والمتابعة لاحقًا" : "Save & continue later"}</Link>
              {index < STEPS.length - 1 && <button type="button" onClick={() => go(STEPS[index + 1])}>{ar ? "متابعة" : "Continue"}</button>}
            </div>
          </div>
        </div>
        <aside className="cc-wizard-aside" aria-label={ar ? "ملخص الإعداد" : "Setup summary"}>
          <h2>{name || (ar ? "الاستشاري" : "Consultant")}</h2>
          <p className="cc-meta">{personRoleLabel(onboarding.clinicianType, locale)} · {detail.organization.displayName}</p>
          <p><StatusBadge tone={status.tone}>{status.label}</StatusBadge></p>
          {readiness && <p className="cc-meta">{readinessSummary(readiness, locale)}</p>}
        </aside>
      </div>
    </>
  );
}
