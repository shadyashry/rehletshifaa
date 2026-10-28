"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, X } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { StatementSheet } from "@/components/portal/GoingHomeStory";
import { ActForm, AmountInput, ConfirmAction, Fact, LeadSignal, Money, ReasonField, Summary, Task as PanelTask, pick, readAmount, text } from "@/components/portal/panel-parts";
import type { InvoiceLine, Mutate, QuoteLine, ReconciliationView, StaffStatement } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["reconciliation"];
/** Operations reads the reconciliation only as the Discharge panel's state line (UX 5-3). */
export type SettlementRole = "finance" | "coordinator";

/** Work types whose work is done in this panel, so "do it" lands on its next form (P1-17). */
export const SETTLEMENT_WORK: ReadonlySet<string> = new Set(["RECONCILE_INVOICE", "COUNTERSIGN_RECONCILIATION", "FACILITY_DISPUTE", "REFUND_CREDIT", "RECORD_E_INVOICE"]);
/** Finance works the invoice from treatment (it can be recorded before discharge); everyone reads the result once discharged. */
export const SETTLEMENT_STAGES: ReadonlySet<string> = new Set(["DISCHARGED", "FOLLOW_UP"]);
const ANCHOR = "reconciliation-next";
/** A figure or a name inside a sentence keeps its own direction. */
const isolate = (value: string) => `⁨${value}⁩`;

/**
 * P1-17, staff case page: the reconciliation of the hospital's final invoice and the patient's statements (design §5 stage 5).
 * Two columns: what was authorised (the package and each counted change-order line) against the invoice lines, with the
 * variance codes the backend computed after submission. Finance opens the reconciliation (countersigning the invoice), matches
 * and submits the lines with what the patient paid at the hospital, and records a statement's e-invoice reference; a Finance
 * Manager approves or returns a variance above the band and settles a facility dispute from their work item. Every command is
 * step-up, through the portal's re-sign-in and replay. Amounts are exactly as `GET /{role}/cases/{id}/reconciliation` returns them.
 * UX 4-2: every command asks first, with the amount in the question, and a refusal is said at its form. The variance is said as a
 * verdict against the band ("EGP 7,660 above the band") before the Manager's decision, which comes before the evidence; Approve
 * and Return are two equal acts. On a phone the invoice lines are stacked rows.
 */
