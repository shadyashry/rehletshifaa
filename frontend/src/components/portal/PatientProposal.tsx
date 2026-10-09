"use client";

import { ChevronDown } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { CoordinationDepositTerms } from "@/components/CoordinationDepositTerms";
import { ARABIC_PENDING_NOTICE, ARABIC_TERMS_APPROVED, finalQuoteTerms } from "@/lib/commercial-terms";
import { fillTemplate } from "@/lib/portal-labels";
import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";

export type ProposalCopy = Dictionary["portalProposal"];
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
type Item = { id: string; description: string; quantity: number; unitPrice: number; optional: boolean };
/** The assisted-decision facts the backend keeps per version (Arabic terms path); absent when there are none. */
export type ProposalAssistance = {
  requestedAt?: string | null; decisionSource?: string | null; recordedByName?: string | null; channel?: string | null;
  confirmedBy?: string | null; conversationAt?: string | null; decidedAt?: string | null;
};
export type PatientProposalData = {
  versionId: string; status: string; currency: string; validUntil?: string; documentType?: string;
  items: Item[]; coordinatorNotes?: string; assistance?: ProposalAssistance | null;
};

const longDate = (iso: string, locale: Locale) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(iso));

/**
 * "Recorded by … after a phone call with you": a decision the coordinator recorded never reads as the patient's own
 * click. When the channel, the confirmer or the date is unknown, it states only the plain fact that it was recorded —
 * never a phone call or a "you" that did not happen.
 */
function recordedLine(copy: ProposalCopy, assistance: ProposalAssistance, locale: Locale) {
  const t = copy.assisted;
  const channels = t.channel as Record<string, string>, who = t.who as Record<string, string>;
  const when = assistance.conversationAt ?? assistance.decidedAt;
  const name = isolate(assistance.recordedByName || t.nameFallback);
  if (!when || !assistance.channel || !Object.hasOwn(channels, assistance.channel) || !assistance.confirmedBy || !Object.hasOwn(who, assistance.confirmedBy))
    return fillTemplate(t.recordedPlain, { name });
  return fillTemplate(t.recorded, { name, date: longDate(when, locale), channel: channels[assistance.channel], who: who[assistance.confirmedBy] });
}

