"use client";

import { useState } from "react";

import type { Locale } from "@/lib/i18n";

type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
type Identity = { status: string; rejectionReason?: string | null } | null;

/**
 * The one patient-owned readiness step that is done inside the portal: identity verification, asked for
 * only when the backend resolves VERIFY_IDENTITY (travel support is part of the care). The form is the
 * step's single action; while a submission is under review it collapses to its status.
 */
export function PatientIdentityStep({ locale, caseId, identity, busy, mutate }: { locale: Locale; caseId: string; identity: Identity; busy: boolean; mutate: Mutate }) {
  const ar = locale === "ar";
  const t = ar
    ? { legalName: "الاسم القانوني الكامل (كما في الهوية)", dob: "تاريخ الميلاد", nationality: "الجنسية", docType: "نوع المستند", passport: "جواز سفر", nationalId: "بطاقة هوية وطنية", issuingCountry: "بلد الإصدار", docRef: "رقم المستند", submit: "إرسال للتحقق", pending: "تم الإرسال — بانتظار المراجعة.", review: "قيد المراجعة من فريقنا.", rejected: "لم يتم التحقق. يُرجى إعادة الإرسال.", required: "مطلوب" }
    : { legalName: "Full legal name (as on your ID)", dob: "Date of birth", nationality: "Nationality", docType: "Document type", passport: "Passport", nationalId: "National ID", issuingCountry: "Issuing country", docRef: "Document number", submit: "Submit for verification", pending: "Submitted — awaiting review.", review: "Under review by our team.", rejected: "Not verified. Please resubmit.", required: "required" };
  const [form, setForm] = useState({ legalName: "", dateOfBirth: "", nationality: "", documentType: "PASSPORT", issuingCountry: "", documentReference: "" });
  const status = identity?.status;
  if (status === "PENDING" || status === "MANUAL_REVIEW")
    return <p role="status" className="rounded-lg border border-brand-200 bg-white px-4 py-3 text-[0.92rem] text-ink-800">{status === "PENDING" ? t.pending : t.review}</p>;
  const complete = Object.values(form).every(value => value.trim());
  const field = (key: keyof typeof form, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block text-[0.85rem] font-bold text-ink-700">
      <span className="mb-1 block">{label} <span className="text-alert-700" aria-hidden>*</span><span className="sr-only"> ({t.required})</span></span>
      <input className="field" required value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} {...extra}/>
    </label>
  );
  return (
    <form className="rounded-lg border border-brand-200 bg-white p-4" onSubmit={event => {
      event.preventDefault();
      if (!complete) return;
      void mutate(`/patient/cases/${caseId}/identity`, { subjectType: "PATIENT", ...form });
    }}>
      {status === "REJECTED" && <p role="alert" className="mb-3 rounded-lg bg-alert-50 px-3 py-2 text-[0.88rem] text-alert-800">{t.rejected}{identity?.rejectionReason ? ` — ${identity.rejectionReason}` : ""}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("legalName", t.legalName, { autoComplete: "name" })}
        {field("dateOfBirth", t.dob, { type: "date" })}
        {field("nationality", t.nationality)}
        <label className="block text-[0.85rem] font-bold text-ink-700">
          <span className="mb-1 block">{t.docType}</span>
          <select className="field" value={form.documentType} onChange={e => setForm({ ...form, documentType: e.target.value })}>
            <option value="PASSPORT">{t.passport}</option><option value="NATIONAL_ID">{t.nationalId}</option>
          </select>
        </label>
        {field("issuingCountry", t.issuingCountry)}
        {field("documentReference", t.docRef, { dir: "ltr" })}
      </div>
      <button className="btn-primary mt-4" disabled={busy || !complete}>{t.submit}</button>
    </form>
  );
}
