"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { StatementSheet } from "@/components/portal/GoingHomeStory";
import { ConfirmAction, Fact, Money, Task as PanelTask, pick, submit, text } from "@/components/portal/panel-parts";
import type { InvoiceLine, Mutate, QuoteLine, ReconciliationView, StaffStatement } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["reconciliation"];
/** Operations reads the reconciliation only as the Discharge panel's state line (UX 5-3). */
export type SettlementRole = "finance" | "coordinator";

/** Work types whose work is done in this panel, so "do it" lands on its next form (P1-17). */
export const SETTLEMENT_WORK: ReadonlySet<string> = new Set(["RECONCILE_INVOICE", "COUNTERSIGN_RECONCILIATION", "FACILITY_DISPUTE", "REFUND_CREDIT"]);
/** Finance works the invoice from treatment (it can be recorded before discharge); everyone reads the result once discharged. */
export const SETTLEMENT_STAGES: ReadonlySet<string> = new Set(["DISCHARGED", "FOLLOW_UP"]);
const ANCHOR = "reconciliation-next";

/**
 * P1-17, staff case page: the reconciliation of the hospital's final invoice and the patient's statements (design §5 stage 5).
 * Two columns: what was authorised (the package and each counted change-order line) against the invoice lines, with the
 * variance codes the backend computed after submission. Finance opens the reconciliation (countersigning the invoice), matches
 * and submits the lines with what the patient paid at the hospital, and records a statement's e-invoice reference; a Finance
 * Manager approves or returns a variance above the band and settles a facility dispute from their work item. Every command is
 * step-up, through the portal's re-sign-in and replay. Amounts are exactly as `GET /{role}/cases/{id}/reconciliation` returns them.
 */
