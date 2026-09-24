"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { AdminApi } from "./admin-api";
import type { ControlCenterAccess } from "./control-center-access";
import { ErrorNotice, Facts, Field, Section } from "./cc-ui";
import { orgTypeLabel } from "./control-center-copy";
import type { Organization } from "./provider-directory";

const CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "GBP"];

/**
 * Whether the stored profile can be changed here, from the backend rule in `ProviderOrganizationService.update`: the
 * status is sent back unchanged, ACTIVE / READINESS_REVIEW are refused (activation and readiness own them), and a
 * SUSPENDED organization needs `provider.suspend` rather than `provider.update`.
 */
export function profileEditability(org: Organization, access: Pick<ControlCenterAccess, "can">): { editable: boolean; reason?: "active" | "access" } {
  if (org.status === "ACTIVE" || org.status === "READINESS_REVIEW") return { editable: false, reason: "active" };
  const permission = org.status === "SUSPENDED" ? "provider.suspend" : "provider.update";
  return access.can(permission) ? { editable: true } : { editable: false, reason: "access" };
}

/**
 * Providers › Organization › Overview: the organization's stored profile (only the fields the API models) and, where the
 * backend accepts it, an edit form with the audit reason the backend requires. Not legal onboarding: Commercial & Legal
 * Acceptance stays unavailable and activation stays blocked.
 */
