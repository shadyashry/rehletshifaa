"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import type { Locale } from "@/lib/i18n";

/**
 * Declining is a real workflow decision, so it asks for a reason the coordinator can act on rather than
 * a browser prompt. The backend stores a single free-text reason, so the structured choice and the
 * optional note are composed into one readable line — no schema change for the sake of the dialog.
 *
 * <p>The canonical English label is always sent: the reason becomes part of the coordinator's work item
 * and the audit record, where a consistent vocabulary is worth more than matching the consultant's UI
 * language. Anything the consultant types is passed through untouched.
 */
const REASONS = [
  { code: "SCOPE", en: "Outside my clinical scope", ar: "خارج نطاق تخصصي السريري" },
  { code: "AVAILABILITY", en: "Insufficient availability", ar: "لا يتوفر لدي وقت كافٍ" },
  { code: "UNABLE", en: "Unable to take this case", ar: "لا يمكنني تولّي هذه الحالة" },
  { code: "DUPLICATE", en: "Duplicate assignment", ar: "تعيين مكرر" },
  { code: "OTHER", en: "Other", ar: "سبب آخر" },
] as const;

/** Compose what the backend stores: the canonical reason, plus the note when one was written. */
export function composeDeclineReason(code: string, note: string) {
  const reason = REASONS.find(entry => entry.code === code)?.en ?? "Other";
  const trimmed = note.trim();
  return trimmed ? `${reason} - ${trimmed}` : reason;
}

export function DeclineAssignmentDialog({ locale, caseNumber, busy, onConfirm, onClose }: {
  locale: Locale; caseNumber?: string; busy?: boolean; onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const ar = locale === "ar";
  const t = ar
    ? { title: "رفض التعيين", intro: "ستعود الحالة إلى المنسق لإعادة تعيينها. اختر سببًا حتى يعرف المنسق ما يفعله بعد ذلك.",
        reason: "سبب الرفض", note: "ملاحظة للمنسق (اختياري)", notePlaceholder: "أي سياق يساعد المنسق",
        cancel: "إلغاء", confirm: "رفض التعيين", close: "إغلاق", required: "اختر سببًا للمتابعة." }
    : { title: "Decline assignment", intro: "The case goes back to the coordinator to reassign. Pick a reason so they know what to do next.",
        reason: "Reason", note: "Note for the coordinator (optional)", notePlaceholder: "Anything that helps the coordinator",
        cancel: "Cancel", confirm: "Decline assignment", close: "Close", required: "Choose a reason to continue." };

  const dialog = useRef<HTMLDialogElement>(null);
  const groupId = useId();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  // showModal gives the focus trap, Escape handling and focus restoration natively.
  useEffect(() => { dialog.current?.showModal(); }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code) { setTouched(true); return; }
    onConfirm(composeDeclineReason(code, note));
    dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="account-dialog" aria-labelledby={`${groupId}-title`} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`${groupId}-title`} className="title">{t.title}</h2>
          {caseNumber && <p className="mt-0.5 text-[0.8rem] font-semibold text-brand-700" dir="ltr">{caseNumber}</p>}
        </div>
        <button type="button" className="icon-button" aria-label={t.close} onClick={() => dialog.current?.close()}>
          <X size={20}/>
        </button>
      </div>

      <p className="mt-2 text-[0.9rem] leading-6 text-ink-600">{t.intro}</p>

      <form className="mt-5 space-y-5" onSubmit={submit} noValidate>
        <fieldset>
          <legend className="text-[0.8rem] font-bold text-ink-800">
            {t.reason}<span aria-hidden className="ms-1 text-alert-600">*</span>
            <span className="sr-only"> ({ar ? "مطلوب" : "required"})</span>
          </legend>
          <ul className="mt-2.5 space-y-2">
            {REASONS.map((entry, index) => (
              <li key={entry.code}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-[0.9rem] transition has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                  <input type="radio" name={`${groupId}-reason`} value={entry.code} className="h-4 w-4 flex-none accent-brand-600"
                         checked={code === entry.code} autoFocus={index === 0}
                         onChange={() => { setCode(entry.code); setTouched(false); }}/>
                  <span className="text-ink-800">{ar ? entry.ar : entry.en}</span>
                </label>
              </li>
            ))}
          </ul>
          {touched && !code && <p role="alert" className="error-text mt-2">{t.required}</p>}
        </fieldset>

        <label className="block text-[0.8rem] font-bold text-ink-800">
          {t.note}
          <textarea className="field mt-1.5 min-h-20" maxLength={400} value={note} placeholder={t.notePlaceholder}
                    onChange={event => setNote(event.target.value)}/>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button className="inline-flex min-h-11 items-center justify-center rounded-xl border border-alert-200 bg-white px-4 font-semibold text-alert-700 transition hover:border-alert-400 hover:bg-alert-50 disabled:opacity-55"
                  disabled={busy}>
            {t.confirm}
          </button>
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>{t.cancel}</button>
        </div>
      </form>
    </dialog>
  );
}