export function ReconciliationPanel({ locale, role, caseId, caseStatus, currentCode, busy, mutate, load }: {
  locale: Locale; role: SettlementRole; caseId: string; caseStatus: string;
  /** The viewer's current action code or work type, which picks what opens first (and which Finance Manager work is theirs). */
  currentCode?: string | null; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
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
    return true;
  }, [mutate, read]);

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
  // The next thing this viewer does here: it opens first and carries the panel's one primary button.
  const next = !finance ? null
    : currentCode === "RECONCILE_INVOICE" ? (canOpen ? "open" : canSubmit ? "submit" : null)
    : managerCountersign ? "countersign" : managerDispute ? "dispute" : null;
  const current = view.statements.find(s => s.current) ?? null;

  return (
    <section id="reconciliation-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
        <StatusBadge tone={statusTone(view.status)}>{view.status ? pick(t.status, view.status) : t.notOpened}</StatusBadge>
      </div>

      {!invoice ? <p className="mt-2 text-[0.85rem] text-ink-600">{t.noInvoice}</p> : (
        <p className="mt-1 text-[0.85rem] text-ink-800">
          {fillTemplate(t.invoice, { number: `⁨${invoice.invoiceNumber ?? "—"}⁩`, amount: egp(invoice.amountEgp) })}
          <span className="text-ink-600"> · {fillTemplate(t.issued, { when: when(invoice.issuedAt) })}{view.facilityName && <> · <bdi>{view.facilityName}</bdi></>}</span>
        </p>
      )}
      {canOpen && (
        <div id={next === "open" ? ANCHOR : undefined} className="mt-3">
          <ConfirmAction label={t.open} title={t.openTitle} body={`${t.openBody} ${t.freshSignIn}`} confirm={t.open} cancel={t.cancel}
                         primary={next === "open"} busy={busy} onConfirm={() => act(`/finance/cases/${caseId}/reconciliation`)}/>
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
        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[0.85rem] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t.figures.authorised}><Money>{egp(view.authorisedEgp)}</Money></Fact>
          <Fact label={t.figures.charged}><Money>{egp(view.chargedEgp)}</Money></Fact>
          <Fact label={t.figures.variance}><Money>{egp(view.varianceEgp)}</Money></Fact>
          {(view.disputedEgp ?? 0) > 0 && <Fact label={t.figures.disputed}><span className="text-alert-800"><Money>{egp(view.disputedEgp)}</Money></span></Fact>}
          <Fact label={t.figures.paidAtFacility}><Money>{egp(view.paidAtFacilityEgp)}</Money></Fact>
          <Fact label={t.figures.band}><Money>{egp(view.bandLimitEgp)}</Money></Fact>
        </dl>
      )}
      {view.needsCountersign && <p className="mt-2 text-[0.8125rem] font-semibold text-ink-800">{t.figures.needsCountersign}</p>}
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

      {/* FINANCE MANAGER: approve or return a variance above the band */}
      {awaiting && (
        <div id={next === "countersign" ? ANCHOR : undefined} className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.countersign.title}</h4>
          {managerCountersign ? <Countersign t={t} busy={busy} primary={next === "countersign"}
                                             onDecide={(decision, note) => act(`/finance/cases/${caseId}/reconciliation/countersign`, { decision, note })}/>
            : <p className="mt-1 text-[0.85rem] text-ink-600">{t.countersign.waiting}</p>}
        </div>
      )}

      {/* FINANCE MANAGER: what was billed but not charged is settled with the hospital, never with the patient */}
      {(disputeOpen || view.disputeOutcome) && (
        <div id={next === "dispute" ? ANCHOR : undefined} className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.dispute.title}</h4>
          {view.disputeOutcome
            ? <p className="mt-1 text-[0.85rem] text-ink-800">{fillTemplate(t.dispute.resolved, { outcome: pick(t.dispute.outcomes, view.disputeOutcome), when: when(view.disputeResolvedAt) })}</p>
            : <>
                <p className="mt-1 max-w-[65ch] text-[0.85rem] text-ink-700">{fillTemplate(t.dispute.body, { amount: egp(view.disputedEgp) })}</p>
                {managerDispute ? <DisputeForm t={t} busy={busy} primary={next === "dispute"} onResolve={body => act(`/finance/cases/${caseId}/reconciliation/dispute/resolve`, body)}/>
                  : <p className="mt-1 text-[0.85rem] text-ink-600">{t.dispute.waiting}</p>}
              </>}
        </div>
      )}

      {finance && current && current.totals.creditDueEgp > 0 && (
        <p className="mt-3 text-[0.85rem] font-semibold text-ink-800">{fillTemplate(t.credit, { amount: egp(current.totals.creditDueEgp) })}</p>
      )}

      {/* STATEMENTS */}
      {(view.statements.length > 0 || view.status === "CLOSED") && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.statements.title}</h4>
          {view.statements.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.statements.empty}</p> : (
            <ul className="mt-2 space-y-5">
              {view.statements.map(s => <StatementItem key={s.id} t={t} locale={locale} statement={s} when={when} busy={busy}
                canRecord={finance && s.current && !s.eInvoiceRef} onRecord={reference => act(`/finance/cases/${caseId}/statements/${s.id}/e-invoice`, { reference })}/>)}
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

/** The left column: what can authorise an invoice line, as the backend lists it. */
function QuoteColumn({ t, quote, egp }: { t: Copy; quote: QuoteLine[]; egp: (n?: number | null) => string }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[0.875rem] font-bold text-ink-800">{t.quote.title}</h4>
      {quote.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.quote.empty}</p> : (
        <ul className="mt-1 divide-y divide-line text-[0.85rem]">
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

/** The right column: the invoice lines as submitted, with what each was matched to and the variance code the backend gave it. */
function LinesColumn({ t, lines, egp }: { t: Copy; lines: InvoiceLine[]; egp: (n?: number | null) => string }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[0.875rem] font-bold text-ink-800">{t.lines.title}</h4>
      {lines.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.lines.empty}</p> : (
        <div className="mt-1 overflow-x-auto">
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
                  <td className="py-1.5 pe-3 text-end"><Money>{egp(line.invoiceEgp)}</Money></td>
                  <td className="py-1.5 pe-3 text-end">{line.authorisedEgp == null ? "—" : <Money>{egp(line.authorisedEgp)}</Money>}</td>
                  <td className="py-1.5 text-end">{line.chargedEgp == null ? "—" : <Money>{egp(line.chargedEgp)}</Money>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Row = { key: number; description: string; amount: string; match: string; code: string };
type SubmitBody = { lines: { description: string; invoiceEgp: number; source: string; matchedId: string | null; code: string | null }[]; paidAtFacilityEgp: number; note: string | null };

/** Whole cents, so the typed lines can be compared with the invoice total without floating-point drift. */
const cents = (value: string | number | null | undefined) => { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

/**
 * Finance enters each invoice line and what authorised it: the package, one counted change-order line (each once), or nothing
 * (an unapproved extra or a billing error, never charged). The running count of what was typed is input help only; the backend
 * checks that the lines add up to the invoice.
 */
function LinesForm({ t, quote, invoiceTotal, egp, busy, primary, onSubmit }: {
  t: Copy; quote: QuoteLine[]; invoiceTotal: number | null; egp: (n?: number | null) => string; busy: boolean; primary: boolean; onSubmit: (body: SubmitBody) => Promise<boolean>;
}) {
  const f = t.form;
  const id = useId();
  const fresh = (key: number): Row => ({ key, description: "", amount: "", match: "", code: "UNAPPROVED_EXTRA" });
  const [rows, setRows] = useState<Row[]>(() => [fresh(0)]);
  const update = (key: number, patch: Partial<Row>) => setRows(all => all.map(row => row.key === key ? { ...row, ...patch } : row));
  const options = quote.map((line, index) => ({
    value: line.source === "PACKAGE" ? "PACKAGE" : `LINE:${line.matchedId ?? index}`,
    label: line.source === "PACKAGE" ? (line.orderNumber ? fillTemplate(f.package, { voucher: `⁨${line.orderNumber}⁩` }) : f.packagePlain)
      : fillTemplate(f.changeLine, { order: `⁨${line.orderNumber ?? ""}⁩`, description: line.description ?? "" }),
    line,
  }));
  const typed = rows.reduce((sum, row) => sum + cents(row.amount), 0);
  const body = (data: FormData): SubmitBody => ({
    lines: rows.map(row => {
      const chosen = options.find(o => o.value === row.match)?.line;
      const source = row.match === "PACKAGE" ? "PACKAGE" : chosen ? "CHANGE_ORDER_LINE" : "NONE";
      return { description: row.description.trim(), invoiceEgp: Number(row.amount), source, matchedId: source === "CHANGE_ORDER_LINE" ? chosen?.matchedId ?? null : null,
        code: source === "NONE" ? row.code : null };
    }),
    paidAtFacilityEgp: Number(data.get("paidAtFacilityEgp")), note: text(data.get("note")),
  });
  return (
    <form className="mt-1" onSubmit={submit(async data => { const done = await onSubmit(body(data)); if (done) setRows([fresh(0)]); return done; })}>
      <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{f.hint}</p>
      <fieldset className="mt-3">
        <legend className="sr-only">{f.title}</legend>
        <ol className="space-y-3">
          {rows.map((row, index) => {
            const n = String(index + 1);
            return (
              <li key={row.key} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[minmax(0,1.4fr)_8rem_minmax(0,1.2fr)_auto] sm:items-end">
                <span className="sr-only">{fillTemplate(f.line, { n })}</span>
                <label className="block text-[0.8125rem] font-semibold">{f.description}
                  <input className="field" required maxLength={500} autoComplete="off" dir="auto" value={row.description} onChange={event => update(row.key, { description: event.target.value })}/>
                </label>
                <label className="block text-[0.8125rem] font-semibold">{f.amount}
                  <input className="field" type="number" inputMode="decimal" step="0.01" required dir="ltr" value={row.amount} onChange={event => update(row.key, { amount: event.target.value })}/>
                </label>
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
      <p aria-live="polite" className={`mt-2 text-[0.8125rem] font-semibold ${invoiceTotal != null && typed !== cents(invoiceTotal) ? "text-ink-800" : "text-ink-600"}`}>
        {fillTemplate(f.typed, { sum: egp(typed / 100), total: egp(invoiceTotal) })}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-paid`} className="block text-sm font-semibold">{f.paidAtFacility}</label>
          <p id={`${id}-paid-hint`} className="text-[0.8125rem] text-ink-500">{f.paidHint}</p>
          <input id={`${id}-paid`} className="field" name="paidAtFacilityEgp" type="number" inputMode="decimal" min="0" step="0.01" required dir="ltr" aria-describedby={`${id}-paid-hint`}/>
        </div>
        <label className="block text-sm font-semibold sm:col-span-2">{f.note}<textarea className="field" name="note" rows={2} maxLength={2000} dir="auto"/></label>
      </div>
      <p className="mt-2 text-[0.8125rem] text-ink-500">{t.freshSignIn}</p>
      <button className={`${primary ? "btn-primary" : "btn-secondary"} mt-2`} disabled={busy}>{f.submit}</button>
    </form>
  );
}

/** A Finance Manager approves (after a confirmation) or returns the reconciliation to Finance with what to correct. */
function Countersign({ t, busy, primary, onDecide }: { t: Copy; busy: boolean; primary: boolean; onDecide: (decision: "APPROVE" | "RETURN", note: string | null) => Promise<boolean> }) {
  const id = useId();
  const c = t.countersign;
  const [note, setNote] = useState("");
  const [returning, setReturning] = useState(false);
  return (
    <div className="mt-2">
      <ConfirmAction label={c.approve} title={c.approveTitle} body={`${c.approveBody} ${t.freshSignIn}`} confirm={c.approve} cancel={t.cancel}
                     primary={primary} busy={busy} onConfirm={() => onDecide("APPROVE", null)}/>
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{c.returnLabel}</summary>
        <form className="pb-1" onSubmit={event => { event.preventDefault(); if (note.trim()) setReturning(true); }}>
          <label htmlFor={`${id}-note`} className="block text-sm font-semibold">{c.returnNote}</label>
          <textarea id={`${id}-note`} className="field" rows={2} maxLength={2000} required dir="auto" value={note} onChange={event => setNote(event.target.value)}/>
          <button className="btn-secondary mt-2" disabled={busy}>{c.returnLabel}</button>
        </form>
        {returning && <ConfirmDialog title={c.returnTitle} body={`${c.returnBody} ${t.freshSignIn}`} confirm={c.returnLabel} cancel={t.cancel}
                                     onConfirm={() => { setReturning(false); void onDecide("RETURN", note.trim()).then(done => { if (done) setNote(""); }); }} onCancel={() => setReturning(false)}/>}
      </details>
    </div>
  );
}

function DisputeForm({ t, busy, primary, onResolve }: { t: Copy; busy: boolean; primary: boolean; onResolve: (body: { outcome: string; note: string | null }) => Promise<boolean> }) {
  const d = t.dispute;
  return (
    <form className="mt-2 grid gap-3 sm:grid-cols-2" onSubmit={submit(data => onResolve({ outcome: String(data.get("outcome") ?? ""), note: text(data.get("note")) }))}>
      <label className="block text-sm font-semibold">{d.outcome}
        <select className="field" name="outcome" required defaultValue="">
          <option value="" disabled>{d.choose}</option>
          {(["FACILITY_WITHDREW", "PLATFORM_ABSORBED"] as const).map(o => <option key={o} value={o}>{d.outcomes[o]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold sm:col-span-2">{d.note}<textarea className="field" name="note" rows={2} maxLength={2000} dir="auto"/></label>
      <p className="text-[0.8125rem] text-ink-500 sm:col-span-2">{t.freshSignIn}</p>
      <div className="sm:col-span-2"><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{d.resolve}</button></div>
    </form>
  );
}

function StatementItem({ t, locale, statement: s, when, busy, canRecord, onRecord }: {
  t: Copy; locale: Locale; statement: StaffStatement; when: (iso?: string | null) => string; busy: boolean; canRecord: boolean; onRecord: (reference: string) => Promise<boolean>;
}) {
  const statementCopy = useWorkCopy().statement;
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
      {canRecord && (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.statements.eInvoiceForm}</summary>
          <form className="grid gap-2 pb-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={submit(data => onRecord(String(data.get("reference") ?? "").trim()))}>
            <label className="block text-sm font-semibold">{t.statements.eInvoice}
              <input className="field" name="reference" required maxLength={80} autoComplete="off" spellCheck={false} dir="ltr"/>
            </label>
            <button className="btn-secondary" disabled={busy}>{t.statements.save}</button>
            <p className="text-[0.8125rem] text-ink-500 sm:col-span-2">{t.statements.eInvoiceHint} {t.freshSignIn}</p>
          </form>
        </details>
      )}
    </li>
  );
}