export function OrganizationProfile({ locale, api, organization: org, access, editing, onEditing, onSaved }: {
  locale: Locale; api: AdminApi; organization: Organization; access: Pick<ControlCenterAccess, "can">;
  editing: boolean; onEditing: (v: boolean) => void; onSaved: () => void;
}) {
  const ar = locale === "ar";
  const rule = profileEditability(org, access);
  const [form, setForm] = useState({ legalName: org.legalName, businessName: org.businessName ?? "", displayName: org.displayName, countryCode: org.countryCode ?? "", timeZone: org.timeZone, defaultCurrency: org.defaultCurrency, reason: "" });
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const invalid = {
    legalName: !form.legalName.trim() ? (ar ? "الاسم القانوني مطلوب." : "The legal name is required.") : undefined,
    displayName: !form.displayName.trim() ? (ar ? "الاسم المعروض مطلوب." : "The display name is required.") : undefined,
    countryCode: form.countryCode.trim().length !== 2 ? (ar ? "أدخل رمز دولة من حرفين." : "Enter a two-letter country code.") : undefined,
    timeZone: !form.timeZone.trim() ? (ar ? "المنطقة الزمنية مطلوبة." : "The time zone is required.") : undefined,
    reason: !form.reason.trim() ? (ar ? "اذكر سبب التغيير." : "Say why you are making this change.") : undefined,
  };
  const errors = Object.entries(invalid).filter(([, v]) => v) as [string, string][];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); if (errors.length) { document.getElementById("org-profile-errors")?.focus(); return; }
    setBusy(true); setError(null);
    try {
      await api(`/admin/providers/${org.id}`, { method: "PUT", body: { legalName: form.legalName.trim(), businessName: form.businessName.trim() || null, displayName: form.displayName.trim(), status: org.status, countryCode: form.countryCode.trim().toUpperCase(), timeZone: form.timeZone.trim(), defaultCurrency: form.defaultCurrency, version: org.version, reason: form.reason.trim() } });
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const edit = rule.editable && !editing ? <button type="button" className="cc-secondary cc-small" onClick={() => onEditing(true)}>{ar ? "تعديل الملف" : "Edit profile"}</button> : undefined;
  return (
    <Section title={ar ? "ملف الجهة" : "Organization profile"} description={ar ? "البيانات المخزّنة للجهة. التفعيل والقبول التجاري والقانوني منفصلان عن هذا الملف." : "The organization's stored details. Activation and Commercial & Legal Acceptance are separate from this profile."} actions={edit} id="org-profile">
      {!editing ? <>
        <Facts items={[
          [ar ? "الاسم القانوني" : "Legal name", <bdi key="l">{org.legalName}</bdi>], [ar ? "الاسم التجاري" : "Business name", org.businessName ? <bdi key="b">{org.businessName}</bdi> : "—"],
          [ar ? "الاسم المعروض" : "Display name", <bdi key="d">{org.displayName}</bdi>], [ar ? "النوع" : "Type", orgTypeLabel(org.type, locale)],
          [ar ? "الدولة" : "Country", org.countryCode ? <bdi key="c" dir="ltr">{org.countryCode}</bdi> : (ar ? "غير محددة" : "Not set")],
          [ar ? "المنطقة الزمنية" : "Time zone", <bdi key="tz" dir="ltr">{org.timeZone}</bdi>], [ar ? "العملة الافتراضية" : "Default currency", <bdi key="cur" dir="ltr">{org.defaultCurrency}</bdi>],
        ]} />
        {!rule.editable && <p className="cc-meta">{rule.reason === "active"
          ? (ar ? "لا يمكن تغيير ملف جهة نشطة أو قيد مراجعة الجاهزية في هذا الإصدار." : "The profile of an active organization, or one in readiness review, can't be changed in this release.")
          : (ar ? "للقراءة فقط. يحدّث مدير عمليات مقدمي الرعاية ملف الجهة." : "Read only. A provider operations manager updates the organization profile.")}</p>}
      </> : (
        <form onSubmit={submit} noValidate aria-label={ar ? "تعديل ملف الجهة" : "Edit organization profile"}>
          {touched && errors.length > 0 && <div id="org-profile-errors" tabIndex={-1} role="alert" className="cc-message"><p><strong>{ar ? "صحّح ما يلي:" : "Fix the following:"}</strong></p><ul>{errors.map(([k, v]) => <li key={k}><a href={`#org-${k}`}>{v}</a></li>)}</ul></div>}
          <ErrorNotice error={error} locale={locale} />
          <div className="cc-form-grid">
            <Field label={ar ? "الاسم القانوني" : "Legal name"} required error={touched ? invalid.legalName : undefined}><input id="org-legalName" maxLength={200} value={form.legalName} onChange={set("legalName")} /></Field>
            <Field label={ar ? "الاسم التجاري" : "Business name"} optionalLabel={ar ? "اختياري" : "optional"}><input maxLength={200} value={form.businessName} onChange={set("businessName")} /></Field>
            <Field label={ar ? "الاسم المعروض" : "Display name"} hint={ar ? "كما يظهر في المنصة." : "As shown across the platform."} required error={touched ? invalid.displayName : undefined}><input id="org-displayName" maxLength={160} value={form.displayName} onChange={set("displayName")} /></Field>
            <Field label={ar ? "الدولة" : "Country"} hint={ar ? "رمز من حرفين، مثل EG" : "Two-letter code, for example EG"} required error={touched ? invalid.countryCode : undefined}><input id="org-countryCode" dir="ltr" maxLength={2} value={form.countryCode} onChange={set("countryCode")} /></Field>
            <Field label={ar ? "المنطقة الزمنية" : "Time zone"} hint="Africa/Cairo, Asia/Dubai…" required error={touched ? invalid.timeZone : undefined}><input id="org-timeZone" dir="ltr" value={form.timeZone} onChange={set("timeZone")} /></Field>
            <Field label={ar ? "العملة الافتراضية" : "Default currency"} required><select value={form.defaultCurrency} onChange={set("defaultCurrency")}>{Array.from(new Set([form.defaultCurrency, ...CURRENCIES])).map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <div className="cc-span"><Field label={ar ? "لماذا تُجري هذا التغيير؟" : "Why are you making this change?"} hint={ar ? "يُسجَّل في سجل التدقيق." : "Recorded on the audit trail."} required error={touched ? invalid.reason : undefined}><textarea id="org-reason" maxLength={500} value={form.reason} onChange={set("reason")} /></Field></div>
          </div>
          <div className="cc-form-actions"><button disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ الملف" : "Save profile")}</button><button type="button" className="cc-secondary" disabled={busy} onClick={() => { onEditing(false); setTouched(false); setError(null); }}>{ar ? "إلغاء" : "Cancel"}</button></div>
        </form>
      )}
    </Section>
  );
}
