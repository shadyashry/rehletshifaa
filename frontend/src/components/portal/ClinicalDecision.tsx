"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Clock, FileText, Plus, X } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { intlLocale } from "@/lib/i18n";
import { formatMoney, parseAmount } from "@/lib/money";
import { scrollIntoView } from "@/lib/scroll";
import { fillTemplate, plural } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import type { DirectoryFacility } from "@/components/portal/portal-model";
import { FacilityPackagePicker, facilityPackageLines, facilityPackages, packageEstimate } from "@/components/portal/FacilityPackagePicker";

/**
 * The Consultant's clinical decision, said one way (UX area 3, slice 3-1): the first review and the final in-person
 * assessment are the same composition — "1 Recommendation", then "2 Estimate lines" from one shared picker, then a summary
 * led by the clinical text — with the patient's evidence opening the sheet. The backend still decides what is accepted:
 * catalogue prices and package ranges are re-read there, and the summary only mirrors the proposal's arithmetic.
 */

export type CatalogService = { id: string; serviceCode: string; serviceName: string; category?: string; priceEgp: number; active: boolean };
export type EvidenceDocument = { documentId: string; fileName: string; status: string };
/** A cost line as the backend stores it on a review (and as a draft or a preliminary recommendation seeds the picker). */
export type DecisionLine = { serviceDescription: string; estimatedCost: number; currency: string; catalogServiceId?: string | null; facilityPackageId?: string | null; payee?: string | null };
/** P1-19: who an off-list line is paid to; a catalogue line is always the Consultant's and a facility package the hospital's. */
export const OFF_LIST_PAYEES = ["CONSULTANT", "FACILITY", "OTHER"] as const;
export type OffListPayee = (typeof OFF_LIST_PAYEES)[number];
/** The "Paid to" words (`portalProposal.price.payees`). */
export type PayeeWords = { choice: string; choices: Record<OffListPayee, string> };
const payeeOf = (value?: string | null): OffListPayee => ((OFF_LIST_PAYEES as readonly string[]).includes(value ?? "") ? value as OffListPayee : "OTHER");
/** What a decision starts from: a draft, a saved final assessment or the preliminary recommendation. */
export type DecisionSeed = { recommendedTreatment?: string | null; risksAndLimitations?: string | null; costEstimates?: DecisionLine[] | null };
type OffListLine = { key: number; description: string; amountEgp: number; payee: OffListPayee };

export const BASE = "EGP";

