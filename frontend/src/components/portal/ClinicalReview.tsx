"use client";

import { useId, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { CURRENCY_LABELS, type DirectoryFacility } from "@/components/portal/portal-model";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { BASE, DecisionSummary, DisclosureChevron, EstimateLines, RecommendationFields, currencyName, land, useClinicalDecision, type CatalogService, type DecisionLine, type PayeeWords } from "@/components/portal/ClinicalDecision";

export type { CatalogService } from "@/components/portal/ClinicalDecision";
export type FxRate = { currency: string; rate: number; rateDate: string; source: string };
export type ReviewDraft = { id: string; recommendedTreatment?: string | null; risksAndLimitations?: string | null; costEstimates?: DecisionLine[]; proposalCurrency?: string | null } | null;
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;

/** Only the outcomes the domain actually accepts, in the order a Consultant would consider them. */
// Transfers and second opinions go through the controlled referral flow (ConsultantReferrals), never through here.
const OUTCOMES = ["INFO", "RETURN_TO_COORDINATOR", "NOT_SUITABLE"] as const;
type Outcome = (typeof OUTCOMES)[number];

/**
 * The Consultant's clinical review: "1 Recommendation", "2 Estimate lines", then the summary and its one filled button.
 * The evidence (intake summary, documents on file) opens the sheet above this panel, or in the case rail on large screens.
 *
 * <p>There is one normal completion — Submit recommendation — which the backend turns into a coordinator handoff by
 * itself; the exceptional outcomes stay behind a single disclosure and are confirmed in a dialog before they are sent.
 * The form is seeded once from the draft: the case view is mounted per case, and a saved draft is what was just typed.
 */
export function ClinicalReviewPanel({ locale, caseId, busy, catalog, fxRates, facilities = [], documentsOnFile, draft, mutate, payees }: {
  locale: Locale; caseId: string; busy: boolean; catalog: CatalogService[]; fxRates: FxRate[]; /** P0-5: active facilities with Finance-approved packages. */ facilities?: DirectoryFacility[];
  /** How many documents are on file (the evidence above lists them). */ documentsOnFile: number; draft?: ReviewDraft; mutate: Mutate;
  /** P1-19: the "Paid to" words for an off-list line (`portalProposal.price.payees`). */ payees: PayeeWords;
}) {
  const copy = useWorkCopy().clinicalDecision;
  const id = useId();
  const decision = useClinicalDecision({ seed: draft, catalog, facilities });
  const [proposalCurrency, setProposalCurrency] = useState(draft?.proposalCurrency ?? BASE);
  const [draftError, setDraftError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [outcomeError, setOutcomeError] = useState("");
  const [confirming, setConfirming] = useState<Outcome | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // The chosen currency stays listed even when its rate is gone (or not loaded yet), so the control shows what will be sent.
  const currencies = [...new Set([BASE, ...fxRates.filter(fx => fx.currency !== BASE).map(fx => fx.currency), proposalCurrency])];
  const fx = fxRates.find(rate => rate.currency === proposalCurrency);
  const noRate = proposalCurrency !== BASE && !fx;
  const rate = fx?.rate ?? 1;
  // QA #12, one rounding rule: each line converted and rounded to the cent, then added — the proposal's own arithmetic.
  const convertedTotal = decision.lines.amountsEgp().reduce((sum, egp) => sum + Math.round(egp * rate * 100) / 100, 0);
  const body = () => ({ proposalCurrency, risksAndLimitations: decision.risks.trim() || undefined, costEstimates: decision.lines.estimates() });

  const submit = () => {
    setDraftError("");
    if (!decision.validate()) return;
    void mutate(`/doctor/cases/${caseId}/review-decision`, { decision: "ACCEPT", recommendedTreatment: decision.recommendation.trim(), ...body() });
  };
  const saveDraft = () => {
    if (!decision.recommendation.trim() && decision.lines.count === 0) { setDraftError(copy.errors.draft); return; }
    setDraftError("");
    void mutate(`/doctor/cases/${caseId}/reviews`, { suitability: "SUITABLE", recommendedTreatment: decision.recommendation.trim() || undefined, ...body() });
  };

  const askOutcome = () => {
    if (!outcome) return;
    if (!outcomeReason.trim()) { setOutcomeError(copy.errors.reason); land(reasonRef.current); return; }
    setOutcomeError("");
    setConfirming(outcome);
  };
  const sendOutcome = (chosen: Outcome) => {
    void mutate(`/doctor/cases/${caseId}/review-decision`, { decision: chosen, risksAndLimitations: outcomeReason.trim() })
      .then(result => { if (result) { setOutcome(""); setOutcomeReason(""); } });
  };

  return (
    <section id="clinical-decision" aria-labelledby={`${id}-title`} className="card p-4 sm:p-5">
      <h3 id={`${id}-title`} className="text-[1.125rem] font-bold leading-7 text-brand-900">{copy.review.title}</h3>

      <RecommendationFields decision={decision} hint={copy.recommendation.hint}/>

      <EstimateLines locale={locale} decision={decision} payees={payees}>
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
          <label className="block text-[0.875rem] font-bold text-ink-800">{copy.lines.currency}
            <select className="field mt-1 block w-auto" value={proposalCurrency} onChange={event => setProposalCurrency(event.target.value)}
                    aria-describedby={noRate ? `${id}-currency-hint ${id}-no-rate` : `${id}-currency-hint`}>
              {currencies.map(code => <option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale] ?? code}</option>)}
            </select>
          </label>
          <p id={`${id}-currency-hint`} className="max-w-sm pb-2 text-[0.8125rem] leading-5 text-ink-500">{copy.lines.currencyHint}</p>
        </div>
        {noRate && <p id={`${id}-no-rate`} className="mt-2 max-w-[65ch] text-[0.875rem] leading-6 text-alert-800">{fillTemplate(copy.lines.noRate, { currency: currencyName(proposalCurrency, locale) })}</p>}
      </EstimateLines>

      <DecisionSummary locale={locale} title={copy.summary.title} decision={decision} documentsOnFile={documentsOnFile}
                       proposal={proposalCurrency !== BASE && fx ? { amount: convertedTotal, currency: proposalCurrency } : null}>
        {draftError && <p role="alert" className="error-text mt-3">{draftError}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{copy.submit}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={saveDraft}>{copy.saveDraft}</button>
        </div>
      </DecisionSummary>

      {/* One disclosure, not permanent cards: these are exits from the normal path, not alternatives to it. */}
      <details className="group mt-5 border-t border-line pt-1">
        <summary id={`${id}-exits`} className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.875rem] font-semibold text-ink-700 [&::-webkit-details-marker]:hidden">
          {copy.exits.toggle}<DisclosureChevron/>
        </summary>
        <fieldset className="mt-1" aria-labelledby={`${id}-exits`}>
          <ul className="divide-y divide-line border-y border-line">
            {OUTCOMES.map(option => (
              <li key={option}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                  <input type="radio" name={`${id}-outcome`} className="mt-1 h-4 w-4 flex-none accent-brand-600"
                         checked={outcome === option} onChange={() => { setOutcome(option); setOutcomeError(""); }}/>
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-bold text-ink-900">{copy.exits.label[option]}</span>
                    <span className="mt-0.5 block text-[0.875rem] leading-6 text-ink-600">{copy.exits.hint[option]}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {outcome && (
          <div className="mt-3 max-w-xl pb-1">
            <label htmlFor={`${id}-reason`} className="block text-[0.875rem] font-bold text-ink-800">{copy.exits.reason}</label>
            <textarea id={`${id}-reason`} ref={reasonRef} dir="auto" className={`field mt-1.5 min-h-20 ${outcomeError ? "field-error" : ""}`} maxLength={20000} value={outcomeReason} aria-required="true"
                      aria-invalid={outcomeError ? true : undefined} aria-describedby={outcomeError ? `${id}-reason-error` : undefined}
                      onChange={event => { setOutcomeReason(event.target.value); if (outcomeError && event.target.value.trim()) setOutcomeError(""); }}
                      placeholder={copy.exits.reasonPlaceholder}/>
            {outcomeError && <p id={`${id}-reason-error`} role="alert" className="error-text mt-1">{outcomeError}</p>}
            <button type="button" disabled={busy} className="btn-secondary mt-3" aria-haspopup="dialog" onClick={askOutcome}>{copy.exits.action[outcome]}</button>
          </div>
        )}
      </details>
      {confirming && <ConfirmDialog title={copy.exits.confirm[confirming].title} body={copy.exits.confirm[confirming].body}
                                    confirm={copy.exits.action[confirming]} cancel={copy.exits.keep}
                                    onCancel={() => setConfirming(null)} onConfirm={() => { const chosen = confirming; setConfirming(null); sendOutcome(chosen); }}/>}
    </section>
  );
}
