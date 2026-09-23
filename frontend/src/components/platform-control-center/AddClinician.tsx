"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Field } from "./cc-ui";
import { CARE_AREAS, careAreaLabel, personRoleLabel } from "./admin-labels";
import { useProviderDirectory, type ProviderDetail } from "./provider-directory";
import { clinicianHref, cliniciansHref, directClinicianHref, engagementLabel, type Engagement } from "./clinician-model";

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * Add clinician — one short invitation screen. It asks only what the invitation needs; everything else happens in
 * Consultant Setup, which opens as soon as the invitation is sent. The audit note the backend requires is prefilled and
 * kept under "Audit note" (still sent, still editable). The two engagement models keep their own, unchanged endpoints.
 */
export function AddClinician({ locale, initialOrg }: { locale: Locale; initialOrg?: string }) {
  const ar = locale === "ar";
  const router = useRouter();
  const api = useAdminApi();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const canProvider = access.can("provider.clinician.invite") && access.can("provider.view");
  const canDirect = access.legacy.canManage;
  const directory = useProviderDirectory(!access.loading && canProvider);
  const [engagement, setEngagement] = useState<Engagement>("provider");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { if (!access.loading && !canProvider && canDirect) setEngagement("direct"); }, [access.loading, canProvider, canDirect]);
  const [form, setForm] = useState({ org: initialOrg ?? "", role: "CONSULTANT", name: "", email: "", language: locale as string, specialty: "", careArea: "", reason: ar ? "دعوة طبيب جديد من مركز التحكم" : "New clinician invited from the Control Center" });
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<{ id: string; organizationId: string } | null>(null);
  const orgs = directory.details.map((d) => d.organization);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { if (!form.org && orgs.length === 1) setForm((f) => ({ ...f, org: orgs[0].id })); }, [orgs, form.org]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const need = (v: string, message?: string) => (touched && !v.trim() ? message ?? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined);
  const emailError = touched && form.email.trim() && !EMAIL.test(form.email.trim()) ? (ar ? "أدخل بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address.") : need(form.email);

  const openSetup = async (orgId: string, subject: string) => {
    const detail = await api<ProviderDetail>(`/admin/providers/${orgId}`);
    const member = detail.members.find((m) => m.subject === subject && m.practitionerId);
    if (!member?.practitionerId) throw new Error(ar ? "أُرسلت الدعوة لكن تعذّر العثور على سجل الطبيب. افتحه من قائمة الأطباء." : "The invitation was sent but the clinician's record could not be found. Open it from the Clinicians list.");
    router.push(`${clinicianHref(locale, orgId, member.practitionerId, "setup")}&invited=1`);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); setError(null);
    const base = !form.name.trim() || !EMAIL.test(form.email.trim());
    const invalid = engagement === "provider" ? base || !form.org || !form.reason.trim() : base || !form.specialty.trim() || !form.careArea;
    if (invalid) { requestAnimationFrame(() => document.querySelector<HTMLElement>(".cc-field-invalid input, .cc-field-invalid select")?.focus()); return; }
    setBusy(true);
    try {
      if (engagement === "direct") {
        const created = await api<{ id: string }>("/admin/practitioners", { method: "POST", body: { legalName: form.name.trim(), displayName: form.name.trim(), email: form.email.trim(), locale: form.language, specialty: form.specialty.trim(), careCategory: form.careArea, practitionerType: "CONSULTANT", contractStatus: "ACTIVE", availabilityStatus: "UNAVAILABLE", expectedReviewHours: 48 } });
        router.push(`${directClinicianHref(locale, created.id)}?invited=1`);
        return;
      }
      const op = await api<{ id: string | null; organizationId: string; subject: string | null; status: string }>(`/admin/providers/${form.org}/members/invite`, { method: "POST", body: { name: form.name.trim(), email: form.email.trim(), role: form.role, locale: form.language, reason: form.reason.trim() } });
      if (op.status === "COMPLETED" && op.subject) await openSetup(form.org, op.subject);
      else if (op.id) setPending({ id: op.id, organizationId: form.org });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const retry = async () => {
    if (!pending) return; setBusy(true); setError(null);
    try {
      const op = await api<{ subject: string | null; status: string }>(`/admin/providers/${pending.organizationId}/identity-operations/${pending.id}/reconcile`, { method: "POST", body: { reason: form.reason || "Retry clinician invitation" } });
      if (op.status === "COMPLETED" && op.subject) await openSetup(pending.organizationId, op.subject);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const title = ar ? "إضافة طبيب" : "Add clinician";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={[{ label: title }]} title={title} intro={ar ? "أرسل دعوة آمنة. يستمر الإعداد بعدها في صفحة الطبيب، ويشارك فيه أكثر من فريق." : "Send a secure invitation. Setup then continues on the clinician's page, where each team completes its own part."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canProvider && !canDirect) return shell(<EmptyState title={ar ? "لا يمكنك إضافة أطباء" : "You can't add clinicians"} body={ar ? "اطلب من مسؤول الوصول صلاحية دعوة الأطباء." : "Ask your access administrator for permission to invite clinicians."} />);

  return shell(
    <form className="cc-add-clinician" onSubmit={submit} noValidate aria-label={title}>
      <ErrorNotice error={error} locale={locale} />
      {pending && (
        <div className="cc-notice cc-notice-info" role="status">
          <div><p>{ar ? "طُلب إنشاء حساب الدخول لكنه لم يكتمل بعد. لم تُفقد أي بيانات." : "The sign-in account was requested but isn't finished yet. Nothing was lost."}</p></div>
          <button type="button" className="cc-secondary cc-small" disabled={busy} onClick={() => void retry()}>{ar ? "إكمال إنشاء الحساب" : "Finish account setup"}</button>
        </div>
      )}
      {canProvider && canDirect && (
        <fieldset className="cc-choices">
          <legend className="cc-field-label">{ar ? "طريقة العمل مع رحلة شفاء" : "Engagement"}</legend>
          <label className="cc-choice"><input type="radio" name="engagement" checked={engagement === "provider"} onChange={() => setEngagement("provider")} /><span><strong>{engagementLabel("provider", locale)}</strong><small>{ar ? "يُعدّ باعتمادات الجهة وأسعارها وجدولها، ويراجع اعتماداته فريق مستقل." : "Set up with the organization's credentials, prices and schedule; credentials are independently reviewed."}</small></span></label>
          <label className="cc-choice"><input type="radio" name="engagement" checked={engagement === "direct"} onChange={() => setEngagement("direct")} /><span><strong>{engagementLabel("direct", locale)}</strong><small>{ar ? "يُعتمد لاستقبال الحالات في سير العمل الحالي بعد مراجعة اعتماده." : "Approved to receive cases in the current case workflow after a credential check."}</small></span></label>
        </fieldset>
      )}
      <div className="cc-form-grid">
        <Field label={ar ? "الاسم الكامل" : "Full name"} required error={need(form.name)}><input autoComplete="name" maxLength={160} value={form.name} onChange={set("name")} aria-required /></Field>
        <Field label={ar ? "بريد العمل" : "Work email"} hint={ar ? "تصل الدعوة الآمنة إلى هذا البريد." : "The secure invitation goes to this address."} required error={emailError}><input type="email" dir="ltr" inputMode="email" autoComplete="email" maxLength={254} value={form.email} onChange={set("email")} aria-required /></Field>
        {engagement === "provider" ? <>
          <Field label={ar ? "الجهة الطبية" : "Provider Organization"} required error={need(form.org, ar ? "اختر جهة." : "Choose an organization.")}>
            <select value={form.org} onChange={set("org")} aria-required disabled={directory.loading}>
              <option value="">{directory.loading ? (ar ? "جارٍ التحميل…" : "Loading…") : (ar ? "اختر جهة" : "Choose an organization")}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
            </select>
          </Field>
          <Field label={ar ? "نوع الطبيب" : "Clinician type"} required>
            <select value={form.role} onChange={set("role")}><option value="CONSULTANT">{personRoleLabel("CONSULTANT", locale)}</option><option value="ASSOCIATE_DOCTOR">{personRoleLabel("ASSOCIATE_DOCTOR", locale)}</option></select>
          </Field>
        </> : <>
          <Field label={ar ? "التخصص" : "Specialty"} hint={ar ? "استشاري؛ يُطابَق مع الحالات حسب مجال الرعاية." : "Consultant; matched to cases by care area."} required error={need(form.specialty)}><input maxLength={120} value={form.specialty} onChange={set("specialty")} aria-required /></Field>
          <Field label={ar ? "مجال الرعاية" : "Care area"} required error={need(form.careArea, ar ? "اختر مجال الرعاية." : "Choose a care area.")}>
            <select value={form.careArea} onChange={set("careArea")} aria-required><option value="">{ar ? "اختر مجال الرعاية" : "Choose a care area"}</option>{CARE_AREAS.map((c) => <option key={c} value={c}>{careAreaLabel(c, locale)}</option>)}</select>
          </Field>
        </>}
        <Field label={ar ? "لغة الدعوة" : "Invitation language"} required><select value={form.language} onChange={set("language")}><option value="en">English</option><option value="ar">العربية</option></select></Field>
      </div>
      {engagement === "provider" && (
        <details className="cc-technical cc-audit-note" open={touched && !form.reason.trim()}>
          <summary>{ar ? "ملاحظة سجل التدقيق" : "Audit note"}</summary>
          <Field label={ar ? "ملاحظة لسجل التدقيق" : "Note for the audit trail"} hint={ar ? "تُحفظ مع الدعوة. عُبّئت مسبقًا ويمكنك تعديلها." : "Saved with the invitation. Prefilled; change it if you need to."} required error={need(form.reason)}><input maxLength={500} value={form.reason} onChange={set("reason")} aria-required /></Field>
        </details>
      )}
      <p className="cc-meta">{engagement === "direct" ? (ar ? "بعد الإرسال: يقبل الطبيب الدعوة، ثم يُسجَّل اعتماده ويُتخذ قرار اعتماده للحالات." : "Next: the clinician accepts the invitation, then their credential is recorded and the case-approval decision is made.") : (ar ? "بعد الإرسال: تفتح صفحة إعداد الاستشاري — الملف المهني، والاعتمادات ومراجعتها المستقلة، والإعداد التشغيلي، ثم التفعيل." : "Next: Consultant Setup opens — professional profile, credentials and their independent review, operational setup, then activation.")}</p>
      <div className="cc-form-actions">
        <button disabled={busy}>{busy ? (ar ? "جارٍ إرسال الدعوة…" : "Sending invitation…") : (ar ? "إرسال الدعوة" : "Send invitation")}</button>
        <Link className="cc-secondary" href={cliniciansHref(locale)}>{ar ? "إلغاء" : "Cancel"}</Link>
      </div>
    </form>
  );
}
