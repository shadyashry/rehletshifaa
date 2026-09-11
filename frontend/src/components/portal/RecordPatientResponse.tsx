"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
type Item = { id: string; kind: string; label: string; required: boolean; completed: boolean };
/**
 * WhatsApp and phone stay conversation channels, not a data source: when a patient answers there, the
 * coordinator records it here and the value is stored as patient-reported, with the staff identity and
 * channel kept alongside it. It never looks like the patient typed it themselves.
 */
/** Controlled when {@code open}/{@code onOpenChange} are given (the case page opens it from More actions); otherwise it carries its own button. */
export function RecordPatientResponse({ locale, caseId, action, mutate, open: controlledOpen, onOpenChange, hideTrigger = false }: { locale: Locale; caseId: string; action?: { items: Item[] } | null; mutate: Mutate; open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean }) {
  const ar = locale === "ar";
  const t = ar
    ? { open: "تسجيل رد المريض", title: "تسجيل ما قدّمه المريض", intro: "استخدم هذا عندما يرد المريض عبر واتساب أو الهاتف. سيُحفظ المصدر والقناة مع البيانات.",
        channel: "القناة", whatsapp: "واتساب", phone: "هاتف", assisted: "جلسة مساعدة", note: "ملاحظة (اختياري)",
        save: "حفظ الرد", saving: "جارٍ الحفظ…", cancel: "إلغاء", close: "إغلاق", none: "لا يوجد طلب معلومات مفتوح لهذه الحالة.",
        loading: "جارٍ التحميل…", provenance: "سيظهر أن المعلومات مُبلّغة من المريض ومسجّلة بواسطتك." }
    : { open: "Record patient response", title: "Record what the patient provided", intro: "Use this when the patient answers on WhatsApp or by phone. The source and channel are stored with the value.",
        channel: "Channel", whatsapp: "WhatsApp", phone: "Phone", assisted: "Assisted session", note: "Note (optional)",
        save: "Save response", saving: "Saving…", cancel: "Cancel", close: "Close", none: "There is no open information request for this case.",
        loading: "Loading…", provenance: "Recorded as patient-reported, captured by you." };
  const dialog = useRef<HTMLDialogElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => { setInternalOpen(next); onOpenChange?.(next); };
  const items = (action?.items ?? []).filter(item => !item.completed);
  const [values, setValues] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState("WHATSAPP");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  // Nothing was asked of this patient, so there is nothing to record on their behalf.
  if (!items.length) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const payload = {
      channel,
      note: note.trim() || null,
      items: Object.entries(values).filter(([, value]) => value.trim()).map(([id, value]) => ({ itemId: id, value: value.trim(), documentId: null })),
    };
    const result = await mutate(`/coordinator/cases/${caseId}/information-requests/on-behalf`, payload);
    setBusy(false);
    if (result) { setOpen(false); setValues({}); setNote(""); }
  }
  return <>
    {!hideTrigger && <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
      <MessageSquare size={16} className="me-1 inline" aria-hidden/>{t.open}
    </button>}
    {open && (
      <dialog ref={dialog} className="account-dialog" aria-labelledby="on-behalf-heading" onClose={() => setOpen(false)}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="on-behalf-heading" className="title">{t.title}</h2>
          <button type="button" className="icon-button" aria-label={t.close} onClick={() => dialog.current?.close()}><X size={20}/></button>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-600">{t.intro}</p>
        <form className="mt-5 space-y-5" onSubmit={save}>
              {items.map(item => (
                <label key={item.id} className="block text-sm font-bold text-ink-800">
                  {item.label}{item.required && <span aria-hidden className="ms-1 text-alert-600">*</span>}
                  <textarea className="field mt-2 min-h-20" maxLength={4000} value={values[item.id] ?? ""}
                            onChange={event => setValues(current => ({ ...current, [item.id]: event.target.value }))}/>
                </label>
              ))}
              <label className="block text-sm font-bold text-ink-800 sm:w-56">
                {t.channel}
                <select className="field mt-2" value={channel} onChange={event => setChannel(event.target.value)}>
                  <option value="WHATSAPP">{t.whatsapp}</option>
                  <option value="PHONE">{t.phone}</option>
                  <option value="ASSISTED">{t.assisted}</option>
                </select>
              </label>
              <label className="block text-sm font-bold text-ink-800">
                {t.note}
                <textarea className="field mt-2 min-h-16" maxLength={4000} value={note} onChange={event => setNote(event.target.value)}/>
              </label>
              <p className="rounded-xl bg-mist p-3 text-xs leading-5 text-ink-600">{t.provenance}</p>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <button className="btn-primary" disabled={busy}>{busy ? t.saving : t.save}</button>
                <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>{t.cancel}</button>
              </div>
        </form>
      </dialog>
    )}
  </>;
}