/** A currency named in the viewer's language for a sentence ("US Dollar (USD)"); the code alone where the name is unknown. */
export function currencyName(code: string, locale: Locale) {
  try {
    const name = new Intl.DisplayNames([intlLocale(locale)], { type: "currency" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

/** Moves to a control and onto the screen. Instant: the page scrolls smoothly, and a smooth scroll can stop short of it. */
export function land(element: HTMLElement | null | undefined) {
  if (!element) return;
  scrollIntoView(element, { behavior: "instant", block: "center" });
  element.focus({ preventScroll: true });
}

/**
 * The estimate lines being composed: approved services, Finance-approved packages and off-list lines, all in EGP, seeded once
 * from what the act starts from (the case view is mounted per case). Seeded catalogue ids are kept even before the catalogue
 * has loaded — the picks are read against the live list — so a slow catalogue never drops a line from the next save.
 */
export function useEstimateLines({ seed, catalog, facilities }: { seed: DecisionLine[]; catalog: CatalogService[]; facilities: DirectoryFacility[] }) {
  const [selected, setSelected] = useState(() => new Set(seed.flatMap(e => (e.catalogServiceId ? [e.catalogServiceId] : []))));
  const [packagePicks, setPackagePicks] = useState(() => new Map(seed.filter(e => !!e.facilityPackageId).map(e => [e.facilityPackageId as string, Number(e.estimatedCost) || 0])));
  const [offList, setOffList] = useState<OffListLine[]>(() => seedOffList(seed).map((row, key) => ({ ...row, key })));
  // Off-list lines priced in another currency are not relabelled as EGP; the Consultant is told to add them again.
  const [droppedForeign] = useState(() => seed.some(e => !e.catalogServiceId && !e.facilityPackageId && e.currency !== BASE));

  const picks = catalog.filter(service => selected.has(service.id));
  const packages = facilityPackages(facilities);
  const { lines: packageLines, total: packageTotal, inRange } = facilityPackageLines(packages, packagePicks);
  const catalogueTotal = picks.reduce((sum, s) => sum + s.priceEgp, 0);
  const offListTotal = offList.reduce((sum, row) => sum + row.amountEgp, 0);

  return {
    catalog, packages, selected, packagePicks, offList, picks, packageLines, inRange, droppedForeign,
    catalogueTotal, packageTotal, offListTotal, total: catalogueTotal + packageTotal + offListTotal,
    count: picks.length + packageLines.length + offList.length,
    /** Every line's EGP amount, in the order the proposal lists them (for the converted total). */
    amountsEgp: () => [...picks.map(s => s.priceEgp), ...packageLines.map(p => p.amountEgp), ...offList.map(row => row.amountEgp)],
    toggle: (id: string) => setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }),
    togglePackage: (id: string, minEgp: number) => setPackagePicks(current => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id); else next.set(id, minEgp);
      return next;
    }),
    setPackageAmount: (id: string, amount: number) => setPackagePicks(current => new Map(current).set(id, amount)),
    // A stable key per row (one past the largest so far), so removing a row never remounts the rows after it.
    addOffList: (description: string, amountEgp: number, payee: OffListPayee) => setOffList(rows => [...rows, { key: rows.reduce((max, row) => Math.max(max, row.key + 1), 0), description, amountEgp: Math.round(amountEgp * 100) / 100, payee }]),
    removeOffList: (key: number) => setOffList(rows => rows.filter(row => row.key !== key)),
    /**
     * The lines as the backend takes them. Catalogue picks travel at their approved EGP price (the server re-reads it);
     * packages carry the expected EGP figure inside the range (re-checked there); off-list lines are EGP and need Finance.
     */
    estimates: () => [
      ...picks.map(s => ({ serviceDescription: s.serviceName, estimatedCost: s.priceEgp, currency: BASE, catalogServiceId: s.id })),
      ...packageLines.map(packageEstimate),
      ...offList.map(row => ({ serviceDescription: row.description, estimatedCost: row.amountEgp, currency: BASE, payee: row.payee })),
    ],
  };
}
export type EstimateLinesState = ReturnType<typeof useEstimateLines>;

function seedOffList(seed: DecisionLine[]) {
  return seed.filter(e => !e.catalogServiceId && !e.facilityPackageId && e.currency === BASE)
    .map(e => ({ description: e.serviceDescription, amountEgp: Number(e.estimatedCost) || 0, payee: payeeOf(e.payee) }));
}

/**
 * The decision both acts share: the recommendation and risks, the estimate lines, and one validation that says each refusal at
 * its control and moves there (a missing recommendation at its field; missing lines at the lines; a package figure outside its
 * range at that figure). Each act keeps only its endpoint and what it says about currency.
 */
