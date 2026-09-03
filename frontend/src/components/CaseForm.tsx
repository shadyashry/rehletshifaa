"use client";
import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import Script from "next/script";
import { CheckCircle2, FileUp, LockKeyhole } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { buildCaseSchema, filesAreValid } from "@/lib/case-form-schema";
import { track } from "@/lib/analytics";
import { whatsappHref } from "@/lib/links";

type FormValues = { fullName: string; country: string; whatsappNumber: string; email: string; conditionDescription: string; consent: boolean };
type CareAreaKey = "" | "cardiology" | "rheumatology-rehabilitation" | "orthopedics";
type Errors = Partial<Record<keyof FormValues | "files" | "server", string>>;
type CreateCaseResponse = { caseId: string; caseNumber: string; status: "DRAFT" };
type PresignResponse = { documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> };

export function CaseForm({ locale, d }: { locale: Locale; d: Dictionary }) {
  const [values, setValues] = useState<FormValues>({ fullName: "", country: "", whatsappNumber: "", email: "", conditionDescription: "", consent: false });
  const [files, setFiles] = useState<File[]>([]);
  const [careArea, setCareArea] = useState<CareAreaKey>("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [caseNumber, setCaseNumber] = useState<string>();
  const [statusToken, setStatusToken] = useState<string>();
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const started = useRef(false);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const target = window as typeof window & { onRehletShifaaTurnstile?: (token: string) => void };
    target.onRehletShifaaTurnstile = setTurnstileToken;
    return () => { delete target.onRehletShifaaTurnstile; };
  }, []);

  function begin() { if (!started.current) { started.current = true; track("case_form_started"); } }
  function update(name: keyof FormValues, value: string | boolean) { begin(); setValues(current => ({ ...current, [name]: value })); }
  function onFiles(next: File[]) { begin(); setFiles(next); setErrors(current => ({ ...current, files: filesAreValid(next) ? undefined : d.form.errors.file })); }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setErrors({});
    const result = buildCaseSchema(d.form.errors).safeParse(values);
    const nextErrors: Errors = {};
    if (!result.success) for (const issue of result.error.issues) nextErrors[issue.path[0] as keyof FormValues] = issue.message;
    if (!filesAreValid(files)) nextErrors.files = d.form.errors.file;
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    if (!result.success) return;
    setBusy(true);
    const dictionaryKey = careArea === "rheumatology-rehabilitation" ? "rheumatology" : careArea;
    const careLine = dictionaryKey ? `${d.form.category.summaryLabel}: ${d.form.category.options[dictionaryKey]}` : "";
    const describedCase = [careLine, result.data.conditionDescription].filter(Boolean).join("\n\n");
    try {
      const createResponse = await fetch(`${apiBase}/api/v1/cases`, { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ ...result.data, conditionDescription: describedCase, preferredLanguage: locale, careArea: careArea || null, turnstileToken }) });
      if (!createResponse.ok) throw new Error("case_create_failed");
      const created = await createResponse.json() as CreateCaseResponse;
      for (const file of files) {
        const presignResponse = await fetch(`${apiBase}/api/v1/cases/${created.caseId}/documents/presign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originalFileName: file.name, contentType: file.type, sizeBytes: file.size }) });
        if (!presignResponse.ok) throw new Error("presign_failed");
        const presigned = await presignResponse.json() as PresignResponse;
        const uploadResponse = await fetch(presigned.uploadUrl, { method: "PUT", headers: presigned.requiredHeaders, body: file });
        if (!uploadResponse.ok) throw new Error("upload_failed");
        const confirmResponse = await fetch(`${apiBase}/api/v1/cases/${created.caseId}/documents/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: presigned.documentId }) });
        if (!confirmResponse.ok) throw new Error("confirm_failed");
        track("medical_file_uploaded");
      }
      const finalResponse = await fetch(`${apiBase}/api/v1/cases/${created.caseId}/submit`, { method: "POST" });
      if (!finalResponse.ok) throw new Error("submit_failed");
      const submitted = await finalResponse.json() as { caseNumber: string; statusToken: string };
      window.localStorage.setItem("rehletshifaa:last-status-path", `/${locale}/status/${submitted.statusToken}`);
      setCaseNumber(submitted.caseNumber);setStatusToken(submitted.statusToken); track("case_submitted");
    } catch { setErrors({ server: d.form.errors.server }); }
    finally { setBusy(false); }
  }

  if (caseNumber) {
    const message = `Hello RehletShifaa, I submitted my medical case. My Case ID is ${caseNumber}.`;
    const statusHref=statusToken?`/${locale}/status/${statusToken}`:undefined;
    return <section className="card p-7 md:p-10" aria-live="polite"><CheckCircle2 className="text-accent-700" size={42} /><h2 className="mt-6 text-3xl font-bold text-brand-900">{d.form.successTitle}</h2><p className="lead mt-4">{d.form.successBody}</p><div className="mt-7 rounded-lg bg-brand-50 p-5"><span className="text-sm text-ink-500">{d.form.caseNumber}</span><strong className="mt-1 block text-2xl tracking-wide text-brand-900">{caseNumber}</strong></div><div className="mt-7 flex flex-wrap gap-3">{statusHref&&<a className="btn-primary" href={statusHref}>{locale==="ar"?"متابعة حالة الطلب":"Track your case"}</a>}<a className="btn-secondary" target="_blank" rel="noreferrer" onClick={() => track("whatsapp_clicked")} href={whatsappHref(message)}>{d.form.continue}</a></div></section>;
  }

  return <>
    {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
    <form className="card p-6 md:p-9" onSubmit={submit} noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={d.form.name} error={errors.fullName}><input className={`field ${errors.fullName ? "field-error" : ""}`} autoComplete="name" value={values.fullName} onChange={e => update("fullName", e.target.value)} /></Field>
        <Field label={d.form.country} error={errors.country}><input className={`field ${errors.country ? "field-error" : ""}`} autoComplete="country-name" value={values.country} onChange={e => update("country", e.target.value)} /></Field>
      </div>
      <div className="mt-6"><label className="block"><span className="mb-2 block text-sm font-bold text-ink-800">{d.form.category.label} ({d.form.optional})</span><select className="field" value={careArea} onChange={e => { begin(); setCareArea(e.target.value as CareAreaKey); }}><option value="">{d.form.category.placeholder}</option><option value="cardiology">{d.form.category.options.cardiology}</option><option value="rheumatology-rehabilitation">{d.form.category.options.rheumatology}</option><option value="orthopedics">{d.form.category.options.orthopedics}</option></select><span className="mt-2 block text-sm leading-6 text-ink-500">{d.form.category.help}</span></label></div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2"><Field label={d.form.phone} error={errors.whatsappNumber}><input className={`field ${errors.whatsappNumber ? "field-error" : ""}`} dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+20 100 000 0000" value={values.whatsappNumber} onChange={e => update("whatsappNumber", e.target.value)} /></Field><Field label={`${d.form.email} (${d.form.optional})`} error={errors.email}><input className={`field ${errors.email ? "field-error" : ""}`} type="email" dir="ltr" inputMode="email" autoComplete="email" placeholder="name@example.com" value={values.email} onChange={e => update("email", e.target.value)} /></Field></div>
      <div className="mt-6"><Field label={`${d.form.description} (${d.form.optional})`} error={errors.conditionDescription}><textarea className="field min-h-28 resize-y" value={values.conditionDescription} maxLength={1900} onChange={e => update("conditionDescription", e.target.value)} /></Field></div>
      <div className="mt-6"><span className="mb-2 block text-sm font-bold text-ink-800">{d.form.files} ({d.form.optional})</span><label className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-line-strong bg-brand-50 px-5 py-8 text-center hover:border-brand-600"><FileUp className="text-accent-700" /><span className="mt-3 font-bold text-brand-700">{d.form.choose}</span>{files.length > 0 && <span className="mt-2 text-sm text-ink-500">{files.length} {d.form.selected}</span>}<input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => onFiles(Array.from(e.target.files ?? []))} /></label>{errors.files && <p className="error-text mt-2">{errors.files}</p>}<p className="mt-3 text-sm leading-6 text-ink-500">{d.form.uploadHelp}</p></div>
      <label className="mt-7 flex cursor-pointer items-start gap-3"><input className="mt-1 h-5 w-5 accent-brand-600" type="checkbox" checked={values.consent} onChange={e => update("consent", e.target.checked)} /><span className="text-sm leading-6 text-ink-700">{d.form.consent} <a className="font-bold text-brand-700 underline" href={`/${locale}/privacy`}>{d.common.privacy}</a></span></label>{errors.consent && <p className="error-text mt-2">{errors.consent}</p>}
      {siteKey && <div className="cf-turnstile mt-6" data-sitekey={siteKey} data-callback="onRehletShifaaTurnstile" />}
      {errors.server && <p className="mt-6 rounded-md border border-alert-200 bg-alert-50 p-4 text-sm text-alert-800" role="alert">{errors.server}</p>}
      <button className="btn-primary mt-7 w-full" disabled={busy} type="submit">{busy ? d.form.sending : d.form.send}</button><p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-500"><LockKeyhole size={14} />{d.form.secureNote}</p>
    </form>
  </>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }> }) {
  const errorId = useId();
  const control = isValidElement(children)
    ? cloneElement(children, { "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined })
    : children;
  return <label className="block"><span className="mb-2 block text-sm font-bold text-ink-800">{label}</span>{control}{error && <span id={errorId} className="error-text mt-2 block">{error}</span>}</label>;
}
