"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Field } from "./cc-ui";
import { CARE_AREAS, careAreaLabel } from "./admin-labels";
import { consultantHref, consultantsHref } from "./consultant-model";

const EMAIL = /^\S+@\S+\.\S+$/;

/** Add consultant (CONSULTANT_ONBOARD): one short invitation. Credential approval then happens on the Consultant's page. */
export function AddConsultant({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const router = useRouter();
  const api = useAdminApi();
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const canAdd = access.can("CONSULTANT_ONBOARD");
  const [form, setForm] = useState({ name: "", email: "", language: locale as string, specialty: "", careArea: "" });
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const need = (v: string, message?: string) => (touched && !v.trim() ? message ?? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined);
  const emailError = touched && form.email.trim() && !EMAIL.test(form.email.trim()) ? (ar ? "أدخل بريدًا إلكترونيًا صحيحًا." : "Enter a valid email address.") : need(form.email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); setError(null);
    if (!form.name.trim() || !EMAIL.test(form.email.trim()) || !form.specialty.trim() || !form.careArea) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".cc-field-invalid input, .cc-field-invalid select")?.focus());
      return;
    }
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/admin/practitioners", { method: "POST", body: { legalName: form.name.trim(), displayName: form.name.trim(), email: form.email.trim(), locale: form.language, specialty: form.specialty.trim(), careCategory: form.careArea, practitionerType: "CONSULTANT", contractStatus: "ACTIVE", availabilityStatus: "UNAVAILABLE", expectedReviewHours: 48 } });
      router.push(`${consultantHref(locale, created.id)}?invited=1`);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const title = ar ? "إضافة استشاري" : "Add consultant";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" crumbs={[{ label: title }]} title={title} intro={ar ? "أرسل دعوة آمنة. يستمر الإعداد بعدها في صفحة الاستشاري." : "Send a secure invitation. Setup then continues on the consultant's page."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canAdd) return shell(<EmptyState title={ar ? "لا يمكنك إضافة استشاريين" : "You can't add consultants"} body={ar ? "يضيف مدير عمليات الاستشاريين الاستشاريين الجدد." : "The Consultant Operations Manager adds new consultants."} />);

  return shell(
    <form className="cc-add-clinician" onSubmit={submit} noValidate aria-label={title}>
      <ErrorNotice error={error} locale={locale} />
      <div className="cc-form-grid">
        <Field label={ar ? "الاسم الكامل" : "Full name"} required error={need(form.name)}><input autoComplete="name" maxLength={160} value={form.name} onChange={set("name")} aria-required /></Field>
        <Field label={ar ? "بريد العمل" : "Work email"} hint={ar ? "تصل الدعوة الآمنة إلى هذا البريد." : "The secure invitation goes to this address."} required error={emailError}><input type="email" dir="ltr" inputMode="email" autoComplete="email" maxLength={254} value={form.email} onChange={set("email")} aria-required /></Field>
        <Field label={ar ? "التخصص" : "Specialty"} hint={ar ? "يُطابَق مع الحالات حسب مجال الرعاية." : "Matched to cases by care area."} required error={need(form.specialty)}><input maxLength={120} value={form.specialty} onChange={set("specialty")} aria-required /></Field>
        <Field label={ar ? "مجال الرعاية" : "Care area"} required error={need(form.careArea, ar ? "اختر مجال الرعاية." : "Choose a care area.")}>
          <select value={form.careArea} onChange={set("careArea")} aria-required><option value="">{ar ? "اختر مجال الرعاية" : "Choose a care area"}</option>{CARE_AREAS.map((c) => <option key={c} value={c}>{careAreaLabel(c, locale)}</option>)}</select>
        </Field>
        <Field label={ar ? "لغة الدعوة" : "Invitation language"} required><select value={form.language} onChange={set("language")}><option value="en">English</option><option value="ar">العربية</option></select></Field>
      </div>
      <p className="cc-meta">{ar ? "بعد الإرسال: يقبل الاستشاري الدعوة، ثم يُسجَّل اعتماده ويتخذ فريق الاعتماد قرار اعتماده للحالات." : "Next: the consultant accepts the invitation, then their credential is recorded and the credentialing team makes the case-approval decision."}</p>
      <div className="cc-form-actions">
        <button disabled={busy}>{busy ? (ar ? "جارٍ إرسال الدعوة…" : "Sending invitation…") : (ar ? "إرسال الدعوة" : "Send invitation")}</button>
        <Link className="cc-secondary" href={consultantsHref(locale)}>{ar ? "إلغاء" : "Cancel"}</Link>
      </div>
    </form>
  );
}
