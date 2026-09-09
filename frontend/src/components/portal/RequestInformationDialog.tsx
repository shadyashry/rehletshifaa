"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import type { Locale } from "@/lib/i18n";

export type RequestedItem = { kind: "INFORMATION" | "DOCUMENT"; code: string; label: string; required: boolean };
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;

/** The things coordinators ask for most often; anything else goes in the custom field. */
const CATALOGUE: { code: string; kind: "INFORMATION" | "DOCUMENT"; en: string; ar: string }[] = [
  { code: "MEDICAL_HISTORY", kind: "INFORMATION", en: "Medical history", ar: "التاريخ الطبي" },
  { code: "CURRENT_MEDICATION", kind: "INFORMATION", en: "Current medication", ar: "الأدوية الحالية" },
  { code: "PREVIOUS_DIAGNOSIS", kind: "INFORMATION", en: "Previous diagnosis", ar: "التشخيص السابق" },
  { code: "PREFERRED_DATES", kind: "INFORMATION", en: "Preferred treatment dates", ar: "المواعيد المفضلة للعلاج" },
  { code: "MEDICAL_REPORT", kind: "DOCUMENT", en: "Medical report", ar: "التقرير الطبي" },
  { code: "IMAGING_REPORT", kind: "DOCUMENT", en: "Imaging / scan report", ar: "تقرير الأشعة" },
  { code: "LAB_RESULTS", kind: "DOCUMENT", en: "Laboratory results", ar: "نتائج التحاليل" },
];

/**
 * "Request more information" as a real operation: the coordinator states exactly what is needed, whether
 * the journey waits for it, and by when. One backend command creates the patient action, sends the secure
 * link and moves responsibility to the patient.
 */
