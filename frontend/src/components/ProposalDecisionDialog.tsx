"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import type { Locale } from "@/lib/i18n";

/**
 * The two exceptional answers to a proposal, each asking for enough context that the coordinator can act
 * without a phone call.
 *
 * <p>The backend stores one free-text comment against the decision, so the chosen topic and the patient's
 * message are composed into a single readable line rather than growing the schema for the sake of a form.
 * The canonical English topic is always sent: it lands in the coordinator's work item and the audit trail,
 * where a stable vocabulary matters more than matching the patient's language. Their own words pass through
 * untouched.
 */
const TOPICS = [
  { code: "TREATMENT", en: "The treatment recommendation", ar: "التوصية العلاجية" },
  { code: "SERVICES", en: "The included services", ar: "الخدمات المشمولة" },
  { code: "COST", en: "The estimated cost", ar: "التكلفة التقديرية" },
  { code: "OTHER", en: "Something else", ar: "شيء آخر" },
] as const;

export function composeProposalComment(code: string, message: string) {
  const topic = TOPICS.find((entry) => entry.code === code)?.en;
  const trimmed = message.trim();
  if (!topic) return trimmed || undefined;
  return trimmed ? `${topic} - ${trimmed}` : topic;
}

export function ProposalDecisionDialog({ locale, kind, busy, onConfirm, onClose }: {
  locale: Locale; kind: "REVISION_REQUESTED" | "DECLINED"; busy?: boolean;
  onConfirm: (comment?: string) => void; onClose: () => void;
}) {
  const ar = locale === "ar";
  const revision = kind === "REVISION_REQUESTED";
  const t = ar
    ? { revisionTitle: "طلب تعديلات", revisionIntro: "أخبرنا بما تودّ تغييره وسيقوم منسّق حالتك بإعداد مستند محدّث وإرسال رابط آمن جديد إليك.",
        declineTitle: "رفض هذا التقدير", declineIntro: "سيُسجَّل ردك ولن يستمر هذا التقدير. يبقى منسّق حالتك متاحًا إذا تغيّر أي شيء لاحقًا.",
        topic: "ما الذي تودّ مراجعته؟", message: "رسالتك", messageOptional: "رسالتك (اختياري)",
        placeholder: "اشرح ما تودّ تغييره", declinePlaceholder: "أخبرنا بالسبب إن رغبت",
        cancel: "إلغاء", sendRevision: "إرسال الطلب", confirmDecline: "تأكيد الرفض", close: "إغلاق",
        requiredTopic: "اختر موضوعًا للمتابعة.", requiredMessage: "اكتب رسالة قصيرة للمتابعة." }
    : { revisionTitle: "Request changes", revisionIntro: "Tell us what you would like changed. Your coordinator will prepare an updated document and send you a new secure link.",
        declineTitle: "Decline this estimate", declineIntro: "Your response is recorded and this estimate will not continue. Your coordinator stays available if anything changes later.",
        topic: "What would you like reviewed?", message: "Your message", messageOptional: "Your message (optional)",
        placeholder: "Describe what you would like changed", declinePlaceholder: "Tell us why, if you would like to",
        cancel: "Cancel", sendRevision: "Send request", confirmDecline: "Confirm decline", close: "Close",
        requiredTopic: "Choose a topic to continue.", requiredMessage: "Add a short message to continue." };

  const dialog = useRef<HTMLDialogElement>(null);
  const firstControl = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const groupId = useId();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  // showModal gives the focus trap, Escape handling and focus restoration natively, but it parks focus
  // on the first focusable node — the close button — so the first thing the patient is actually asked
  // for is moved into focus explicitly. React's autoFocus does not survive showModal being called later.
  useEffect(() => { dialog.current?.showModal(); firstControl.current?.focus(); }, []);

  const missingTopic = revision && !code;
  const missingMessage = revision && !message.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (missingTopic || missingMessage) { setTouched(true); return; }
    onConfirm(revision ? composeProposalComment(code, message) : (message.trim() || undefined));
    dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="account-dialog" aria-labelledby={`${groupId}-title`} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={`${groupId}-title`} className="title">{revision ? t.revisionTitle : t.declineTitle}</h2>
        <button type="button" className="icon-button" aria-label={t.close} onClick={() => dialog.current?.close()}>
          <X size={20} />
        </button>
      </div>

      <p className="mt-2 text-[0.9rem] leading-6 text-ink-600">{revision ? t.revisionIntro : t.declineIntro}</p>

      <form className="mt-5 space-y-5" onSubmit={submit} noValidate>
        {revision && (
          <fieldset>
            <legend className="text-[0.8rem] font-bold text-ink-800">
              {t.topic}<span aria-hidden className="ms-1 text-alert-600">*</span>
              <span className="sr-only"> ({ar ? "مطلوب" : "required"})</span>
            </legend>
            <ul className="mt-2.5 space-y-2">
              {TOPICS.map((entry, index) => (
                <li key={entry.code}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-[0.9rem] transition has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                    <input type="radio" name={`${groupId}-topic`} value={entry.code} className="h-4 w-4 flex-none accent-brand-600"
                           ref={index === 0 ? (firstControl as React.RefObject<HTMLInputElement>) : undefined}
                           checked={code === entry.code}
                           onChange={() => { setCode(entry.code); setTouched(false); }} />
                    <span className="text-ink-800">{ar ? entry.ar : entry.en}</span>
                  </label>
                </li>
              ))}
            </ul>
            {touched && missingTopic && <p role="alert" className="mt-2 text-[0.82rem] font-semibold text-alert-700">{t.requiredTopic}</p>}
          </fieldset>
        )}

        <div>
          <label htmlFor={`${groupId}-message`} className="block text-[0.8rem] font-bold text-ink-800">
            {revision ? t.message : t.messageOptional}
            {revision && <span aria-hidden className="ms-1 text-alert-600">*</span>}
          </label>
          <textarea id={`${groupId}-message`} className="field mt-2 min-h-24" maxLength={10000} value={message}
                    ref={revision ? undefined : (firstControl as React.RefObject<HTMLTextAreaElement>)}
                    aria-invalid={touched && missingMessage ? true : undefined}
                    aria-describedby={touched && missingMessage ? `${groupId}-message-error` : undefined}
                    placeholder={revision ? t.placeholder : t.declinePlaceholder}
                    onChange={(event) => { setMessage(event.target.value); setTouched(false); }} />
          {touched && missingMessage && <p id={`${groupId}-message-error`} role="alert" className="mt-2 text-[0.82rem] font-semibold text-alert-700">{t.requiredMessage}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn-secondary min-h-11" onClick={() => dialog.current?.close()}>{t.cancel}</button>
          <button type="submit" disabled={busy}
                  className={revision
                    ? "btn-primary min-h-11"
                    : "min-h-11 rounded-xl border border-alert-300 bg-alert-50 px-5 text-[0.92rem] font-bold text-alert-700 transition hover:border-alert-400 disabled:opacity-50"}>
            {revision ? t.sendRevision : t.confirmDecline}
          </button>
        </div>
      </form>
    </dialog>
  );
}