export function useClinicalDecision({ seed, catalog, facilities }: { seed?: DecisionSeed | null; catalog: CatalogService[]; facilities: DirectoryFacility[] }) {
  const errors = useWorkCopy().clinicalDecision.errors;
  const [recommendation, setRecommendationText] = useState(seed?.recommendedTreatment ?? "");
  const [risks, setRisks] = useState(seed?.risksAndLimitations ?? "");
  const lines = useEstimateLines({ seed: seed?.costEstimates ?? [], catalog, facilities });
  const [recommendationError, setRecommendationError] = useState("");
  const [linesChecked, setLinesChecked] = useState(false);
  // The decision's two landing places, found by id when a refusal is said (no refs read during render).
  const recommendationId = useId();
  const linesId = useId();
  // Once shown, the lines' refusal follows the lines as they change, and goes when they are fixed.
  const linesProblem = lines.count === 0 ? errors.lines : !lines.inRange ? errors.range : "";

  return {
    recommendation, risks, setRisks, lines, recommendationError, recommendationId, linesId,
    linesError: linesChecked ? linesProblem : "",
    setRecommendation: (value: string) => { setRecommendationText(value); if (recommendationError && value.trim()) setRecommendationError(""); },
    /** True when the decision can be sent; otherwise the refusal is shown at its control and the focus moves there. */
    validate: () => {
      if (!recommendation.trim()) { setRecommendationError(errors.recommendation); land(document.getElementById(recommendationId)); return false; }
      setRecommendationError("");
      setLinesChecked(true);
      if (!linesProblem) return true;
      requestAnimationFrame(() => land(document.getElementById(linesId)?.querySelector<HTMLElement>(lines.inRange ? "[data-lines-error]" : "[data-out-of-range]")));
      return false;
    },
  };
}
export type ClinicalDecisionState = ReturnType<typeof useClinicalDecision>;

/** A numbered part of the decision ("1 Recommendation", "2 Estimate lines"): the order is the order the Consultant composes in. */
export function DecisionPart({ number, title, id, sectionId, children }: { number: number; title: string; id: string; sectionId?: string; children: ReactNode }) {
  return (
    <section id={sectionId} aria-labelledby={id} className="mt-5 border-t border-line pt-4">
      <h4 id={id} className="flex items-baseline gap-2 text-[1.0625rem] font-bold text-brand-900">
        {/* The space keeps the number and the title apart in the heading's accessible name ("1 Recommendation"). */}
        <span className="text-[0.9375rem] tabular-nums text-brand-700">{`${number} `}</span>{title}
      </h4>
      {children}
    </section>
  );
}