export function ReconciliationPanel({ locale, role, caseId, caseStatus, currentCode, busy, mutate, load, onLead }: {
  locale: Locale; role: SettlementRole; caseId: string; caseStatus: string;
  /** The viewer's current action code or work type, which picks what opens first (and which Finance Manager work is theirs). */
  currentCode?: string | null; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
  /** UX 4-3: told the act this panel leads with when no step names it (the e-invoice), so the strip can say it. */
  onLead?: (code: string | null) => void;
}) {
  const work = useWorkCopy();
  const t = work.reconciliation;
  const id = useId();
  const [view, setView] = useState<ReconciliationView | null | undefined>(undefined);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const when = (iso?: string | null) => iso ? dateTime.format(new Date(iso)) : "—";
  const egp = (amount?: number | null) => amount == null ? "—" : formatMoney(amount, "EGP", locale);

  const read = useCallback(() => load<ReconciliationView>(`/${role}/cases/${caseId}/reconciliation`).then(setView, () => setView(null)), [load, role, caseId]);
  useEffect(() => {
    let live = true;
    load<ReconciliationView>(`/${role}/cases/${caseId}/reconciliation`).then(value => { if (live) setView(value); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, role, caseId, caseStatus]);

  /** Reconciliation commands answer with the workbench; the e-invoice answers with its statement, so read the workbench again. */
  const act = useCallback(async (path: string, body?: unknown) => {
    const result: unknown = await mutate(path, body);
    if (!result) return false;
    if (typeof result === "object" && result !== null && "quote" in result && "statements" in result) setView(result as ReconciliationView); else await read();
    // UX 4-3: a recorded act's form goes (the e-invoice, once recorded): focus moves on to the act now open, or the panel's heading.
    requestAnimationFrame(() => {
      const lost = document.activeElement;
      if (lost && lost !== document.body && lost.isConnected) return;
      (document.getElementById(ANCHOR)?.querySelector<HTMLElement>("select,input,textarea,button") ?? document.getElementById(`${id}-title`))?.focus();
    });
    return true;
  }, [mutate, read, id]);

  if (view === undefined) return null;
  if (view === null) return <section id="reconciliation-panel" className="card p-5"><h3 className="title text-base">{t.title}</h3><p role="alert" className="mt-2 text-[0.875rem] text-alert-800">{t.loadFailed}</p></section>;

  const finance = role === "finance";
  const invoice = view.finalInvoice ?? null;
  const canOpen = finance && !!invoice && (!view.reconciliationId || (view.status === "OPEN" && !invoice.countersigned));
  const canSubmit = finance && view.status === "OPEN" && !!invoice?.countersigned;
  const awaiting = view.status === "AWAITING_COUNTERSIGN";
  const disputeOpen = (view.disputedEgp ?? 0) > 0 && !view.disputeOutcome && (view.status === "DISPUTED" || view.status === "CLOSED");
  const managerCountersign = finance && awaiting && currentCode === "COUNTERSIGN_RECONCILIATION";
  const managerDispute = finance && disputeOpen && currentCode === "FACILITY_DISPUTE";
  const current = view.statements.find(s => s.current) ?? null;
  // The next thing this viewer does here: it opens first and carries the panel's one primary button. UX 4-3: the current
  // statement's e-invoice reference has no step of its own yet (B-4-1), so it leads while no other step is named.
  const eInvoiceOwed = finance && !!current && !current.eInvoiceRef;
  const next = !finance ? null
    : currentCode === "RECONCILE_INVOICE" ? (canOpen ? "open" : canSubmit ? "submit" : null)
    : managerCountersign ? "countersign" : managerDispute ? "dispute"
    : eInvoiceOwed && (!currentCode || currentCode === "NONE" || currentCode === "RECORD_E_INVOICE") ? "einvoice" : null;
  const hospital = !view.facilityName ? null
    : view.facilityCity ? fillTemplate(t.hospital, { name: isolate(view.facilityName), city: isolate(view.facilityCity) }) : isolate(view.facilityName);
  const verdict = view.reconciliationId ? varianceVerdict(t, view.varianceEgp, view.bandLimitEgp, egp) : null;

  return (
    <section id="reconciliation-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <LeadSignal code={next === "einvoice" && currentCode !== "RECORD_E_INVOICE" ? "RECORD_E_INVOICE" : null} onLead={onLead}/>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`${id}-title`} tabIndex={-1} className="title text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">{t.title}</h3>
        <StatusBadge tone={statusTone(view.status)}>{view.status ? pick(t.status, view.status) : t.notOpened}</StatusBadge>
      </div>

      {!invoice ? <p className="mt-2 text-[0.875rem] text-ink-600">{t.noInvoice}</p> : (
        <p className="mt-1 text-[0.875rem] text-ink-800">
          {fillTemplate(t.invoice, { number: isolate(invoice.invoiceNumber ?? "—"), amount: isolate(egp(invoice.amountEgp)) })}
          <span className="text-ink-600"> · {fillTemplate(t.issued, { when: when(invoice.issuedAt) })}{hospital && <> · {hospital}</>}</span>
        </p>
      )}
      {canOpen && invoice && (
        <div id={next === "open" ? ANCHOR : undefined} className="mt-3">
          <ConfirmAction label={t.open} title={fillTemplate(t.openTitle, { number: isolate(invoice.invoiceNumber ?? "—"), amount: isolate(egp(invoice.amountEgp)) })}
                         body={`${t.openBody} ${t.freshSignIn}`} confirm={t.open} cancel={t.cancel}
                         primary={next === "open"} busy={busy} onConfirm={() => act(`/finance/cases/${caseId}/reconciliation`)}/>
        </div>
      )}

      {/* THE VERDICT: the variance against the band, said before anyone decides on it */}
      {verdict && (
        <p id={`${id}-verdict`} className={`mt-3 flex items-start gap-2 text-[0.9375rem] font-semibold ${verdict.above ? "text-alert-800" : "text-ink-800"}`}>
          {verdict.above && <CircleAlert size={18} aria-hidden className="mt-0.5 flex-none"/>}<span className="min-w-0">{verdict.text}</span>
        </p>
      )}

      {/* FINANCE MANAGER: approve or return a variance above the band, before the evidence it rests on */}
      {awaiting && (
        <div id={next === "countersign" ? ANCHOR : undefined} className="mt-3 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.countersign.title}</h4>
          {managerCountersign ? <Countersign t={t} verdict={verdict?.text ?? ""} verdictId={verdict ? `${id}-verdict` : undefined} variance={isolate(egp(view.varianceEgp))} busy={busy} primary={next === "countersign"}
                                             onDecide={(decision, note) => act(`/finance/cases/${caseId}/reconciliation/countersign`, { decision, note })}/>
            : <p className="mt-1 text-[0.875rem] text-ink-600">{t.countersign.waiting}</p>}
        </div>
      )}

      {/* THE TWO COLUMNS: what was authorised, and what the hospital billed */}
      {invoice && (
        <div className="mt-4 grid gap-x-6 gap-y-4 border-t border-line pt-3 lg:grid-cols-2">
          <QuoteColumn t={t} quote={view.quote} egp={egp}/>
          <LinesColumn t={t} lines={view.lines} egp={egp}/>
        </div>
      )}

      {/* THE FIGURES, as returned */}
      {view.reconciliationId && (
        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[0.875rem] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t.figures.authorised}><Money>{egp(view.authorisedEgp)}</Money></Fact>
          <Fact label={t.figures.charged}><Money>{egp(view.chargedEgp)}</Money></Fact>
          <Fact label={t.figures.variance}><Money>{egp(view.varianceEgp)}</Money></Fact>
          {(view.disputedEgp ?? 0) > 0 && <Fact label={t.figures.disputed}><span className="text-alert-800"><Money>{egp(view.disputedEgp)}</Money></span></Fact>}
          <Fact label={t.figures.paidAtFacility}><Money>{egp(view.paidAtFacilityEgp)}</Money></Fact>
          <Fact label={t.figures.band}><Money>{egp(view.bandLimitEgp)}</Money></Fact>
        </dl>
      )}
      {view.reconciliationId && (
        <p className="mt-2 text-[0.8125rem] text-ink-600">
          {[view.openedAt && fillTemplate(t.trail.opened, { when: when(view.openedAt) }), view.submittedAt && fillTemplate(t.trail.submitted, { when: when(view.submittedAt) }),
            view.countersignedAt && fillTemplate(t.trail.countersigned, { when: when(view.countersignedAt) }), view.settledAt && fillTemplate(t.trail.settled, { when: when(view.settledAt) })]
            .filter(Boolean).join(" · ")}
        </p>
      )}
      {view.note && <p className="mt-1 max-w-[65ch] text-[0.8125rem] text-ink-700"><span className="font-semibold">{t.form.note}: </span><span dir="auto" className="whitespace-pre-wrap">{view.note}</span></p>}

      {/* FINANCE: match and submit */}
      {canSubmit && (
        <div className="mt-3">
          <Task title={t.form.title} next={next === "submit"}>
            <LinesForm t={t} quote={view.quote} invoiceTotal={invoice?.amountEgp ?? null} egp={egp} busy={busy} primary={next === "submit"}
                       onSubmit={body => act(`/finance/cases/${caseId}/reconciliation/submit`, body)}/>
          </Task>
        </div>
      )}

      {/* FINANCE MANAGER: what was billed but not charged is settled with the hospital, never with the patient */}
      {(disputeOpen || view.disputeOutcome) && (
        <div id={next === "dispute" ? ANCHOR : undefined} className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.dispute.title}</h4>
          {view.disputeOutcome
            ? <p className="mt-1 text-[0.875rem] text-ink-800">{fillTemplate(t.dispute.resolved, { outcome: pick(t.dispute.outcomes, view.disputeOutcome), when: when(view.disputeResolvedAt) })}</p>
            : <>
                <p className="mt-1 max-w-[65ch] text-[0.875rem] text-ink-700">{fillTemplate(t.dispute.body, { amount: isolate(egp(view.disputedEgp)) })}</p>
                {managerDispute ? <DisputeForm t={t} amount={isolate(egp(view.disputedEgp))} busy={busy} primary={next === "dispute"}
                                               onResolve={body => act(`/finance/cases/${caseId}/reconciliation/dispute/resolve`, body)}/>
                  : <p className="mt-1 text-[0.875rem] text-ink-600">{t.dispute.waiting}</p>}
              </>}
        </div>
      )}

      {finance && current && current.totals.creditDueEgp > 0 && (
        <p className="mt-3 text-[0.875rem] font-semibold text-ink-800">{fillTemplate(t.credit, { amount: isolate(egp(current.totals.creditDueEgp)) })}</p>
      )}

      {/* STATEMENTS */}
      {(view.statements.length > 0 || view.status === "CLOSED") && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.statements.title}</h4>
          {view.statements.length === 0 ? <p className="mt-1 text-[0.875rem] text-ink-600">{t.statements.empty}</p> : (
            <ul className="mt-2 space-y-5">
              {view.statements.map(s => <StatementItem key={s.id} t={t} locale={locale} statement={s} when={when} busy={busy}
                canRecord={finance && s.current && !s.eInvoiceRef} lead={next === "einvoice" && s.current} onRecord={reference => act(`/finance/cases/${caseId}/statements/${s.id}/e-invoice`, { reference })}/>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Task({ title, next, children }: { title: string; next: boolean; children: ReactNode }) {
  return <PanelTask title={title} next={next} anchor={ANCHOR}>{children}</PanelTask>;
}

function statusTone(status?: string | null): StatusTone {
  return status === "CLOSED" ? "success" : status === "AWAITING_COUNTERSIGN" ? "info" : status === "DISPUTED" ? "warning" : "neutral";
}

function varianceTone(code?: string | null): StatusTone {
  return code === "UNAPPROVED_EXTRA" || code === "BILLING_ERROR" ? "warning" : code === "CREDIT" ? "info" : "neutral";
}

/**
 * UX 4-2: the variance as a verdict against the band, worked out from the two figures the backend returned (the band is the
 * backend's own test: the variance's size against the band limit). "The invoice is EGP 22,660 above what was authorised: EGP
 * 7,660 above the band of EGP 15,000."
 */
function varianceVerdict(t: Copy, variance: number | null | undefined, band: number | null | undefined, egp: (n?: number | null) => string) {
  if (variance == null || band == null) return null;
  const size = Math.abs(variance);
  if (variance === 0) return { above: false, text: t.verdict.none };
  const words = { variance: isolate(egp(size)), beyond: isolate(egp(size - band)), band: isolate(egp(band)) };
  if (size > band) return { above: true, text: fillTemplate(variance > 0 ? t.verdict.above : t.verdict.below, words) };
  return { above: false, text: fillTemplate(variance > 0 ? t.verdict.withinAbove : t.verdict.withinBelow, words) };
}

/** The left column: what can authorise an invoice line, as the backend lists it. */
function QuoteColumn({ t, quote, egp }: { t: Copy; quote: QuoteLine[]; egp: (n?: number | null) => string }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[0.875rem] font-bold text-ink-800">{t.quote.title}</h4>
      {quote.length === 0 ? <p className="mt-1 text-[0.875rem] text-ink-600">{t.quote.empty}</p> : (
        <ul className="mt-1 divide-y divide-line text-[0.875rem]">
          {quote.map((line, index) => (
            <li key={`${line.source}-${line.matchedId ?? index}`} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="text-ink-600">{pick(t.quote.sources, line.source)}{line.orderNumber && <> · <bdi dir="ltr" translate="no">{line.orderNumber}</bdi></>}</span>
                {line.description && <span dir="auto" className="block text-ink-900">{line.description}</span>}
              </span>
              <span className="flex-none font-semibold text-ink-900"><Money>{egp(line.authorisedEgp)}</Money></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The right column: the invoice lines as submitted, with what each was matched to and the variance code the backend gave it.
 * UX 4-2: a phone reads each line as a short block (the line, its code, then the three figures); the table from 640px.
 */
function LinesColumn({ t, lines, egp }: { t: Copy; lines: InvoiceLine[]; egp: (n?: number | null) => string }) {
  const figure = (n?: number | null) => n == null ? "—" : <Money>{egp(n)}</Money>;
  return (
    <div className="min-w-0">
      <h4 className="text-[0.875rem] font-bold text-ink-800">{t.lines.title}</h4>
      {lines.length === 0 ? <p className="mt-1 text-[0.875rem] text-ink-600">{t.lines.empty}</p> : <>
        <ul className="mt-1 divide-y divide-line border-y border-line text-[0.8125rem] sm:hidden" aria-label={t.lines.title}>
          {lines.map(line => (
            <li key={line.lineNo} className="py-2">
              <p dir="auto" className="text-ink-900">{line.description}</p>
              {line.varianceCode && <p className="mt-1"><StatusBadge tone={varianceTone(line.varianceCode)}>{pick(t.lines.codes, line.varianceCode)}</StatusBadge></p>}
              <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 tabular-nums">
                <div className="contents"><dt className="text-ink-500">{t.lines.invoice}</dt><dd className="text-end text-ink-800">{figure(line.invoiceEgp)}</dd></div>
                <div className="contents"><dt className="text-ink-500">{t.lines.authorised}</dt><dd className="text-end text-ink-800">{figure(line.authorisedEgp)}</dd></div>
                <div className="contents"><dt className="text-ink-500">{t.lines.charged}</dt><dd className="text-end font-semibold text-ink-900">{figure(line.chargedEgp)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
        {/* A region, so a keyboard can scroll the table when it is wider than its column. */}
        <div role="region" aria-label={t.lines.title} tabIndex={0} className="mt-1 hidden overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:block">
          <table className="w-full min-w-[26rem] text-[0.8125rem] tabular-nums">
            <thead className="text-ink-500">
              <tr className="border-b border-line">
                <th scope="col" className="py-1 pe-3 text-start font-semibold">{t.lines.description}</th>
                <th scope="col" className="py-1 pe-3 text-end font-semibold">{t.lines.invoice}</th>
                <th scope="col" className="py-1 pe-3 text-end font-semibold">{t.lines.authorised}</th>
                <th scope="col" className="py-1 text-end font-semibold">{t.lines.charged}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map(line => (
                <tr key={line.lineNo}>
                  <td className="py-1.5 pe-3">
                    <span dir="auto" className="block text-ink-900">{line.description}</span>
                    {line.varianceCode && <StatusBadge tone={varianceTone(line.varianceCode)}>{pick(t.lines.codes, line.varianceCode)}</StatusBadge>}
                  </td>
                  <td className="py-1.5 pe-3 text-end">{figure(line.invoiceEgp)}</td>
                  <td className="py-1.5 pe-3 text-end">{figure(line.authorisedEgp)}</td>
                  <td className="py-1.5 text-end">{figure(line.chargedEgp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

type Row = { key: number; description: string; amount: number; match: string; code: string };
type SubmitBody = { lines: { description: string; invoiceEgp: number; source: string; matchedId: string | null; code: string | null }[]; paidAtFacilityEgp: number; note: string | null };

/** Whole cents, so the typed lines can be compared with the invoice total without floating-point drift; an unread amount counts 0. */
const cents = (value: number | null | undefined) => value != null && Number.isFinite(value) ? Math.round(value * 100) : 0;

/**
 * Finance enters each invoice line and what authorised it: the package, one counted change-order line (each once), or nothing
 * (an unapproved extra or a billing error, never charged). The running count of what was typed is input help only; the backend
 * checks that the lines add up to the invoice. UX 4-2: amounts read as printed (a discount line negative); submitting asks first,
 * with the lines' total against the invoice's in the question, and says so when they do not add up.
 */
function LinesForm({ t, quote, invoiceTotal, egp, busy, primary, onSubmit }: {
  t: Copy; quote: QuoteLine[]; invoiceTotal: number | null; egp: (n?: number | null) => string; busy: boolean; primary: boolean; onSubmit: (body: SubmitBody) => Promise<boolean>;
}) {
  const f = t.form;
  const id = useId();
  const fresh = (key: number): Row => ({ key, description: "", amount: Number.NaN, match: "", code: "UNAPPROVED_EXTRA" });
  const [rows, setRows] = useState<Row[]>(() => [fresh(0)]);
  const update = (key: number, patch: Partial<Row>) => setRows(all => all.map(row => row.key === key ? { ...row, ...patch } : row));
  const options = quote.map((line, index) => ({
    value: line.source === "PACKAGE" ? "PACKAGE" : `LINE:${line.matchedId ?? index}`,
    label: line.source === "PACKAGE" ? (line.orderNumber ? fillTemplate(f.package, { voucher: isolate(line.orderNumber) }) : f.packagePlain)
      : fillTemplate(f.changeLine, { order: isolate(line.orderNumber ?? ""), description: isolate(line.description ?? "") }),
    line,
  }));
  const typed = rows.reduce((sum, row) => sum + cents(row.amount), 0);
  const amountOf = (data: FormData, row: Row) => readAmount(data.get(`amount-${row.key}`), true);
  const sumOf = (data: FormData) => rows.reduce((sum, row) => sum + cents(amountOf(data, row)), 0);
  // Lines that do not add up to the invoice are refused here, before the question and the fresh sign-in, not by the portal after.
  const [held, setHeld] = useState(false);
  const total = useRef<HTMLParagraphElement>(null);
  const off = invoiceTotal != null && typed !== cents(invoiceTotal);
  const mismatch = off && (held || rows.some(row => Number.isFinite(row.amount)));
  const body = (data: FormData): SubmitBody => ({
    lines: rows.map(row => {
      const chosen = options.find(o => o.value === row.match)?.line;
      const source = row.match === "PACKAGE" ? "PACKAGE" : chosen ? "CHANGE_ORDER_LINE" : "NONE";
      return { description: row.description.trim(), invoiceEgp: amountOf(data, row), source, matchedId: source === "CHANGE_ORDER_LINE" ? chosen?.matchedId ?? null : null,
        code: source === "NONE" ? row.code : null };
    }),
    paidAtFacilityEgp: readAmount(data.get("paidAtFacilityEgp")), note: text(data.get("note")),
  });
  return (
    <ActForm className="mt-1" refused={t.refused} retry={t.refusedRetry}
             action={async data => { const done = await onSubmit(body(data)); if (done) setRows([fresh(0)]); return done; }}
             confirm={{
               title: data => fillTemplate(f.confirmTitle, { sum: isolate(egp(sumOf(data) / 100)), total: isolate(egp(invoiceTotal)) }),
               body: data => `${fillTemplate(f.confirmBody, { paid: isolate(egp(readAmount(data.get("paidAtFacilityEgp")))) })} ${t.freshSignIn}`,
               confirm: f.submit, cancel: t.cancel,
             }}>
      <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{f.hint}</p>
      <fieldset className="mt-3">
        <legend className="sr-only">{f.title}</legend>
        <ol className="space-y-3">
          {rows.map((row, index) => {
            const n = String(index + 1);
            return (
              <li key={row.key} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1.2fr)_auto] sm:items-end">
                <span className="sr-only">{fillTemplate(f.line, { n })}</span>
                <label className="block text-[0.8125rem] font-semibold">{f.description}
                  <input className="field" required maxLength={500} autoComplete="off" dir="auto" value={row.description} onChange={event => update(row.key, { description: event.target.value })}/>
                </label>
                <div>
                  <label htmlFor={`${id}-amount-${row.key}`} className="block text-[0.8125rem] font-semibold">{f.amount}</label>
                  <AmountInput id={`${id}-amount-${row.key}`} name={`amount-${row.key}`} invalid={f.amountInvalid} accepts="signed" onValue={amount => update(row.key, { amount })}/>
                </div>
                <div className="grid gap-2">
                  <label className="block text-[0.8125rem] font-semibold">{f.match}
                    <select className="field" required value={row.match} onChange={event => update(row.key, { match: event.target.value })}>
                      <option value="" disabled>{f.chooseMatch}</option>
                      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      <option value="NONE">{f.none}</option>
                    </select>
                  </label>
                  {row.match === "NONE" && (
                    <label className="block text-[0.8125rem] font-semibold">{f.code}
                      <select className="field" value={row.code} onChange={event => update(row.key, { code: event.target.value })}>
                        {(["UNAPPROVED_EXTRA", "BILLING_ERROR"] as const).map(c => <option key={c} value={c}>{f.codes[c]}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {rows.length > 1 && <button type="button" className="btn-secondary" onClick={() => setRows(all => all.filter(r => r.key !== row.key))}>
                  <X size={16} aria-hidden/><span className="sr-only">{fillTemplate(f.removeLine, { n })}</span></button>}
              </li>
            );
          })}
        </ol>
        {rows.length < 100 && <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-700"
          onClick={() => setRows(all => [...all, fresh(Math.max(...all.map(r => r.key)) + 1)])}>{f.addLine}</button>}
      </fieldset>
      {/* The mismatch is said in words and marked, not shown by a shade alone. */}
      <p ref={total} tabIndex={-1} aria-live="polite" role={held && mismatch ? "alert" : undefined}
         className={`mt-2 flex items-start gap-2 text-[0.8125rem] font-semibold outline-none ${held && mismatch ? "text-alert-800" : mismatch ? "text-ink-800" : "text-ink-600"}`}>
        {mismatch && <CircleAlert size={16} aria-hidden className="mt-0.5 flex-none text-alert-800"/>}
        <span className="min-w-0">{fillTemplate(f.typed, { sum: isolate(egp(typed / 100)), total: isolate(egp(invoiceTotal)) })}{mismatch && <> · {f.mismatch}</>}</span>
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-paid`} className="block text-sm font-semibold">{f.paidAtFacility}</label>
          <p id={`${id}-paid-hint`} className="text-[0.8125rem] text-ink-500">{f.paidHint}</p>
          <AmountInput id={`${id}-paid`} name="paidAtFacilityEgp" invalid={f.paidInvalid} accepts="zero" describedBy={`${id}-paid-hint`}/>
        </div>
        <label className="block text-sm font-semibold sm:col-span-2">{f.note}<textarea className="field" name="note" rows={2} maxLength={2000} dir="auto"/></label>
      </div>
      <button className={`${primary ? "btn-primary" : "btn-secondary"} mt-3`} disabled={busy} onClick={event => {
        // A click is also what Enter does in a field, so this holds both.
        if (off) { event.preventDefault(); setHeld(true); total.current?.focus(); } else setHeld(false);
      }}>{f.submit}</button>
    </ActForm>
  );
}

/**
 * A Finance Manager approves or returns the reconciliation. UX 4-2: two equal acts side by side; the filled one is the panel's
 * `next`. Approving asks first with the variance in the question and the verdict in its body; returning opens its reason (owed,
 * refused blank in the page's words) and asks first too.
 */
function Countersign({ t, verdict, verdictId, variance, busy, primary, onDecide }: {
  t: Copy; verdict: string; /** The verdict line above, which the two acts are described by. */ verdictId?: string; variance: string; busy: boolean; primary: boolean; onDecide: (decision: "APPROVE" | "RETURN", note: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const c = t.countersign;
  const [returning, setReturning] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const reason = useRef<HTMLDivElement>(null);
  // Opening the return lands in its reason; closing it (or returning it) goes back to the button, never to the page's start.
  const open = (next: boolean) => {
    setReturning(next);
    if (next) requestAnimationFrame(() => reason.current?.querySelector("textarea")?.focus());
    else requestAnimationFrame(() => toggle.current?.focus());
  };
  return (
    <div className="mt-2">
      <div role="group" aria-describedby={verdictId} className="flex flex-wrap gap-3">
        <ConfirmAction label={c.approve} title={fillTemplate(c.approveTitle, { variance })} body={[verdict, c.approveBody, t.freshSignIn].filter(Boolean).join(" ")}
                       confirm={c.approve} cancel={t.cancel} primary={primary} busy={busy} onConfirm={() => onDecide("APPROVE", null)}/>
        <button ref={toggle} type="button" className="btn-secondary" aria-expanded={returning} aria-controls={`${id}-return`} disabled={busy} onClick={() => open(!returning)}>{c.returnLabel}</button>
      </div>
      <div ref={reason} id={`${id}-return`} hidden={!returning}>
        {returning && (
          <ActForm className="mt-3 grid max-w-xl gap-2" refused={t.refused} retry={t.refusedRetry}
                   action={async data => { const done = await onDecide("RETURN", text(data.get("note"))); if (done) open(false); return done; }}
                   confirm={{ title: () => c.returnTitle, body: `${c.returnBody} ${t.freshSignIn}`, confirm: c.returnConfirm, cancel: t.cancel }}>
            <ReasonField label={c.returnNote} owed={c.returnNoteRequired}/>
            <div><button className="btn-secondary" disabled={busy}>{c.returnConfirm}</button></div>
          </ActForm>
        )}
      </div>
    </div>
  );
}

/** UX 4-2: the dispute's outcome, asked first with the outcome and the amount in the question; a refusal said at the form. */
function DisputeForm({ t, amount, busy, primary, onResolve }: {
  t: Copy; amount: string; busy: boolean; primary: boolean; onResolve: (body: { outcome: string; note: string | null }) => Promise<boolean>;
}) {
  const d = t.dispute;
  const outcome = (data: FormData) => String(data.get("outcome") ?? "");
  return (
    <ActForm className="mt-2 grid gap-3 sm:grid-cols-2" refused={t.refused} retry={t.refusedRetry}
             action={data => onResolve({ outcome: outcome(data), note: text(data.get("note")) })}
             confirm={{ title: data => fillTemplate(d.confirmTitle, { outcome: pick(d.outcomes, outcome(data)), amount }), body: `${d.confirmBody} ${t.freshSignIn}`, confirm: d.resolve, cancel: t.cancel }}>
      <label className="block text-sm font-semibold">{d.outcome}
        <select className="field" name="outcome" required defaultValue="">
          <option value="" disabled>{d.choose}</option>
          {(["FACILITY_WITHDREW", "PLATFORM_ABSORBED"] as const).map(o => <option key={o} value={o}>{d.outcomes[o]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold sm:col-span-2">{d.note}<textarea className="field" name="note" rows={2} maxLength={2000} dir="auto"/></label>
      <div className="sm:col-span-2"><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{d.resolve}</button></div>
    </ActForm>
  );
}

function StatementItem({ t, locale, statement: s, when, busy, canRecord, lead, onRecord }: {
  t: Copy; locale: Locale; statement: StaffStatement; when: (iso?: string | null) => string; busy: boolean; canRecord: boolean;
  /** UX 4-3: the e-invoice is Finance's act now: its form is open and carries the view's one filled button. */
  lead: boolean; onRecord: (reference: string) => Promise<boolean>;
}) {
  const id = useId();
  const patientCopy = useWorkCopy().statement;
  // UX 4-2: Finance reads the totals as a ledger does: the total charged is gross (before payments), the balance or credit net.
  const statementCopy = { ...patientCopy, totalCharged: t.statements.totalGross, balanceDue: t.statements.balanceNet, creditDue: t.statements.creditNet };
  const reference = (data: FormData) => String(data.get("reference") ?? "").trim();
  const eInvoiceForm = canRecord && (
    <ActForm className="mt-2 grid gap-2 pb-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" refused={t.refused} retry={t.refusedRetry}
             action={data => onRecord(reference(data))}
             confirm={{ title: data => fillTemplate(t.statements.confirmTitle, { reference: isolate(reference(data)), number: isolate(s.statementNumber) }),
                        body: `${t.statements.eInvoiceHint} ${t.freshSignIn}`, confirm: t.statements.save, cancel: t.cancel }}>
      <div>
        <label htmlFor={`${id}-reference`} className="block text-sm font-semibold">{t.statements.eInvoice}</label>
        <input id={`${id}-reference`} className="field" name="reference" required maxLength={80} autoComplete="off" spellCheck={false} dir="ltr"
               aria-describedby={`${id}-reference-hint`}/>
      </div>
      <button className={lead ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.statements.save}</button>
      <p id={`${id}-reference-hint`} className="text-[0.8125rem] text-ink-500 sm:col-span-2">{t.statements.eInvoiceHint}</p>
    </ActForm>
  );
  return (
    <li>
      <p className="mb-1 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-600">
        {fillTemplate(t.statements.revision, { n: String(s.revision) })}
        <StatusBadge tone={s.current ? "success" : "neutral"}>{s.current ? t.statements.current : t.statements.superseded}</StatusBadge>
      </p>
      <StatementSheet locale={locale} copy={statementCopy} statement={s} headingLevel={4}/>
      <p className="mt-2 text-[0.8125rem] text-ink-700">
        <span className="font-semibold">{t.statements.eInvoice}: </span>
        {s.eInvoiceRef ? <><bdi dir="ltr" translate="no">{s.eInvoiceRef}</bdi> · {fillTemplate(t.statements.eInvoiceRecorded, { when: when(s.eInvoiceRecordedAt) })}</> : "—"}
      </p>
      {canRecord && (lead
        ? <div id={ANCHOR} className="mt-3 border-t border-line pt-3">
            <h5 className="text-[0.875rem] font-bold text-ink-800">{t.statements.eInvoiceForm}</h5>
            {eInvoiceForm}
          </div>
        : <details className="mt-1">
            <Summary>{t.statements.eInvoiceForm}</Summary>
            {eInvoiceForm}
          </details>)}
    </li>
  );
}
