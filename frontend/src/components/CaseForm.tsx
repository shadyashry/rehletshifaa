"use client";
import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { CheckCircle2, FileUp, FileText, LockKeyhole, ChevronDown, Search, Check, X, Trash2, Plus } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { buildCaseSchema, filesAreValid } from "@/lib/case-form-schema";
import { track } from "@/lib/analytics";
import { whatsappHref } from "@/lib/links";
import { COUNTRIES, flagEmoji, type Country } from "@/lib/countries";

type FormValues = { fullName: string; country: string; whatsappNumber: string; email: string; conditionDescription: string; consent: boolean };
type CareAreaKey = "" | "cardiology" | "rheumatology-rehabilitation" | "orthopedics";
type FieldKey = keyof FormValues | "files" | "server";
type Errors = Partial<Record<FieldKey, string>>;
type CreateCaseResponse = { caseId: string; caseNumber: string; status: "DRAFT" };
type PresignResponse = { documentId: string; uploadUrl: string; requiredHeaders: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CaseForm({ locale, d }: { locale: Locale; d: Dictionary }) {
  const ar = locale === "ar";
  const [values, setValues] = useState<FormValues>({ fullName: "", country: "", whatsappNumber: "", email: "", conditionDescription: "", consent: false });
  const [country, setCountry] = useState<Country | null>(null);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [careArea, setCareArea] = useState<CareAreaKey>("");
  const [travelPackage, setTravelPackage] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [caseNumber, setCaseNumber] = useState<string>();
  const [statusToken, setStatusToken] = useState<string>();
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const started = useRef(false);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const t = {
    countryPlaceholder: ar ? "ابحث عن دولتك…" : "Search your country…",
    countryEmpty: ar ? "لا توجد نتائج مطابقة" : "No matching country",
    selectCountryFirst: ar ? "اختر دولتك أولًا" : "Select your country first",
    phoneHint: ar ? "نتواصل معك عبر واتساب على هذا الرقم." : "We'll contact you on WhatsApp using this number.",
    localNumber: ar ? "رقم الهاتف" : "Phone number",
    requiredMark: ar ? "مطلوب" : "Required",
    reviewTitle: ar ? "أكمل الحقول المطلوبة للإرسال" : "Complete the required fields to send",
    clearCountry: ar ? "مسح الدولة" : "Clear country",
    countryLabel: ar ? "الدولة" : d.form.country,
  };

  useEffect(() => {
    const target = window as typeof window & { onRehletShifaaTurnstile?: (token: string) => void };
    target.onRehletShifaaTurnstile = setTurnstileToken;
    return () => { delete target.onRehletShifaaTurnstile; };
  }, []);

  function begin() { if (!started.current) { started.current = true; track("case_form_started"); } }
  function update(name: keyof FormValues, value: string | boolean) { begin(); setValues(current => ({ ...current, [name]: value })); }
  function touch(name: FieldKey) { setTouched(current => ({ ...current, [name]: true })); }
  function onFiles(next: File[]) { begin(); setFiles(current => {const keys=new Set(current.map(file=>`${file.name}:${file.size}:${file.lastModified}`));return [...current,...next.filter(file=>!keys.has(`${file.name}:${file.size}:${file.lastModified}`))];}); }

  const digits = phoneLocal.replace(/\D/g, "");
  const fullPhone = country ? `${country.dial} ${phoneLocal.trim()}`.trim() : phoneLocal.trim();
  const emailTrimmed = values.email.trim();
  // Live per-field validity — drives inline messages and the submit button's disabled state.
  const valid = useMemo(() => ({
    fullName: values.fullName.trim().length >= 2,
    country: !!country,
    whatsappNumber: !!country && digits.length >= 6 && digits.length <= 15,
    email: emailTrimmed === "" || EMAIL_RE.test(emailTrimmed),
    consent: values.consent === true,
    files: filesAreValid(files),
  }), [values.fullName, country, digits.length, emailTrimmed, values.consent, files]);
  const allValid = valid.fullName && valid.country && valid.whatsappNumber && valid.email && valid.consent && valid.files;

  function fieldError(key: FieldKey): string | undefined {
    if (errors[key]) return errors[key];
    if (!touched[key]) return undefined;
    if (key === "fullName" && !valid.fullName) return d.form.errors.name;
    if (key === "country" && !valid.country) return t.selectCountryFirst;
    if (key === "whatsappNumber" && !valid.whatsappNumber) return valid.country ? d.form.errors.phone : t.selectCountryFirst;
    if (key === "email" && !valid.email) return d.form.errors.email;
    if (key === "consent" && !valid.consent) return d.form.errors.consent;
    if (key === "files" && !valid.files) return d.form.errors.file;
    return undefined;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ fullName: true, country: true, whatsappNumber: true, email: true, consent: true, files: true });
    setErrors({});
    const candidate: FormValues = { ...values, country: country?.name ?? "", whatsappNumber: fullPhone };
    const result = buildCaseSchema(d.form.errors).safeParse(candidate);
    const nextErrors: Errors = {};
    if (!result.success) for (const issue of result.error.issues) nextErrors[issue.path[0] as FieldKey] = issue.message;
    if (!country) nextErrors.country = t.selectCountryFirst;
    if (!filesAreValid(files)) nextErrors.files = d.form.errors.file;
    if (Object.keys(nextErrors).length || !result.success) { setErrors(nextErrors); return; }
    setBusy(true);
    const dictionaryKey = careArea === "rheumatology-rehabilitation" ? "rheumatology" : careArea;
    const careLine = dictionaryKey ? `${d.form.category.summaryLabel}: ${d.form.category.options[dictionaryKey]}` : "";
    const describedCase = [careLine, result.data.conditionDescription].filter(Boolean).join("\n\n");
    try {
      const createResponse = await fetch(`${apiBase}/api/v1/cases`, { method: "POST", headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() }, body: JSON.stringify({ ...result.data, conditionDescription: describedCase, preferredLanguage: locale, careArea: careArea || null, travelPackageRequested: travelPackage, turnstileToken }) });
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
      setCaseNumber(submitted.caseNumber); setStatusToken(submitted.statusToken); track("case_submitted");
    } catch { setErrors({ server: d.form.errors.server }); }
    finally { setBusy(false); }
  }

  if (caseNumber) {
    const message = `Hello RehletShifaa, I submitted my medical case. My Case ID is ${caseNumber}.`;
    const statusHref = statusToken ? `/${locale}/status/${statusToken}` : undefined;
    return <section className="card p-7 md:p-10" aria-live="polite"><CheckCircle2 className="text-accent-700" size={42} /><h2 className="mt-6 text-3xl font-bold text-brand-900">{d.form.successTitle}</h2><p className="lead mt-4">{d.form.successBody}</p><div className="mt-7 rounded-lg bg-brand-50 p-5"><span className="text-sm text-ink-500">{d.form.caseNumber}</span><strong className="mt-1 block text-2xl tracking-wide text-brand-900">{caseNumber}</strong></div><div className="mt-7 flex flex-wrap gap-3">{statusHref && <a className="btn-primary" href={statusHref}>{ar ? "متابعة حالة الطلب" : "Track your case"}</a>}<a className="btn-secondary" target="_blank" rel="noreferrer" onClick={() => track("whatsapp_clicked")} href={whatsappHref(message)}>{d.form.continue}</a></div></section>;
  }

  return <>
    {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
    <form className="card p-6 md:p-9" onSubmit={submit} noValidate>
      {/* Section 1 — contact details */}
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="text-sm font-bold uppercase tracking-wide text-accent-700">{ar ? "بيانات التواصل" : "Your contact details"}</legend>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <Field label={d.form.name} required requiredMark={t.requiredMark} valid={valid.fullName && !!values.fullName} error={fieldError("fullName")}>
            <input className={`field ${fieldError("fullName") ? "field-error" : ""}`} autoComplete="name" value={values.fullName} onChange={e => update("fullName", e.target.value)} onBlur={() => touch("fullName")} />
          </Field>
          <Field label={t.countryLabel} required requiredMark={t.requiredMark} valid={valid.country} error={fieldError("country")}>
            <CountrySelect locale={locale} value={country} placeholder={t.countryPlaceholder} emptyLabel={t.countryEmpty} clearLabel={t.clearCountry} invalid={!!fieldError("country")} onBlur={() => touch("country")} onChange={c => { begin(); setCountry(c); touch("country"); }} />
          </Field>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Field label={d.form.phone} required requiredMark={t.requiredMark} valid={valid.whatsappNumber} error={fieldError("whatsappNumber")} hint={t.phoneHint}>
            <div className={`flex items-stretch overflow-hidden rounded-[0.55rem] border ${fieldError("whatsappNumber") ? "border-alert-700" : "border-line-strong focus-within:border-brand-600 focus-within:shadow-[0_0_0_3px_var(--color-brand-100)]"}`} dir="ltr">
              <span className="flex flex-none items-center gap-1.5 border-e border-line bg-brand-50 px-3 text-sm font-bold text-ink-800" aria-hidden>
                {country ? <><span className="text-base leading-none">{flagEmoji(country.iso2)}</span><span>{country.dial}</span></> : <span className="text-ink-400">+—</span>}
              </span>
              <input className="min-w-0 flex-1 bg-white px-3 py-2.5 text-ink-900 outline-none" inputMode="tel" autoComplete="tel-national" placeholder={country ? "100 000 0000" : t.selectCountryFirst} aria-label={t.localNumber} value={phoneLocal} onChange={e => { begin(); setPhoneLocal(e.target.value.replace(/[^\d\s()-]/g, "")); }} onBlur={() => touch("whatsappNumber")} />
            </div>
          </Field>
          <Field label={`${d.form.email} (${d.form.optional})`} valid={valid.email && emailTrimmed !== ""} error={fieldError("email")}>
            <input className={`field ${fieldError("email") ? "field-error" : ""}`} type="email" dir="ltr" inputMode="email" autoComplete="email" placeholder="name@example.com" value={values.email} onChange={e => update("email", e.target.value)} onBlur={() => touch("email")} />
          </Field>
        </div>
      </fieldset>

      {/* Section 2 — the case */}
      <fieldset className="mt-9 min-w-0 border-0 p-0">
        <legend className="text-sm font-bold uppercase tracking-wide text-accent-700">{ar ? "عن حالتك" : "About your case"}</legend>
        <div className="mt-4"><label className="block"><span className="mb-2 block text-sm font-bold text-ink-800">{d.form.category.label} <span className="font-normal text-ink-400">({d.form.optional})</span></span><select className="field" value={careArea} onChange={e => { begin(); setCareArea(e.target.value as CareAreaKey); }}><option value="">{d.form.category.placeholder}</option><option value="cardiology">{d.form.category.options.cardiology}</option><option value="rheumatology-rehabilitation">{d.form.category.options.rheumatology}</option><option value="orthopedics">{d.form.category.options.orthopedics}</option></select><span className="mt-2 block text-sm leading-6 text-ink-500">{d.form.category.help}</span></label></div>
        <div className="mt-6"><label className="block"><span className="mb-2 block text-sm font-bold text-ink-800">{d.form.description} <span className="font-normal text-ink-400">({d.form.optional})</span></span><textarea className="field min-h-28 resize-y" value={values.conditionDescription} maxLength={1900} onChange={e => update("conditionDescription", e.target.value)} /></label></div>
        <div className="mt-6"><div className="mb-3 flex items-end justify-between gap-3"><span className="block text-sm font-bold text-ink-800">{d.form.files} <span className="font-normal text-ink-400">({d.form.optional})</span></span>{files.length>0&&<span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-800">{files.length} {d.form.selected}</span>}</div><div className="overflow-hidden rounded-2xl border border-line bg-white"><label className="flex cursor-pointer items-center gap-4 border-b border-dashed border-line-strong bg-brand-50 p-5 transition hover:border-brand-600 hover:bg-brand-100/60"><span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white text-accent-700 shadow-sm"><FileUp /></span><span className="min-w-0 flex-1"><strong className="block text-brand-800">{d.form.choose}</strong><span className="mt-1 block text-sm text-ink-500">{d.form.uploadHelp}</span></span><Plus className="flex-none text-brand-700"/><input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={e => { onFiles(Array.from(e.currentTarget.files ?? []));e.currentTarget.value="";touch("files"); }} /></label>{files.length>0&&<ul className="grid gap-2 p-3 sm:grid-cols-2">{files.map((file,index)=><li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-mist/50 p-3"><FileText className="flex-none text-brand-600" size={20}/><span className="min-w-0 flex-1"><strong className="block truncate text-sm" title={file.name}>{file.name}</strong><span className="text-xs text-ink-500">{(file.size/1024/1024).toFixed(file.size<1024*1024?2:1)} MB</span></span><button type="button" className="rounded-lg p-2 text-ink-500 hover:bg-alert-50 hover:text-alert-800" aria-label={`${ar?"حذف":"Remove"} ${file.name}`} onClick={()=>setFiles(current=>current.filter((_,i)=>i!==index))}><Trash2 size={17}/></button></li>)}</ul>}</div>{fieldError("files") && <p className="error-text mt-2">{fieldError("files")}</p>}</div>
      </fieldset>

      {/* Section 3 — options & consent */}
      <label className="mt-9 flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-brand-50 p-4"><input className="mt-1 h-5 w-5 accent-brand-600" type="checkbox" checked={travelPackage} onChange={e => { begin(); setTravelPackage(e.target.checked); }} /><span className="text-sm leading-6 text-ink-700"><strong className="block text-ink-900">{ar ? "أرغب في تنظيم باقة سفر وعلاج متكاملة" : "I'd like a full travel & treatment package"}</strong>{ar ? "إذا قُبلت حالتي من قبل الاستشاري، يتولى فريق رحلة شفاء ترتيب الطيران والتأشيرة والإقامة والتنقلات من وإلى المستشفى." : "If my case is accepted by the consultant, RehletShifaa will arrange your flights, visa, accommodation, and hospital transfers."}</span></label>
      <label className="mt-4 flex cursor-pointer items-start gap-3"><input className="mt-1 h-5 w-5 accent-brand-600" type="checkbox" checked={values.consent} onChange={e => { update("consent", e.target.checked); touch("consent"); }} /><span className="text-sm leading-6 text-ink-700">{d.form.consent} <a className="font-bold text-brand-700 underline" href={`/${locale}/privacy`}>{d.common.privacy}</a></span></label>{fieldError("consent") && <p className="error-text mt-2">{fieldError("consent")}</p>}

      {siteKey && <div className="cf-turnstile mt-6" data-sitekey={siteKey} data-callback="onRehletShifaaTurnstile" />}
      {errors.server && <p className="mt-6 rounded-md border border-alert-200 bg-alert-50 p-4 text-sm text-alert-800" role="alert">{errors.server}</p>}

      {!allValid && <p className="mt-7 flex items-center gap-2 text-sm text-ink-500"><span aria-hidden className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-mist text-ink-400">i</span>{t.reviewTitle}</p>}
      <button className="btn-primary mt-3 w-full transition-opacity disabled:opacity-50 disabled:saturate-[.6] disabled:cursor-not-allowed" disabled={busy || !allValid} type="submit" aria-disabled={busy || !allValid}>{busy ? d.form.sending : d.form.send}</button>
      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-500"><LockKeyhole size={14} />{d.form.secureNote}</p>
    </form>
  </>;
}

function Field({ label, required, requiredMark, valid, error, hint, children }: { label: string; required?: boolean; requiredMark?: string; valid?: boolean; error?: string; hint?: string; children: React.ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }> }) {
  const errorId = useId();
  const control = isValidElement(children)
    ? cloneElement(children, { "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined })
    : children;
  return <label className="block">
    <span className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-800">{label}{required && <span className="font-bold text-alert-700"><span aria-hidden className="text-base leading-none">*</span><span className="sr-only"> {requiredMark ?? "required"}</span></span>}{valid && !error && <Check size={15} className="text-brand-600" aria-hidden />}</span>
    {control}
    {error ? <span id={errorId} className="error-text mt-2 flex items-center gap-1"><X size={13} aria-hidden />{error}</span> : hint ? <span className="mt-2 block text-xs leading-5 text-ink-500">{hint}</span> : null}
  </label>;
}

function CountrySelect({ value, placeholder, emptyLabel, clearLabel, invalid, onChange, onBlur, ...aria }: { locale: Locale; value: Country | null; placeholder: string; emptyLabel: string; clearLabel: string; invalid?: boolean; onChange: (c: Country | null) => void; onBlur?: () => void; "aria-invalid"?: boolean; "aria-describedby"?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q || c.dial.replace("+", "").startsWith(q.replace("+", "")));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); onBlur?.(); } }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onBlur]);

  function choose(c: Country) { onChange(c); setQuery(""); setOpen(false); }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { if (open && results[active]) { e.preventDefault(); choose(results[active]); } }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return <div ref={rootRef} className="relative">
    <div className={`flex items-center rounded-[0.55rem] border bg-white ${invalid ? "border-alert-700" : open ? "border-brand-600 shadow-[0_0_0_3px_var(--color-brand-100)]" : "border-line-strong"}`}>
      {value && !open && <span className="ps-3 text-lg leading-none" aria-hidden>{flagEmoji(value.iso2)}</span>}
      <Search size={16} aria-hidden className={`ms-3 text-ink-400 ${value && !open ? "hidden" : ""}`} />
      <input
        ref={inputRef} {...aria}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        className="min-w-0 flex-1 bg-transparent px-2 py-3 text-ink-900 outline-none placeholder:text-ink-400"
        placeholder={value && !open ? "" : placeholder}
        value={open ? query : value?.name ?? ""}
        onChange={e => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onKeyDown={onKey}
      />
      {value && <button type="button" aria-label={clearLabel} className="flex-none px-2 text-ink-400 hover:text-ink-700" onClick={() => { onChange(null); setQuery(""); inputRef.current?.focus(); }}><X size={16} /></button>}
      <ChevronDown size={18} aria-hidden className={`me-2 flex-none text-ink-400 transition ${open ? "rotate-180" : ""}`} />
    </div>
    {open && <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
      {results.length === 0 ? <li className="px-4 py-3 text-sm text-ink-500">{emptyLabel}</li> : results.map((c, i) => {
        const selected = value?.iso2 === c.iso2;
        return <li key={c.iso2} role="option" aria-selected={selected}
          className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm ${i === active ? "bg-brand-50" : ""} ${selected ? "font-bold" : ""}`}
          onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); choose(c); }}>
          <span className="text-lg leading-none" aria-hidden>{flagEmoji(c.iso2)}</span>
          <span className="min-w-0 flex-1 truncate text-ink-800">{c.name}</span>
          <span className="flex-none text-ink-400" dir="ltr">{c.dial}</span>
          {selected && <Check size={16} className="flex-none text-brand-600" aria-hidden />}
        </li>;
      })}
    </ul>}
  </div>;
}