export function RequestInformationDialog({ locale, caseIds, busy, mutate, onClose, onDone }: {
  locale: Locale; caseIds: string[]; busy: boolean; mutate: Mutate; onClose: () => void; onDone?: () => void;
}) {
  const ar = locale === "ar";
  const t = ar
    ? { title: "طلب معلومات من المريض", intro: "حدّد ما تحتاجه بالضبط. سيصل المريض إلى نموذج آمن يعرض هذه العناصر فقط.",
        needed: "المطلوب", custom: "طلب آخر", customHint: "اكتب ما تحتاجه بالضبط", add: "إضافة",
        message: "رسالة للمريض", messageHint: "ستظهر في البريد وفي صفحة الطلب الآمنة.",
        blocking: "لا يمكن متابعة الرحلة قبل الرد", blockingHint: "أوقف هذا الخيار للطلبات الاختيارية.",
        due: "تاريخ الاستحقاق (اختياري)", send: "إرسال الطلب", sending: "جارٍ الإرسال…", cancel: "إلغاء", close: "إغلاق",
        empty: "اختر عنصرًا واحدًا على الأقل أو اكتب رسالة.", bulk: "سيُرسل الطلب إلى الحالات المحددة", document: "مستند", info: "معلومة" }
    : { title: "Request information from the patient", intro: "Say exactly what you need. The patient gets a secure form showing only these items.",
        needed: "What you need", custom: "Something else", customHint: "Describe exactly what you need", add: "Add",
        message: "Message to the patient", messageHint: "Shown in the email and on the secure request page.",
        blocking: "The journey cannot continue until the patient responds", blockingHint: "Turn this off for optional requests.",
        due: "Due date (optional)", send: "Send request", sending: "Sending…", cancel: "Cancel", close: "Close",
        empty: "Choose at least one item or write a message.", bulk: "The request is sent to the selected cases", document: "Document", info: "Information" };

  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<RequestedItem[]>([]);
  const [customText, setCustomText] = useState("");
  const [customKind, setCustomKind] = useState<"INFORMATION" | "DOCUMENT">("INFORMATION");
  const [message, setMessage] = useState("");
  const [blocking, setBlocking] = useState(true);
  const [due, setDue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { dialog.current?.showModal(); }, []);

  function addCustom() {
    const label = customText.trim();
    if (!label) return;
    setCustom(current => [...current, { kind: customKind, code: `CUSTOM_${Date.now()}`, label, required: true }]);
    setCustomText("");
  }

  function items(): RequestedItem[] {
    return [
      ...CATALOGUE.filter(entry => selected.includes(entry.code))
        .map(entry => ({ kind: entry.kind, code: entry.code, label: ar ? entry.ar : entry.en, required: true })),
      ...custom,
    ];
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const requested = items();
    if (!requested.length && !message.trim()) { setError(t.empty); return; }
    setError("");
    const body = {
      message: message.trim() || null, items: requested, blocking,
      dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : null, language: locale,
    };
    for (const caseId of caseIds) {
      const result = await mutate(`/coordinator/cases/${caseId}/information-requests`, body);
      if (!result) return; // the portal surfaces the error; keep the dialog open with everything typed
    }
    onDone?.();
    onClose();
  }

  return (
    <dialog ref={dialog} className="account-dialog" aria-labelledby={headingId} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={headingId} className="title">{t.title}</h2>
        <button type="button" className="icon-button" aria-label={t.close} onClick={() => dialog.current?.close()}><X size={20}/></button>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-600">{t.intro}</p>
      {caseIds.length > 1 && <p className="mt-2 text-sm font-semibold text-brand-700">{t.bulk} ({caseIds.length})</p>}

      <form className="mt-5 space-y-5" onSubmit={send}>
        <fieldset>
          <legend className="text-sm font-bold text-ink-800">{t.needed}</legend>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATALOGUE.map(entry => (
              <li key={entry.code}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                  <input type="checkbox" className="mt-0.5 h-4.5 w-4.5 flex-none accent-brand-600" checked={selected.includes(entry.code)}
                         onChange={event => setSelected(current => event.target.checked ? [...current, entry.code] : current.filter(code => code !== entry.code))}/>
                  <span>
                    <span className="font-semibold text-ink-800">{ar ? entry.ar : entry.en}</span>
                    <span className="block text-xs text-ink-500">{entry.kind === "DOCUMENT" ? t.document : t.info}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {custom.length > 0 && (
            <ul className="mt-2 space-y-2">
              {custom.map(item => (
                <li key={item.code} className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm">
                  <span className="font-semibold text-ink-800">{item.label} <span className="text-xs font-normal text-ink-500">· {item.kind === "DOCUMENT" ? t.document : t.info}</span></span>
                  <button type="button" className="icon-button" aria-label={`${t.cancel}: ${item.label}`}
                          onClick={() => setCustom(current => current.filter(entry => entry.code !== item.code))}><X size={16}/></button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="flex-1 text-sm font-semibold">
              <span className="sr-only">{t.custom}</span>
              <input className="field" placeholder={t.customHint} value={customText} maxLength={240}
                     onChange={event => setCustomText(event.target.value)}
                     onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }}/>
            </label>
            <label className="text-sm font-semibold sm:w-40">
              <span className="sr-only">{t.custom}</span>
              <select className="field" value={customKind} onChange={event => setCustomKind(event.target.value as "INFORMATION" | "DOCUMENT")}>
                <option value="INFORMATION">{t.info}</option>
                <option value="DOCUMENT">{t.document}</option>
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={addCustom} disabled={!customText.trim()}>{t.add}</button>
          </div>
        </fieldset>

        <label className="block text-sm font-bold text-ink-800">
          {t.message}
          <textarea className="field mt-2 min-h-24" maxLength={4000} value={message} onChange={event => setMessage(event.target.value)}/>
          <span className="mt-1 block text-xs font-normal text-ink-500">{t.messageHint}</span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-1 h-4.5 w-4.5 flex-none accent-brand-600" checked={blocking} onChange={event => setBlocking(event.target.checked)}/>
          <span className="text-sm">
            <span className="font-semibold text-ink-800">{t.blocking}</span>
            <span className="block text-xs text-ink-500">{t.blockingHint}</span>
          </span>
        </label>

        <label className="block text-sm font-bold text-ink-800 sm:w-56">
          {t.due}
          <input type="date" className="field mt-2" value={due} min={new Date().toISOString().slice(0, 10)} onChange={event => setDue(event.target.value)}/>
        </label>

        {error && <p role="alert" className="rounded-xl bg-alert-50 p-3 text-sm text-alert-800">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button className="btn-primary" disabled={busy}>{busy ? t.sending : t.send}</button>
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>{t.cancel}</button>
        </div>
      </form>
    </dialog>
  );
}