/** The recommendation part: the clinical text (required) and the risks — the same fields for the review and the final assessment. */
export function RecommendationFields({ decision, hint }: { decision: ClinicalDecisionState; hint: string }) {
  const t = useWorkCopy().clinicalDecision.recommendation;
  const id = useId();
  const error = decision.recommendationError;
  return (
    <DecisionPart number={1} title={t.part} id={`${id}-part`}>
      <div className="mt-3">
        {/* The asterisk sits beside the label, not inside it: the accessible name stays clean and aria-required carries it. */}
        <div className="flex items-baseline gap-1">
          <label htmlFor={decision.recommendationId} className="block text-[0.9375rem] font-bold text-ink-900">{t.label}</label>
          <span className="text-alert-700" aria-hidden>*</span>
        </div>
        <p id={`${id}-hint`} className="mt-0.5 text-[0.875rem] leading-6 text-ink-600">{hint} <span className="text-ink-500">{t.required}</span></p>
        <textarea id={decision.recommendationId} dir="auto" className={`field mt-2 min-h-32 ${error ? "field-error" : ""}`} maxLength={20000} value={decision.recommendation}
                  aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`} aria-required="true" aria-invalid={error ? true : undefined}
                  onChange={event => decision.setRecommendation(event.target.value)} placeholder={t.placeholder}/>
        {error && <p id={`${id}-error`} role="alert" className="error-text mt-1">{error}</p>}
      </div>
      <div className="mt-4">
        <label htmlFor={`${id}-risks`} className="block text-[0.9375rem] font-bold text-ink-900">{t.risks}</label>
        <p id={`${id}-risks-hint`} className="mt-0.5 text-[0.875rem] leading-6 text-ink-600">{t.risksHint}</p>
        <textarea id={`${id}-risks`} dir="auto" className="field mt-2 min-h-24" maxLength={20000} value={decision.risks}
                  aria-describedby={`${id}-risks-hint`} onChange={event => decision.setRisks(event.target.value)}/>
      </div>
    </DecisionPart>
  );
}

/**
 * "2 Estimate lines": the one picker for both acts. Approved services are a hairline checkbox list, Finance-approved
 * packages follow, and off-list lines are marked by a clock and words (never a tint). `children` is what the act says about
 * currency: the review's proposal-currency control, or the final assessment's line naming the patient's currency.
 */
export function EstimateLines({ locale, decision, payees, children }: { locale: Locale; decision: ClinicalDecisionState; /** P1-19: the "Paid to" words. */ payees: PayeeWords; children?: ReactNode }) {
  const copy = useWorkCopy().clinicalDecision;
  const t = copy.lines;
  const { lines, linesError: error } = decision;
  const id = useId();
  const [offName, setOffName] = useState("");
  const [offAmount, setOffAmount] = useState("");
  const [offPayee, setOffPayee] = useState<OffListPayee>("OTHER");
  const [offError, setOffError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const toggleRef = useRef<HTMLElement>(null);
  const amount = parseAmount(offAmount);
  const nameMissing = !offName.trim();
  const amountInvalid = !(Number.isFinite(amount) && amount > 0);
  const addOffList = () => {
    if (nameMissing || amountInvalid) { setOffError(true); (nameMissing ? nameRef : amountRef).current?.focus(); return; }
    setOffError(false);
    lines.addOffList(offName.trim(), amount, offPayee);
    setOffName(""); setOffAmount(""); setOffPayee("OTHER");
  };
  // The removed row's button goes with it: the focus moves to the row that takes its place, else the one before, else the toggle.
  const removeOffList = (key: number, index: number) => {
    lines.removeOffList(key);
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [];
      (buttons[Math.min(index, buttons.length - 1)] ?? toggleRef.current)?.focus();
    });
  };

  return (
    <DecisionPart number={2} title={t.part} id={`${id}-part`} sectionId={decision.linesId}>
      <p className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.hint}</p>
      {children}
      {/* Said at the control it is about, and announced; the submit below stays where it is. */}
      {error && <p data-lines-error id={`${id}-error`} role="alert" tabIndex={-1} className="error-text mt-3 outline-none">{error}</p>}
      {lines.droppedForeign && <p className="mt-3 flex items-start gap-1.5 text-[0.875rem] leading-6 text-ink-700"><Clock size={14} aria-hidden className="mt-1 flex-none text-status-warning-fg"/>{t.reenter}</p>}

      <h5 id={`${id}-approved`} className="mt-4 text-[0.875rem] font-bold text-ink-800">{t.approved}</h5>
      {lines.catalog.length === 0
        ? <p className="mt-1 text-[0.875rem] text-ink-600">{t.noCatalog}</p>
        : <ul aria-labelledby={`${id}-approved`} className="mt-1 divide-y divide-line border-y border-line">
            {lines.catalog.map(service => (
              <li key={service.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <input type="checkbox" className="h-4 w-4 flex-none accent-brand-600" checked={lines.selected.has(service.id)} onChange={() => lines.toggle(service.id)}
                         aria-describedby={error ? `${id}-error` : undefined}/>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block text-[0.9375rem] font-semibold text-ink-900">{service.serviceName}</span>
                    {service.category && <span dir="auto" className="block text-[0.8125rem] text-ink-500">{service.category}</span>}
                  </span>
                  <span className="flex-none whitespace-nowrap text-[0.9375rem] font-bold tabular-nums text-ink-800"><bdi dir="ltr">{formatMoney(service.priceEgp, BASE, locale)}</bdi></span>
                </label>
              </li>
            ))}
          </ul>}

      <FacilityPackagePicker locale={locale} packages={lines.packages} picks={lines.packagePicks} onToggle={lines.togglePackage} onAmount={lines.setPackageAmount}
                             labels={t.packages} showErrors={!!error}/>

      {lines.offList.length > 0 && (
        <ul ref={listRef} aria-label={t.offList.toggle} className="mt-4 divide-y divide-line border-y border-line">
          {lines.offList.map((row, index) => (
            <li key={row.key} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block text-[0.9375rem] font-semibold text-ink-900">{row.description}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[0.8125rem] font-semibold text-ink-700"><Clock size={13} strokeWidth={2.25} aria-hidden className="flex-none text-status-warning-fg"/>{t.offList.needsFinance}</span>
                <span className="mt-0.5 block text-[0.8125rem] text-ink-600">{payees.choice}: {payees.choices[row.payee]}</span>
              </span>
              <span className="flex-none whitespace-nowrap text-[0.9375rem] font-bold tabular-nums text-ink-800"><bdi dir="ltr">{formatMoney(row.amountEgp, BASE, locale)}</bdi></span>
              {/* 44px hit area around a quiet drawn icon. */}
              <button type="button" className="-me-2 inline-flex h-11 w-11 flex-none items-center justify-center rounded-md text-ink-500 hover:text-alert-700"
                      onClick={() => removeOffList(row.key, index)} aria-label={fillTemplate(t.offList.remove, { service: row.description })}>
                <X size={16} aria-hidden/>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The exception path, collapsed: outside the approved list means Finance has to price it. The plus turns as it opens. */}
      <details className="group mt-4 border-t border-line pt-1">
        <summary ref={toggleRef} className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.875rem] font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
          <Plus size={15} aria-hidden className="transition-transform group-open:rotate-45 motion-reduce:transition-none"/>{t.offList.toggle}
        </summary>
        <div className="mt-2 max-w-xl space-y-3 pb-1">
          <p className="text-[0.875rem] leading-6 text-ink-600">{t.offList.hint}</p>
          <label className="block text-[0.875rem] font-bold text-ink-800">{t.offList.name}
            <input ref={nameRef} className={`field mt-1 ${offError && nameMissing ? "field-error" : ""}`} dir="auto" value={offName} maxLength={500}
                   onChange={event => { setOffName(event.target.value); if (offError) setOffError(false); }}
                   aria-invalid={offError && nameMissing ? true : undefined} aria-describedby={offError ? `${id}-off-error` : undefined}/>
          </label>
          <label className="block text-[0.875rem] font-bold text-ink-800">{t.offList.amount}
            {/* Text, not number: Arabic-Indic digits are read too, and a wheel over the field never changes an amount. */}
            <input ref={amountRef} className={`field mt-1 ${offError && amountInvalid ? "field-error" : ""}`} type="text" inputMode="decimal" dir="ltr" autoComplete="off" value={offAmount}
                   onChange={event => { setOffAmount(event.target.value); if (offError) setOffError(false); }}
                   aria-invalid={offError && amountInvalid ? true : undefined} aria-describedby={offError ? `${id}-off-error` : undefined}/>
          </label>
          {/* P1-19: an off-list line says whose it is (a catalogue line is the Consultant's, a package the hospital's). */}
          <label className="block text-[0.875rem] font-bold text-ink-800">{payees.choice}
            <select className="field mt-1" value={offPayee} onChange={event => setOffPayee(event.target.value as OffListPayee)}>
              {OFF_LIST_PAYEES.map(payee => <option key={payee} value={payee}>{payees.choices[payee]}</option>)}
            </select>
          </label>
          {offError && <p id={`${id}-off-error`} role="alert" className="error-text">{copy.errors.offList}</p>}
          <button type="button" className="btn-secondary" onClick={addOffList}>{t.offList.add}</button>
        </div>
      </details>
    </DecisionPart>
  );
}

/**
 * The last read-through, led by the clinical text: what is recommended, how many lines and documents, then the money —
 * the approved list, packages and off-list lines in EGP (each only when there is some), and the patient's proposal in its
 * currency when that is not EGP.
 */
export function DecisionSummary({ locale, title, decision, documentsOnFile, proposal, children }: {
  locale: Locale; title: string; decision: ClinicalDecisionState; documentsOnFile: number;
  /** The patient's proposal value in its currency, when it differs from EGP and a rate is known. */
  proposal?: { amount: number; currency: string } | null;
  /** The act's notes and buttons. */
  children: ReactNode;
}) {
  const work = useWorkCopy();
  const t = work.clinicalDecision.summary;
  const { lines, recommendation } = decision;
  const id = useId();
  const money = (amount: number, currency = BASE) => <bdi dir="ltr">{formatMoney(amount, currency, locale)}</bdi>;
  const kinds = [lines.catalogueTotal, lines.packageTotal, lines.offListTotal].filter(total => total > 0).length;
  return (
    <section aria-labelledby={id} className="mt-5 border-t border-line pt-4">
      <h4 id={id} className="text-[1.0625rem] font-bold text-brand-900">{title}</h4>
      <dl className="mt-3 grid gap-x-6 gap-y-3 text-[0.875rem] sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.recommendation}</dt>
          <dd dir="auto" className="mt-0.5 line-clamp-3 text-[0.9375rem] font-semibold leading-6 text-ink-900">{recommendation.trim() || <span className="font-normal text-ink-500">{t.notRecorded}</span>}</dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.lines}</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{plural(locale, lines.count, work.plural.estimateLines)}</dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.documents}</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{new Intl.NumberFormat(intlLocale(locale)).format(documentsOnFile)}</dd>
        </div>
        {lines.catalogueTotal > 0 && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.approved}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{money(lines.catalogueTotal)}</dd>
          </div>
        )}
        {lines.packageTotal > 0 && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.packages}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{money(lines.packageTotal)}</dd>
          </div>
        )}
        {lines.offListTotal > 0 && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.offList}</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums text-ink-900"><Clock size={13} aria-hidden className="flex-none text-status-warning-fg"/>{money(lines.offListTotal)}</dd>
          </div>
        )}
        {kinds > 1 && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.total}</dt>
            <dd className="mt-0.5 font-bold tabular-nums text-ink-900">{money(lines.total)}</dd>
          </div>
        )}
        {proposal && lines.count > 0 && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.proposal}</dt>
            <dd className="mt-0.5 font-bold tabular-nums text-ink-900">{money(proposal.amount, proposal.currency)}</dd>
          </div>
        )}
      </dl>
      {proposal && lines.count > 0 && <p className="mt-2 text-[0.8125rem] text-ink-500">{fillTemplate(t.approxNote, { currency: currencyName(proposal.currency, locale) })}</p>}
      {children}
    </section>
  );
}

/** The exits' disclosure marker: a drawn chevron that turns as the disclosure opens (the summary's own marker is hidden). */
export function DisclosureChevron() {
  return <ChevronDown size={16} aria-hidden className="flex-none transition-transform group-open:rotate-180 motion-reduce:transition-none"/>;
}

/** A preliminary recommendation as the evidence shows it: the Consultant's own words and lines, in the currency each was priced in. */
export type PreliminaryView = DecisionSeed & { proposalCurrency?: string | null };

/** Intake summaries longer than this open clamped, with a control to read them whole (phones meet the form sooner). */
const LONG_INTAKE = 480;

/**
 * The evidence that opens a Consultant's sheet: the intake summary (in the writer's direction), the documents on file and,
 * at the final assessment, the preliminary recommendation. "On file" says what is there — not that it was opened.
 */
export function CaseEvidence({ locale, intakeSummary, documents, preliminary, viewDoc, downloadDoc }: {
  locale: Locale; intakeSummary?: string | null; documents: EvidenceDocument[]; preliminary?: PreliminaryView | null;
  viewDoc: (id: string) => void; downloadDoc: (id: string) => void;
}) {
  const t = useWorkCopy().clinicalDecision.evidence;
  const id = useId();
  const [readAll, setReadAll] = useState(false);
  const intake = intakeSummary?.trim() ?? "";
  const long = intake.length > LONG_INTAKE;
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="text-[1.0625rem] font-bold text-brand-900">{t.title}</h3>

      <h4 className="mt-3 text-[0.875rem] font-bold text-ink-800">{t.intake}</h4>
      {intake
        ? <>
            <p id={`${id}-intake`} dir="auto" className={`mt-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-7 text-ink-700 ${long && !readAll ? "line-clamp-[8]" : ""}`}>{intakeSummary}</p>
            {long && <button type="button" className="link-cta text-[0.875rem]" aria-expanded={readAll} aria-controls={`${id}-intake`} onClick={() => setReadAll(open => !open)}>{readAll ? t.readLess : t.readAll}</button>}
          </>
        : <p className="mt-1 text-[0.875rem] text-ink-500">{t.noIntake}</p>}

      <h4 className="mt-4 text-[0.875rem] font-bold text-ink-800">{t.documents}{documents.length > 0 && <span className="font-semibold text-ink-500"> · {new Intl.NumberFormat(intlLocale(locale)).format(documents.length)}</span>}</h4>
      {documents.length === 0
        ? <p className="mt-1 text-[0.875rem] text-ink-500">{t.noDocuments}</p>
        : <ul className="mt-1 divide-y divide-line border-y border-line">
            {documents.map(doc => (
              <li key={doc.documentId} className="py-1.5">
                <span className="flex min-w-0 items-start gap-2">
                  <FileText size={14} aria-hidden className="mt-1 flex-none text-brand-600"/>
                  <bdi className="min-w-0 text-[0.875rem] font-semibold text-ink-800 [overflow-wrap:anywhere]">{doc.fileName}</bdi>
                </span>
                {doc.status === "CLEAN"
                  ? <span className="flex gap-4 ps-6">
                      <button type="button" className="link-cta text-[0.875rem]" onClick={() => viewDoc(doc.documentId)}>{t.preview}<span className="sr-only"> {doc.fileName}</span></button>
                      <button type="button" className="link-cta text-[0.875rem]" onClick={() => downloadDoc(doc.documentId)}>{t.download}<span className="sr-only"> {doc.fileName}</span></button>
                    </span>
                  : <span className="block py-1 ps-6 text-[0.8125rem] text-ink-500">{doc.status === "PENDING" || doc.status === "UPLOADED" ? t.scanning : t.unavailable}</span>}
              </li>
            ))}
          </ul>}

      {preliminary && (preliminary.recommendedTreatment || (preliminary.costEstimates?.length ?? 0) > 0) && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.preliminary}</h4>
          {preliminary.recommendedTreatment && <p dir="auto" className="mt-1 whitespace-pre-wrap text-[0.9375rem] leading-7 text-ink-800">{preliminary.recommendedTreatment}</p>}
          {preliminary.risksAndLimitations && <>
            <p className="mt-2 text-[0.8125rem] font-semibold text-ink-500">{t.risks}</p>
            <p dir="auto" className="whitespace-pre-wrap text-[0.875rem] leading-6 text-ink-700">{preliminary.risksAndLimitations}</p>
          </>}
          {(preliminary.costEstimates?.length ?? 0) > 0 && <>
            <p className="mt-2 text-[0.8125rem] font-semibold text-ink-500">{t.lines}</p>
            <ul className="mt-0.5 space-y-1 text-[0.875rem]">
              {preliminary.costEstimates!.map((line, index) => (
                <li key={index} className="flex items-baseline justify-between gap-3">
                  <span dir="auto" className="min-w-0 text-ink-700">{line.serviceDescription}</span>
                  <span className="flex-none whitespace-nowrap font-semibold tabular-nums text-ink-800"><bdi dir="ltr">{formatMoney(line.estimatedCost, line.currency, locale)}</bdi></span>
                </li>
              ))}
            </ul>
          </>}
          {preliminary.proposalCurrency && <p className="mt-2 text-[0.8125rem] text-ink-500">{fillTemplate(t.proposalCurrency, { currency: currencyName(preliminary.proposalCurrency, locale) })}</p>}
        </div>
      )}
    </section>
  );
}
