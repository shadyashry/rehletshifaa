"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";

type Item = { id: string; category: string; description: string; quantity: number; unitPrice: number; optional: boolean };
type Proposal = { caseId: string; caseNumber: string; patientName: string; currency?: string; items: Item[]; validUntil?: string; signed: boolean; recommendedTreatment?: string; risksAndLimitations?: string };

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const copy = {
  en: {
    title: "Your treatment proposal", greeting: "Prepared for", total: "Total", validUntil: "Valid until", treatmentLabel: "Recommended treatment", risksLabel: "Risks & limitations", servicesLabel: "Services & costs",
    signLabel: "Type your full name to sign", signPlaceholder: "Full name",
    uploadLabel: "Optionally upload a signed copy", uploadBtn: "Choose file", uploading: "Uploading…", uploaded: "Signed copy attached",
    submit: "Sign & submit for approval", submitting: "Submitting…",
    doneTitle: "Thank you — your approval was submitted", doneMsg: "Your coordinator will continue with the next steps.",
    invalid: "This proposal link is invalid or has expired.", error: "The request could not be completed.", uploadFailed: "The file could not be uploaded.", loading: "Loading your proposal…",
  },
  ar: {
    title: "عرض العلاج الخاص بك", greeting: "أُعدّ لصالح", total: "الإجمالي", validUntil: "صالح حتى", treatmentLabel: "العلاج الموصى به", risksLabel: "المخاطر والقيود", servicesLabel: "الخدمات والتكاليف",
    signLabel: "اكتب اسمك الكامل للتوقيع", signPlaceholder: "الاسم الكامل",
    uploadLabel: "يمكنك رفع نسخة موقّعة (اختياري)", uploadBtn: "اختر ملفًا", uploading: "جارٍ الرفع…", uploaded: "تم إرفاق النسخة الموقّعة",
    submit: "التوقيع والإرسال للموافقة", submitting: "جارٍ الإرسال…",
    doneTitle: "شكرًا لك — تم إرسال موافقتك", doneMsg: "سيكمل منسّق حالتك الخطوات التالية.",
    invalid: "رابط العرض غير صالح أو منتهي الصلاحية.", error: "تعذر إكمال الطلب.", uploadFailed: "تعذر رفع الملف.", loading: "جارٍ تحميل العرض…",
  },
};

export function ProposalSign({ locale, token }: { locale: Locale; token: string }) {
  const t = copy[locale];
  const [data, setData] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [docId, setDocId] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void fetch(`${API}/api/v1/public/proposals/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? t.invalid); return r.json() as Promise<Proposal>; })
      .then((d) => { setData(d); setDone(d.signed); })
      .catch((e) => setError(e instanceof Error ? e.message : t.invalid))
      .finally(() => setLoading(false));
  }, [token, t.invalid]);

  async function upload(file: File) {
    if (!data) return;
    setUploading(true); setError("");
    try {
      const pres = await fetch(`${API}/api/v1/cases/${data.caseId}/documents/presign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originalFileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }) }).then((r) => r.json() as Promise<{ documentId: string; uploadUrl: string; requiredHeaders?: Record<string, string> }>);
      await fetch(pres.uploadUrl, { method: "PUT", headers: { ...(pres.requiredHeaders ?? {}), "Content-Type": file.type || "application/octet-stream" }, body: file });
      await fetch(`${API}/api/v1/cases/${data.caseId}/documents/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: pres.documentId }) });
      setDocId(pres.documentId);
    } catch { setError(t.uploadFailed); } finally { setUploading(false); }
  }

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true); setError("");
    try {
      const r = await fetch(`${API}/api/v1/public/proposals/${token}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureName: name, signedDocumentId: docId }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? t.error);
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setSubmitting(false); }
  }

  const total = data ? data.items.filter((i) => !i.optional).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) : 0;

  return (
    <section className="section bg-mist">
      <div className="container-site max-w-2xl">
        {loading ? <p className="card p-6">{t.loading}</p> : done ? (
          <div className="card p-8 text-center">
            <h1 className="headline">{t.doneTitle}</h1>
            <p className="lead mt-4">{t.doneMsg}</p>
          </div>
        ) : !data ? (
          <p role="alert" className="card bg-alert-50 p-6 text-alert-800">{error || t.invalid}</p>
        ) : (
          <div className="card p-6 sm:p-8">
            <p className="eyebrow">RehletShifaa · {data.caseNumber}</p>
            <h1 className="headline mt-2">{t.title}</h1>
            <p className="mt-2 text-ink-600">{t.greeting} <strong>{data.patientName}</strong></p>
            {data.recommendedTreatment && <div className="mt-6"><p className="text-sm font-bold text-brand-700">{t.treatmentLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{data.recommendedTreatment}</p></div>}
            {data.risksAndLimitations && <div className="mt-4"><p className="text-sm font-bold text-brand-700">{t.risksLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{data.risksAndLimitations}</p></div>}
            <p className="mt-6 text-sm font-bold text-brand-700">{t.servicesLabel}</p>
            <ul className="mt-2 divide-y divide-line">
              {data.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-3">
                  <span>{item.description}{item.optional ? " (optional)" : ""}</span>
                  <span className="font-bold">{new Intl.NumberFormat(locale, { style: "currency", currency: data.currency ?? "USD" }).format(item.quantity * item.unitPrice)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-line pt-4 text-lg font-bold">
              <span>{t.total}</span>
              <span>{new Intl.NumberFormat(locale, { style: "currency", currency: data.currency ?? "USD" }).format(total)}</span>
            </div>
            {data.validUntil && <p className="mt-2 text-sm text-ink-500">{t.validUntil} {new Intl.DateTimeFormat(locale).format(new Date(data.validUntil))}</p>}

            <label className="mt-8 block text-sm font-bold">{t.signLabel}
              <input className="field mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.signPlaceholder} />
            </label>

            <div className="mt-4">
              <p className="text-sm font-bold">{t.uploadLabel}</p>
              <label className="btn-secondary mt-2 inline-block cursor-pointer">
                {uploading ? t.uploading : docId ? t.uploaded : t.uploadBtn}
                <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
              </label>
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-alert-800">{error}</p>}
            <button className="btn-primary mt-6 w-full" disabled={submitting || !name.trim()} onClick={() => void submit()}>{submitting ? t.submitting : t.submit}</button>
          </div>
        )}
      </div>
    </section>
  );
}