/** A person's name inside a sentence of the other script, isolated so a Latin name cannot reorder Arabic around it. */
const isolate = (name: string) => `\u2068${name}\u2069`;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Whole amounts without decimals, otherwise the currency's own precision (2 for USD, 3 for KWD, 0 for JPY). */
function formatMoney(amount: number, currency: string, locale: Locale) {
  try {
    const digits = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : digits, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${amount.toLocaleString(intlLocale(locale))} ${currency}`;
  }
}

/** Plain words for every status a patient can see; never the internal value. */
export function patientProposalStatus(copy: ProposalCopy, status: string, quote: boolean) {
  if (status === "ACCEPTED") return quote ? copy.status.ACCEPTED_quote : copy.status.ACCEPTED_estimate;
  const known = copy.status as Record<string, string>;
  return Object.hasOwn(known, status) && !status.startsWith("ACCEPTED_") ? known[status] : copy.status.other;
}

/**
 * The patient's proposal, read top to bottom as one decision: what it is and until when, the price, how firm that
 * price is, what the Consultant recommends, the terms (behind a disclosure, wording unchanged, pending legal review),
 * then the decision. Staff views keep their own proposal card; this is the patient's voice only.
 */
export function PatientProposal({ locale, copy, proposal, recommendation, decision }: {
  locale: Locale; copy: ProposalCopy; proposal: PatientProposalData;
  recommendation?: { treatment?: string | null; risks?: string | null } | null; decision?: ReactNode;
}) {
  const quote = proposal.documentType === "FINAL_TREATMENT_QUOTE";
  const ar = locale === "ar";
  const total = proposal.items.filter((item) => !item.optional).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const validUntil = proposal.validUntil
    // The viewer's own calendar day: a UTC day can read one day later than the real expiry west of UTC.
    ? fill(copy.validUntil, { date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(proposal.validUntil)) })
    : null;
  const hasRecommendation = !!(recommendation?.treatment || recommendation?.risks);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.9375rem] font-semibold text-brand-900">{quote ? copy.documentType.quote : copy.documentType.estimate}</p>
        <p className="mt-1 text-[0.875rem] text-ink-500">
          {patientProposalStatus(copy, proposal.status, quote)}
          {validUntil && <> · {validUntil}</>}
        </p>
        {proposal.assistance?.decisionSource === "RECORDED_ON_BEHALF" && (
          <p className="mt-2 max-w-[60ch] text-[0.875rem] leading-6 text-ink-700">
            {recordedLine(copy, proposal.assistance, locale)} {copy.assisted.dispute}
          </p>
        )}
      </header>

      <section aria-labelledby="proposal-total-label">
        <p id="proposal-total-label" className="text-[0.875rem] text-ink-500">{copy.totalLabel}</p>
        <p className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-brand-900 tabular-nums rtl:tracking-normal">
          <bdi dir="ltr">{formatMoney(total, proposal.currency, locale)}</bdi>
        </p>
        <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-7 text-ink-700">{quote ? copy.honestyQuote : copy.honestyEstimate}</p>
      </section>

      <section aria-labelledby="proposal-items-title">
        <h3 id="proposal-items-title" className="text-[0.9375rem] font-semibold text-brand-900">{copy.itemsLabel}</h3>
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {proposal.items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 py-3 text-[0.9375rem]">
              <span className="min-w-0 break-words text-ink-800">
                <bdi>{item.description}</bdi>
                {item.quantity > 1 && <span className="text-ink-500"> {fill(copy.quantity, { count: item.quantity })}</span>}
                {item.optional && <span className="text-ink-500"> ({copy.optional})</span>}
              </span>
              <bdi dir="ltr" className="shrink-0 font-semibold tabular-nums text-ink-900">{formatMoney(item.quantity * item.unitPrice, proposal.currency, locale)}</bdi>
            </li>
          ))}
        </ul>
      </section>

      {hasRecommendation && (
        <section aria-labelledby="proposal-recommendation-title">
          <h3 id="proposal-recommendation-title" className="text-[0.9375rem] font-semibold text-brand-900">{copy.recommendationTitle}</h3>
          {recommendation?.treatment && (
            <div className="mt-2">
              <p className="text-[0.875rem] font-semibold text-ink-700">{copy.treatment}</p>
              <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-7 text-ink-700">{recommendation.treatment}</p>
            </div>
          )}
          {recommendation?.risks && (
            <div className="mt-3">
              <p className="text-[0.875rem] font-semibold text-ink-700">{copy.risks}</p>
              <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-7 text-ink-600">{recommendation.risks}</p>
            </div>
          )}
        </section>
      )}

      {proposal.coordinatorNotes && (
        <section aria-labelledby="proposal-notes-title" className="border-t border-line pt-4">
          <h3 id="proposal-notes-title" className="text-[0.9375rem] font-semibold text-brand-900">{copy.notesTitle}</h3>
          <p dir="auto" className="mt-1 whitespace-pre-line break-words text-[0.9375rem] leading-7 text-ink-700">{proposal.coordinatorNotes}</p>
        </section>
      )}

      {/* Open while a decision is owed (owner decision, GATE 3): the acknowledgement says these terms were reviewed. React
          sets `open` once, so a patient can still close it. */}
      <details className="group border-t border-line pt-3" open={!!decision}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[0.9375rem] font-semibold text-brand-800 hover:text-brand-900 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
            {quote ? copy.termsQuote : copy.termsEstimate}
          </span>
          <span className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[0.8125rem] font-medium text-ink-600">{copy.pendingReview}</span>
        </summary>
        <div className="mt-3">
          {quote ? (
            <div>
              {ar && <p className="mb-3 text-[0.875rem] leading-6 text-ink-600">{ARABIC_PENDING_NOTICE}</p>}
              <div lang="en" dir="ltr" className="space-y-2 text-start text-[0.9375rem] leading-6 text-ink-700">
                <p>{finalQuoteTerms.changes}</p>
                <p className="font-semibold text-ink-800">{finalQuoteTerms.paymentTitle}</p>
                <p>{finalQuoteTerms.payment}</p>
              </div>
            </div>
          ) : (
            <CoordinationDepositTerms id="portal-deposit-terms" locale={locale} currency={proposal.currency} level={3} framed={false} />
          )}
        </div>
      </details>

      {decision}
    </div>
  );
}

/**
 * The patient's decision on a released proposal: one primary action, request changes beside it, and a quiet Decline
 * that asks again inside the drawer (never `window.confirm`, whose buttons speak the browser's language).
 *
 * <p>Until the deposit, refund and cancellation terms are approved in Arabic (GATE 2 option B), an Arabic page does not
 * ask the patient to accept English terms. Its primary action asks the coordinator to go through the terms in Arabic
 * and record the decision (owner decision, GATE P2-1); once asked, it says so. Deciding on the English page stays a
 * quiet secondary route.
 */
export function PatientProposalDecision({ locale, copy, caseId, proposal, coordinatorName, englishHref, mutate, onRequestAssistance, onMessage }: {
  locale: Locale; copy: ProposalCopy; caseId: string; proposal: { versionId: string; documentType?: string; assistance?: ProposalAssistance | null }; mutate: Mutate;
  coordinatorName?: string | null; englishHref?: string;
  /** Sends the request without closing the drawer, so the page can show that it was made. */
  onRequestAssistance?: (path: string) => Promise<unknown>;
  onMessage?: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [comment, setComment] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // The confirmation replaces the button that had focus, but it renders only once the refreshed case arrives, which can
  // take longer than a frame: focus it when it mounts, or at once if it is already there.
  const focusStatusPending = useRef(false);
  const statusMounted = (node: HTMLParagraphElement | null) => {
    statusRef.current = node;
    if (node && focusStatusPending.current) { focusStatusPending.current = false; node.focus(); }
  };
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const noteHintId = useId();
  const noteErrorId = useId();
  const termsHintId = useId();
  const declineTitleId = useId();
  const quote = proposal.documentType === "FINAL_TREATMENT_QUOTE";
  const assisted = locale === "ar" && !ARABIC_TERMS_APPROVED;
  const t = copy.assisted;
  const requestedAt = proposal.assistance?.requestedAt;
  // The drawer is a modal dialog, so the page's own error banner is inert behind it: a failed decision is reported here.
  const decide = async (decision: string) => {
    setFailed(false);
    const result = await mutate(`/patient/cases/${caseId}/proposals/${proposal.versionId}/decision`, { decision, selectedOptionalItemIds: [], comment: comment.trim() || undefined });
    if (result === undefined) setFailed(true);
  };
  const requestAssistance = async () => {
    setRequestFailed(false); setRequesting(true);
    const send = onRequestAssistance ?? ((path: string) => mutate(path));
    const result = await send(`/patient/cases/${caseId}/proposals/${proposal.versionId}/assistance`);
    setRequesting(false);
    if (result === undefined) { setRequestFailed(true); return; }
    if (!result) return;
    // The button that had focus is replaced by the confirmation: take focus there so it is read and the drawer keeps it.
    if (statusRef.current) statusRef.current.focus(); else focusStatusPending.current = true;
  };

  // A change request with no note tells the coordinator nothing, so it asks for one first.
  const requestChanges = () => {
    if (!comment.trim()) { setNoteMissing(true); noteRef.current?.focus(); return; }
    void decide("REVISION_REQUESTED");
  };

  // The confirm step takes focus on the safe choice; backing out returns focus to Decline.
  const confirmDecline = (open: boolean) => {
    setConfirmingDecline(open);
    requestAnimationFrame(() => (open ? keepRef : declineRef).current?.focus());
  };

  return (
    <section aria-labelledby="proposal-decision-title" className="space-y-4 border-t border-line pt-5">
      <h3 id="proposal-decision-title" className="text-[1.0625rem] font-semibold text-brand-900">{copy.decisionTitle}</h3>
      {assisted ? (
        <div className="space-y-3">
          <p className="max-w-[60ch] text-[0.9375rem] leading-7 text-ink-700">{quote ? t.explainQuote : t.explain}</p>
          {requestedAt ? (
            <div className="space-y-1">
              <p ref={statusMounted} tabIndex={-1} role="status" className="text-[0.9375rem] font-semibold leading-6 text-brand-900 outline-none">
                {fillTemplate(t.requested, { date: longDate(requestedAt, locale), name: isolate(coordinatorName || t.nameFallback) })}
              </p>
              {onMessage && (
                <button type="button" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current" onClick={onMessage}>
                  {t.message}
                </button>
              )}
            </div>
          ) : (
            <div>
              <button type="button" className="btn-primary" disabled={requesting} onClick={() => void requestAssistance()}>
                {requesting ? t.sending : fillTemplate(t.ask, { name: isolate(coordinatorName || t.askFallback) })}
              </button>
              {requestFailed && <p role="alert" className="error-text mt-2">{t.requestFailed}</p>}
            </div>
          )}
          {englishHref && (
            <p className="flex flex-wrap items-center gap-x-1.5 text-[0.875rem] leading-6 text-ink-600">
              {t.englishPrompt}
              <a href={englishHref} hrefLang="en" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current">{t.englishLink}</a>
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="text-[0.9375rem] leading-6 text-ink-600">{quote ? copy.introQuote : copy.introEstimate}</p>
          <label className="flex items-start gap-3 text-[0.9375rem] leading-6 text-ink-800">
            <input type="checkbox" className="mt-1 h-5 w-5 flex-none" checked={acknowledged}
              aria-describedby={quote ? undefined : "portal-deposit-terms"} onChange={(event) => setAcknowledged(event.target.checked)} />
            {quote ? copy.acknowledgeQuote : copy.acknowledgeEstimate}
          </label>
        </>
      )}
      <label className="block text-[0.9375rem] font-semibold text-ink-800">
        {copy.note}
        <textarea ref={noteRef} className={`field mt-2 ${noteMissing ? "field-error" : ""}`} value={comment} maxLength={10000}
          name="proposal-note" autoComplete="off"
          aria-invalid={noteMissing || undefined} aria-describedby={noteMissing ? `${noteHintId} ${noteErrorId}` : noteHintId}
          onChange={(event) => { setComment(event.target.value); if (event.target.value.trim()) setNoteMissing(false); }} />
      </label>
      <p id={noteHintId} className="-mt-2 text-[0.875rem] text-ink-500">{assisted ? t.noteHint : copy.noteHint}</p>
      {noteMissing && <p id={noteErrorId} role="alert" className="error-text">{copy.noteRequired}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {!assisted && (
          <button type="button" className="btn-primary" disabled={!acknowledged} aria-describedby={acknowledged ? undefined : termsHintId}
            onClick={() => void decide(quote ? "ACCEPTED" : "ACKNOWLEDGED")}>
            {quote ? copy.primaryQuote : copy.primaryEstimate}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={requestChanges}>{copy.requestChanges}</button>
      </div>
      {!assisted && !acknowledged && <p id={termsHintId} className="sr-only">{quote ? copy.acknowledgeQuote : copy.acknowledgeEstimate}</p>}
      {/* Decline is quieter than going ahead, and asks again here rather than in a browser dialog. */}
      {confirmingDecline ? (
        <div role="group" aria-labelledby={declineTitleId} className="space-y-3 border-t border-line pt-4">
          <p id={declineTitleId} className="text-[0.9375rem] font-semibold text-ink-900">{copy.declineConfirm}</p>
          <p className="text-[0.9375rem] leading-6 text-ink-700">{copy.declineConsequence}</p>
          <div className="flex flex-wrap gap-3">
            <button ref={keepRef} type="button" className="btn-secondary" onClick={() => confirmDecline(false)}>{copy.declineKeep}</button>
            <button type="button" className="btn-secondary !border-alert-600 !text-alert-700 hover:!bg-alert-50" onClick={() => void decide("DECLINED")}>{copy.decline}</button>
          </div>
        </div>
      ) : (
        <button ref={declineRef} type="button" className="inline-flex min-h-11 items-center text-[0.875rem] font-semibold text-ink-600 underline decoration-line-strong underline-offset-4 hover:text-alert-700 hover:decoration-current"
          onClick={() => confirmDecline(true)}>
          {copy.declineQuiet}
        </button>
      )}
      {failed && <p role="alert" className="error-text">{copy.decisionFailed}</p>}
    </section>
  );
}
