"use client";

import { ChevronDown } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { CoordinationDepositTerms } from "@/components/CoordinationDepositTerms";
import { ARABIC_PENDING_NOTICE, ARABIC_TERMS_APPROVED, finalQuoteTerms } from "@/lib/commercial-terms";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

export type ProposalCopy = Dictionary["portalProposal"];
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
type Item = { id: string; description: string; quantity: number; unitPrice: number; optional: boolean };
export type PatientProposalData = {
  versionId: string; status: string; currency: string; validUntil?: string; documentType?: string;
  items: Item[]; coordinatorNotes?: string;
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/** Whole amounts without decimals, otherwise the currency's own precision (2 for USD, 3 for KWD, 0 for JPY). */
function formatMoney(amount: number, currency: string, locale: Locale) {
  try {
    const digits = new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : digits, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
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
    ? fill(copy.validUntil, { date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(proposal.validUntil)) })
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
            <CoordinationDepositTerms id="portal-deposit-terms" locale={locale} currency={proposal.currency} level={3} />
          )}
        </div>
      </details>

      {decision}
    </div>
  );
}

/**
 * The patient's decision on a released proposal. One primary action behind the acknowledgement; request changes and
 * decline stay available. Until the deposit, refund and cancellation terms are approved in Arabic (GATE 2, option B),
 * Arabic pages cannot complete the primary decision and say why.
 */
export function PatientProposalDecision({ locale, copy, caseId, proposal, mutate }: {
  locale: Locale; copy: ProposalCopy; caseId: string; proposal: { versionId: string; documentType?: string }; mutate: Mutate;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [comment, setComment] = useState("");
  const [noteMissing, setNoteMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const blockedNoteId = useId();
  const noteHintId = useId();
  const noteErrorId = useId();
  const quote = proposal.documentType === "FINAL_TREATMENT_QUOTE";
  const blocked = locale === "ar" && !ARABIC_TERMS_APPROVED;
  // The drawer is a modal dialog, so the page's own error banner is inert behind it: a failed decision is reported here.
  const decide = async (decision: string) => {
    setFailed(false);
    const result = await mutate(`/patient/cases/${caseId}/proposals/${proposal.versionId}/decision`, { decision, selectedOptionalItemIds: [], comment: comment.trim() || undefined });
    if (!result) setFailed(true);
  };

  // A change request with no note tells the coordinator nothing, so it asks for one first.
  const requestChanges = () => {
    if (!comment.trim()) { setNoteMissing(true); noteRef.current?.focus(); return; }
    void decide("REVISION_REQUESTED");
  };

  return (
    <section aria-labelledby="proposal-decision-title" className="space-y-4 border-t border-line pt-5">
      <h3 id="proposal-decision-title" className="text-[1.0625rem] font-semibold text-brand-900">{copy.decisionTitle}</h3>
      <p className="text-[0.9375rem] leading-6 text-ink-600">{quote ? copy.introQuote : copy.introEstimate}</p>
      {blocked && <p id={blockedNoteId} role="note" className="text-[0.9375rem] leading-6 text-ink-700">{quote ? copy.arabicTermsPendingQuote : copy.arabicTermsPending}</p>}
      <label className="flex items-start gap-3 text-[0.9375rem] leading-6 text-ink-800">
        <input type="checkbox" className="mt-1 h-5 w-5 flex-none" checked={acknowledged} disabled={blocked}
          aria-describedby={[quote ? undefined : "portal-deposit-terms", blocked ? blockedNoteId : undefined].filter(Boolean).join(" ") || undefined} onChange={(event) => setAcknowledged(event.target.checked)} />
        {quote ? copy.acknowledgeQuote : copy.acknowledgeEstimate}
      </label>
      <label className="block text-[0.9375rem] font-semibold text-ink-800">
        {copy.note}
        <textarea ref={noteRef} className={`field mt-2 ${noteMissing ? "field-error" : ""}`} value={comment} maxLength={10000}
          name="proposal-note" autoComplete="off"
          aria-invalid={noteMissing || undefined} aria-describedby={noteMissing ? `${noteHintId} ${noteErrorId}` : noteHintId}
          onChange={(event) => { setComment(event.target.value); if (event.target.value.trim()) setNoteMissing(false); }} />
      </label>
      <p id={noteHintId} className="-mt-2 text-[0.875rem] text-ink-500">{copy.noteHint}</p>
      {noteMissing && <p id={noteErrorId} role="alert" className="error-text">{copy.noteRequired}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={blocked || !acknowledged} aria-describedby={blocked ? blockedNoteId : undefined}
          onClick={() => void decide(quote ? "ACCEPTED" : "ACKNOWLEDGED")}>
          {quote ? copy.primaryQuote : copy.primaryEstimate}
        </button>
        <button type="button" className="btn-secondary" onClick={requestChanges}>{copy.requestChanges}</button>
        <button type="button" className="btn-secondary" onClick={() => { if (window.confirm(copy.declineConfirm)) void decide("DECLINED"); }}>{copy.decline}</button>
      </div>
      {failed && <p role="alert" className="error-text">{copy.decisionFailed}</p>}
    </section>
  );
}
