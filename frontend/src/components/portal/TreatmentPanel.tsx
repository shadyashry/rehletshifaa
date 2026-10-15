"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { ConfirmAction, DocumentPicker, Fact, Money, Task as PanelTask, instant, pick, submit, text, type PanelDocument } from "@/components/portal/panel-parts";
import type { AdmissionEvidence, ChangeOrder, Mutate, TreatmentMilestone, TreatmentView } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["treatment"];
export type TreatmentRole = "operations" | "finance" | "coordinator" | "doctor";

/** Current actions and work types whose work is done in this panel, so "do it" lands on its next form (P1-16). */
export const TREATMENT_WORK: ReadonlySet<string> = new Set(["RECORD_MILESTONE", "COUNTERSIGN_MILESTONE", "PRICE_CHANGE_ORDER", "EMERGENCY_CHANGE_ORDER_REVIEW",
  "CHANGE_ORDER_PATIENT_DECISION", "COUNTERSIGN_INTERIM_BILL"]);
const MILESTONE_KINDS = ["ADMITTED", "PROCEDURE_STARTED", "PROCEDURE_COMPLETED", "ICU", "WARD", "COMPLICATION", "STABLE", "DISCHARGE_PLANNED"] as const;
/** Recording one of these again corrects the live one (the backend supersedes it). */
const SINGLE_FACTS = new Set(["ADMITTED", "PROCEDURE_STARTED", "PROCEDURE_COMPLETED", "DISCHARGE_PLANNED"]);
const LINE_KINDS = ["PROCEDURE", "IMPLANT", "EXTRA_NIGHT", "MEDICATION", "OTHER"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const UNDECIDED = new Set(["PROPOSED", "AWAITING_PATIENT"]);
/** Finance's treatment work: only then does this panel carry the page's primary action (the admission panel may hold Finance's other). */
const FINANCE_PRICING = new Set(["PRICE_CHANGE_ORDER", "EMERGENCY_CHANGE_ORDER_REVIEW"]);
const ANCHOR = "treatment-next";

/**
 * P1-16, staff case page: the "Treatment" panel (design §5 stage 4). It shows the milestones with their countersign state and
 * when the next is due, the change orders, the running money, the interim bills and the evidence checklist per stage, all as
 * `GET /{role}/cases/{id}/treatment` returns them (amounts are never added up here). It carries each role's recording: the
 * Consultant records milestones, countersigns Operations' ones, proposes change orders (or an emergency one) and withdraws an
 * undecided one; Operations records milestones on the Consultant's behalf and the hospital's interim bills; Finance prices
 * change orders and countersigns interim bills. Step-up commands go through the portal's re-sign-in and replay. One primary
 * action — the viewer's next one — and the rest one click away.
 */
export function TreatmentPanel({ locale, role, caseId, caseStatus, currentCode, documents = [], busy, mutate, load }: {
  locale: Locale; role: TreatmentRole; caseId: string; caseStatus: string;
  /** The viewer's current action code or work type, which picks what opens first. */
  currentCode?: string | null;
  documents?: PanelDocument[]; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const work = useWorkCopy();
  const t = work.treatment;
  const roles = work.admission.trail.roles;
  const id = useId();
  const [view, setView] = useState<TreatmentView | null | undefined>(undefined);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const dateOnly = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }), [locale]);
  const when = (iso?: string | null) => iso ? dateTime.format(new Date(iso)) : "—";
  const day = (date?: string | null) => date ? dateOnly.format(new Date(`${date}T00:00:00Z`)) : "—";
  const egp = (amount?: number | null) => amount == null ? "—" : formatMoney(amount, "EGP", locale);

  const read = useCallback(() => load<TreatmentView>(`/${role}/cases/${caseId}/treatment`).then(setView, () => setView(null)), [load, role, caseId]);
  useEffect(() => {
    let live = true;
    load<TreatmentView>(`/${role}/cases/${caseId}/treatment`).then(value => { if (live) setView(value); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, role, caseId, caseStatus]);

  /** Every command answers with the panel's view (the patient's decision is not made here): show it, or read it again. */
  const act = useCallback(async (path: string, body?: unknown) => {
    const result: unknown = await mutate(path, body);
    if (!result) return false;
    if (typeof result === "object" && result !== null && "milestones" in result && "money" in result) setView(result as TreatmentView); else await read();
    return true;
  }, [mutate, read]);

  if (view === undefined) return null;
  if (view === null) return <section id="treatment-panel" className="card p-5"><h3 className="title text-base">{t.title}</h3><p role="alert" className="mt-2 text-[0.875rem] text-alert-800">{t.loadFailed}</p></section>;

  const inTreatment = (view.caseStatus ?? caseStatus) === "TREATMENT_IN_PROGRESS";
  const live = view.milestones.filter(m => !m.superseded);
  const toCountersign = role === "doctor" ? live.filter(m => m.needsCountersign && !m.countersigned) : [];
  const priceable = role === "finance" ? view.changeOrders.filter(o => o.status === "PROPOSED" || (o.emergency && o.status === "EMERGENCY" && !o.pricedAt)) : [];
  const billsToSign = role === "finance" ? view.interimBills.filter(b => !b.superseded && !b.countersignedAt) : [];
  // The next thing this viewer does here: it opens first and carries the panel's one primary button.
  const next = role === "doctor"
    ? (inTreatment && currentCode === "RECORD_MILESTONE" ? "milestone" : toCountersign[0] ? `countersign:${toCountersign[0].id}` : null)
    : role === "finance" ? (priceable[0] && FINANCE_PRICING.has(currentCode ?? "") ? `price:${priceable[0].id}`
      : billsToSign[0] && currentCode === "COUNTERSIGN_INTERIM_BILL" ? `bill:${billsToSign[0].id}` : null)
    : null;
  const dischargePlanned = live.some(m => m.kind === "DISCHARGE_PLANNED");

  return (
    <section id="treatment-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
        {inTreatment && (view.nextMilestoneDueAt
          ? <p className="text-[0.85rem] font-semibold text-ink-700">{fillTemplate(t.nextDue, { when: when(view.nextMilestoneDueAt) })}</p>
          : dischargePlanned ? <p className="text-[0.85rem] text-ink-600">{t.clockStopped}</p> : null)}
      </div>

      {/* MILESTONES */}
      <h4 className="mt-4 text-[0.875rem] font-bold text-ink-800">{t.milestones.title}</h4>
      {view.milestones.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.milestones.empty}</p> : (
        <ol className="mt-1 divide-y divide-line text-[0.85rem]">
          {view.milestones.map(m => <MilestoneRow key={m.id} t={t} m={m} roleName={pick(roles, m.recordedRole ?? "SYSTEM")} when={when} day={day}
            action={role === "doctor" && m.needsCountersign && !m.countersigned && !m.superseded
              ? <ConfirmAction label={t.milestones.countersign} context={pick(t.milestones.kinds, m.kind)} title={t.milestones.countersignTitle}
                               body={`${t.milestones.countersignBody} ${t.freshSignIn}`} confirm={t.milestones.countersign} cancel={t.cancel}
                               primary={next === `countersign:${m.id}`} busy={busy} onConfirm={() => act(`/doctor/cases/${caseId}/milestones/${m.id}/countersign`)}/>
              : null} primary={next === `countersign:${m.id}`}/>)}
        </ol>
      )}

      {/* CHANGE ORDERS */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.orders.title}</h4>
        {view.changeOrders.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.orders.empty}</p> : (
          <ul className="mt-1 divide-y divide-line">
            {view.changeOrders.map(o => (
              <li key={o.id} id={next === `price:${o.id}` ? ANCHOR : undefined} className="py-3 text-[0.85rem]">
                <OrderSummary t={t} order={o} locale={locale} when={when} egp={egp}/>
                {priceable.some(p => p.id === o.id) && <PriceForm t={t} order={o} busy={busy} primary={next === `price:${o.id}`}
                  onPrice={lines => act(`/finance/cases/${caseId}/change-orders/${o.id}/price`, { lines })}/>}
                {role === "doctor" && UNDECIDED.has(o.status) && <Withdraw t={t} order={o} busy={busy}
                  onWithdraw={reason => act(`/doctor/cases/${caseId}/change-orders/${o.id}/withdraw`, { reason })}/>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* RUNNING MONEY — exactly as returned */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.money.title}</h4>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-[0.85rem] tabular-nums sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t.money.package}><Money>{egp(view.money.packageEgp)}</Money></Fact>
          <Fact label={t.money.changeOrders}><Money>{egp(view.money.changeOrdersEgp)}</Money></Fact>
          <Fact label={t.money.authorised}><Money>{egp(view.money.authorisedEgp)}</Money></Fact>
          <Fact label={t.money.billed}><Money>{egp(view.money.interimBilledEgp)}</Money></Fact>
          {view.money.interimPendingEgp != null && <Fact label={t.money.pending}><Money>{egp(view.money.interimPendingEgp)}</Money></Fact>}
          <Fact label={t.money.variance}>
            <span className={view.money.varianceEgp > 0 ? "text-alert-800" : undefined}><Money>{egp(view.money.varianceEgp)}</Money>{view.money.varianceEgp > 0 && <> {t.money.over}</>}</span>
          </Fact>
          <Fact label={t.money.band}><Money>{egp(view.money.bandLimitEgp)}</Money></Fact>
          <Fact label={t.money.bandUsed}><Money>{egp(view.money.bandUsedEgp)}</Money></Fact>
        </dl>
      </div>

      {/* INTERIM BILLS */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.bills.title}</h4>
        {view.interimBills.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.bills.empty}</p> : (
          <ul className="mt-1 divide-y divide-line">
            {view.interimBills.map(b => <BillRow key={b.id} t={t} bill={b} roleName={pick(roles, b.recordedRole ?? "SYSTEM")} when={when} egp={egp}
              action={billsToSign.some(s => s.id === b.id)
                ? <ConfirmAction label={t.bills.countersign} context={b.reference ?? undefined} title={t.bills.countersignTitle} body={`${t.bills.countersignBody} ${t.freshSignIn}`}
                                 confirm={t.bills.countersign} cancel={t.cancel} primary={next === `bill:${b.id}`} busy={busy}
                                 onConfirm={() => act(`/finance/cases/${caseId}/treatment/interim-bills/${b.id}/countersign`)}/>
                : null} primary={next === `bill:${b.id}`}/>)}
          </ul>
        )}
      </div>

      {/* EVIDENCE CHECKLIST PER STAGE */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.checklist.title}</h4>
        <div className="mt-2 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {view.checklist.map(stage => (
            <div key={stage.stage}>
              <p className="flex flex-wrap items-center gap-2 text-[0.85rem] font-semibold text-ink-800">
                {pick(t.checklist.stages, stage.stage)}
                <StatusBadge tone={stage.complete ? "success" : "neutral"}>{stage.complete ? t.checklist.complete : t.checklist.incomplete}</StatusBadge>
              </p>
              <ul className="mt-1.5 space-y-1 text-[0.85rem]">
                {stage.items.map(item => (
                  <li key={item.code} className={`flex items-start gap-2 ${item.done ? "text-ink-800" : "text-ink-600"}`}>
                    <span aria-hidden className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full ${item.done ? "bg-brand-600 text-white" : "border border-ink-350 bg-white"}`}>{item.done && <Check size={10} strokeWidth={3}/>}</span>
                    <span>{pick(t.checklist.items, item.code)}{!item.required && <span className="text-ink-500"> ({t.checklist.optional})</span>}
                      <span className="sr-only">: {item.done ? t.checklist.done : t.checklist.missing}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* RECORDING */}
      {inTreatment && role === "doctor" && (
        <div className="mt-3">
          <Task title={t.milestoneForm.title} next={next === "milestone"}>
            <MilestoneForm t={t} documents={documents} busy={busy} primary={next === "milestone"} onRecord={body => act(`/doctor/cases/${caseId}/milestones`, body)}/>
          </Task>
          <Task title={t.orderForm.title} next={false}>
            <ChangeOrderForm t={t} hint={t.orderForm.hint} submitLabel={t.orderForm.send} busy={busy} onSubmit={body => act(`/doctor/cases/${caseId}/change-orders`, body)}/>
          </Task>
          <Task title={t.orderForm.emergencyTitle} next={false}>
            <ChangeOrderForm t={t} hint={t.orderForm.emergencyHint} submitLabel={t.orderForm.recordEmergency} busy={busy}
                             confirm={{ title: t.orderForm.emergencyConfirmTitle, body: t.orderForm.emergencyConfirmBody }}
                             onSubmit={body => act(`/doctor/cases/${caseId}/change-orders/emergency`, body)}/>
          </Task>
        </div>
      )}
      {inTreatment && role === "operations" && (
        <div className="mt-3">
          <Task title={t.milestoneForm.titleOnBehalf} next={false}>
            <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.milestoneForm.onBehalfHint}</p>
            <MilestoneForm t={t} documents={documents} busy={busy} primary={false} onRecord={body => act(`/operations/cases/${caseId}/milestones`, body)}/>
          </Task>
          <Task title={t.bills.form} next={false}>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/operations/cases/${caseId}/treatment/interim-bills`, {
              documentId: data.get("documentId"), billNumber: String(data.get("billNumber") ?? "").trim(), amountEgp: Number(data.get("amountEgp")), billedAt: instant(data.get("billedAt")) }))}>
              <DocumentPicker name="documentId" label={t.bills.document} empty={t.bills.chooseDocument} documents={documents} required/>
              <label className="block text-sm font-semibold">{t.bills.billNumber}<input className="field" name="billNumber" maxLength={160} required autoComplete="off" spellCheck={false}/></label>
              <label className="block text-sm font-semibold">{t.bills.amountEgp}<input className="field" name="amountEgp" type="number" inputMode="decimal" min="0.01" step="0.01" required/></label>
              <label className="block text-sm font-semibold">{t.bills.billedAt}<input className="field" name="billedAt" type="datetime-local" required/></label>
              {!documents.some(d => d.status === "CLEAN") && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{t.bills.noDocuments}</p>}
              <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{t.bills.record}</button></div>
            </form>
          </Task>
        </div>
      )}
    </section>
  );
}

function Task({ title, next, children }: { title: string; next: boolean; children: ReactNode }) {
  return <PanelTask title={title} next={next} anchor={ANCHOR}>{children}</PanelTask>;
}

function MilestoneRow({ t, m, roleName, when, day, action, primary }: {
  t: Copy; m: TreatmentMilestone; roleName: string; when: (iso?: string | null) => string; day: (date?: string | null) => string; action: ReactNode; primary: boolean;
}) {
  return (
    <li id={primary ? ANCHOR : undefined} className={`flex flex-wrap items-center justify-between gap-3 py-2 ${m.superseded ? "text-ink-500" : "text-ink-800"}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{pick(t.milestones.kinds, m.kind)}</span>
          <span className="text-ink-600">{when(m.occurredAt)}</span>
          {m.superseded && <strong className="font-semibold">· {t.milestones.superseded}</strong>}
        </p>
        <p className="text-[0.8125rem] text-ink-600">
          {fillTemplate(t.milestones.recorded, { role: roleName })}
          {m.needsCountersign && <> · {m.countersigned ? `${t.milestones.countersigned} · ${when(m.countersignedAt)}` : <span className="font-semibold text-ink-800">{t.milestones.awaiting}</span>}</>}
        </p>
        {/* Clinical details: null for a reader without the clinical record (Finance through the open money). */}
        {(m.operativeNoteReference || m.implants || m.plannedDischargeOn || m.note) && (
          <dl className="mt-1 grid gap-x-4 text-[0.8125rem] sm:grid-cols-[auto_1fr]">
            {m.operativeNoteReference && <Detail label={t.milestones.operativeNote}><bdi dir="ltr" translate="no">{m.operativeNoteReference}</bdi></Detail>}
            {m.implants && <Detail label={t.milestones.implants}><span dir="auto">{m.implants}</span></Detail>}
            {m.plannedDischargeOn && <Detail label={t.milestones.dischargeOn}>{day(m.plannedDischargeOn)}</Detail>}
            {m.note && <Detail label={t.milestones.note}><span dir="auto" className="whitespace-pre-wrap">{m.note}</span></Detail>}
          </dl>
        )}
        {m.incidentId && <p className="mt-1 text-[0.8125rem] font-semibold text-alert-800">{t.milestones.incident}</p>}
      </div>
      {action}
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <><dt className="text-ink-500">{label}</dt><dd className="min-w-0 break-words text-ink-800">{children}</dd></>;
}

function orderTone(status: string): StatusTone {
  return status === "ACCEPTED" ? "success" : status === "AWAITING_PATIENT" ? "info" : status === "EMERGENCY" ? "warning" : "neutral";
}

function OrderSummary({ t, order: o, locale, when, egp }: { t: Copy; order: ChangeOrder; locale: Locale; when: (iso?: string | null) => string; egp: (n?: number | null) => string }) {
  const qty = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 });
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <bdi dir="ltr" translate="no" className="font-semibold text-ink-900">{o.orderNumber}</bdi>
        <StatusBadge tone={orderTone(o.status)}>{pick(t.orders.status, o.status)}</StatusBadge>
      </p>
      <p className="mt-0.5 text-[0.8125rem] text-ink-600">
        {fillTemplate(t.orders.proposed, { when: when(o.proposedAt) })}
        {o.decidedAt && <> · {fillTemplate(t.orders.decided, { channel: pick(t.orders.channels, o.decisionChannel ?? ""), when: when(o.decidedAt) })}</>}
      </p>
      {o.reason && <p className="mt-1.5 max-w-[65ch] text-ink-800"><span className="font-semibold">{t.orders.reason}: </span><span dir="auto" className="whitespace-pre-wrap">{o.reason}</span></p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-start text-[0.8125rem] tabular-nums">
          <thead className="text-ink-500">
            <tr className="border-b border-line">
              <th scope="col" className="py-1 pe-3 text-start font-semibold">{t.orders.description}</th>
              <th scope="col" className="py-1 pe-3 text-end font-semibold">{t.orders.quantity}</th>
              <th scope="col" className="py-1 pe-3 text-end font-semibold">{t.orders.unit}</th>
              <th scope="col" className="py-1 text-end font-semibold">{t.orders.lineTotal}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {o.lines.map(line => (
              <tr key={line.id}>
                <td className="py-1.5 pe-3"><span className="text-ink-600">{pick(t.orders.lineKinds, line.kind)}: </span><span dir="auto" className="text-ink-900">{line.description}</span></td>
                <td className="py-1.5 pe-3 text-end"><bdi dir="ltr">{qty.format(line.quantity)}</bdi></td>
                <td className="py-1.5 pe-3 text-end">{line.unitEgp == null ? "—" : <Money>{egp(line.unitEgp)}</Money>}</td>
                <td className="py-1.5 text-end">{line.lineEgp == null ? "—" : <Money>{egp(line.lineEgp)}</Money>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-ink-700">{t.orders.total}</span>
        {o.totalEgp == null ? <span className="text-ink-600">{t.orders.notPriced}</span> : <>
          <span className="font-bold text-ink-900"><Money>{egp(o.totalEgp)}</Money></span>
          {o.displayCurrency && o.displayCurrency !== "EGP" && o.totalDisplay != null && <span className="text-ink-600">· <Money>{formatMoney(o.totalDisplay, o.displayCurrency, locale)}</Money></span>}
        </>}
        {o.withinBand != null && <span className="text-ink-600">· {o.withinBand ? t.orders.withinBand : t.orders.aboveBand}</span>}
      </p>
    </>
  );
}

function BillRow({ t, bill, roleName, when, egp, action, primary }: {
  t: Copy; bill: AdmissionEvidence; roleName: string; when: (iso?: string | null) => string; egp: (n?: number | null) => string; action: ReactNode; primary: boolean;
}) {
  return (
    <li id={primary ? ANCHOR : undefined} className={`flex flex-wrap items-center justify-between gap-3 py-2 text-[0.85rem] ${bill.superseded ? "text-ink-500" : "text-ink-800"}`}>
      <span className="min-w-0">
        <span className="font-semibold text-ink-900">{bill.reference && <bdi dir="ltr" translate="no">{bill.reference}</bdi>}{bill.amountEgp != null && <> · <Money>{egp(bill.amountEgp)}</Money></>}</span>
        <span className="block text-[0.8125rem] text-ink-600">
          {when(bill.effectiveAt ?? bill.recordedAt)} · {fillTemplate(t.milestones.recorded, { role: roleName })} · {bill.countersignedAt ? `${t.bills.countersigned} · ${when(bill.countersignedAt)}` : t.bills.awaiting}
        </span>
      </span>
      {action}
    </li>
  );
}

type MilestoneBody = { kind: string; occurredAt: string | null; documentId: string | null; operativeNoteReference: string | null; implants: string | null;
  complicationSummary: string | null; complicationSeverity: string | null; plannedDischargeOn: string | null; note: string | null };

/** The milestone form: the eight kinds, and the fields each one owes (the backend checks them again). */
function MilestoneForm({ t, documents, busy, primary, onRecord }: { t: Copy; documents: PanelDocument[]; busy: boolean; primary: boolean; onRecord: (body: MilestoneBody) => Promise<boolean> }) {
  const id = useId();
  const f = t.milestoneForm;
  const [kind, setKind] = useState("");
  const [missing, setMissing] = useState(false);
  return (
    <form className="mt-2 grid gap-3 sm:grid-cols-2" onSubmit={submit(async data => {
      const reference = text(data.get("operativeNoteReference")); const documentId = text(data.get("documentId"));
      // A completed procedure owes its operative note; the backend refuses it too.
      if (kind === "PROCEDURE_COMPLETED" && !reference && !documentId) { setMissing(true); document.getElementById(`${id}-ref`)?.focus(); return false; }
      setMissing(false);
      const done = await onRecord({ kind, occurredAt: instant(data.get("occurredAt")),
        documentId: kind === "PROCEDURE_COMPLETED" ? documentId : null, operativeNoteReference: kind === "PROCEDURE_COMPLETED" ? reference : null,
        implants: kind === "PROCEDURE_COMPLETED" ? text(data.get("implants")) : null,
        complicationSummary: kind === "COMPLICATION" ? text(data.get("complicationSummary")) : null, complicationSeverity: kind === "COMPLICATION" ? text(data.get("complicationSeverity")) : null,
        plannedDischargeOn: kind === "DISCHARGE_PLANNED" ? text(data.get("plannedDischargeOn")) : null, note: text(data.get("note")) });
      if (done) setKind("");
      return done;
    })}>
      <label className="block text-sm font-semibold">{f.kind}
        <select className="field" name="kind" required value={kind} onChange={event => { setKind(event.target.value); setMissing(false); }}>
          <option value="">{f.chooseKind}</option>
          {MILESTONE_KINDS.map(k => <option key={k} value={k}>{t.milestones.kinds[k]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">{f.occurredAt}<input className="field" name="occurredAt" type="datetime-local" required/></label>
      {SINGLE_FACTS.has(kind) && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{f.correction}</p>}
      {kind === "PROCEDURE_COMPLETED" && <>
        <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{f.operativeHint}</p>
        <label className="block text-sm font-semibold">{f.operativeNote}
          <input id={`${id}-ref`} className="field" name="operativeNoteReference" maxLength={160} autoComplete="off" spellCheck={false}
                 aria-invalid={missing || undefined} aria-describedby={missing ? `${id}-missing` : undefined}/>
        </label>
        <DocumentPicker name="documentId" label={f.operativeDocument} empty={f.none} documents={documents}/>
        {missing && <p id={`${id}-missing`} role="alert" className="text-[0.8125rem] font-semibold text-alert-800 sm:col-span-2">{f.operativeHint}</p>}
        <label className="block text-sm font-semibold sm:col-span-2">{f.implants}<textarea className="field" name="implants" rows={2} maxLength={2000}/></label>
      </>}
      {kind === "COMPLICATION" && <>
        <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{f.complicationHint}</p>
        <label className="block text-sm font-semibold sm:col-span-2">{f.complicationSummary}<textarea className="field" name="complicationSummary" rows={3} maxLength={4000} required/></label>
        <label className="block text-sm font-semibold">{f.severity}
          <select className="field" name="complicationSeverity" required defaultValue=""><option value="">{f.chooseSeverity}</option>{SEVERITIES.map(s => <option key={s} value={s}>{f.severities[s]}</option>)}</select>
        </label>
      </>}
      {kind === "DISCHARGE_PLANNED" && <label className="block text-sm font-semibold">{f.dischargeOn}<input className="field" name="plannedDischargeOn" type="date" required/></label>}
      <label className="block text-sm font-semibold sm:col-span-2">{f.note}<textarea className="field" name="note" rows={2} maxLength={2000}/></label>
      <div className="sm:col-span-2"><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{f.record}</button></div>
    </form>
  );
}

type Line = { key: number; kind: string; description: string; quantity: string };
type OrderBody = { reason: string; lines: { kind: string; description: string; quantity: number }[] };

/** The Consultant's change order (1–20 lines); the emergency variant asks for a confirmation before it is recorded. */
function ChangeOrderForm({ t, hint, submitLabel, confirm, busy, onSubmit }: {
  t: Copy; hint: string; submitLabel: string; confirm?: { title: string; body: string }; busy: boolean; onSubmit: (body: OrderBody) => Promise<boolean>;
}) {
  const id = useId();
  const f = t.orderForm;
  const fresh = (key: number): Line => ({ key, kind: "PROCEDURE", description: "", quantity: "1" });
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [fresh(0)]);
  const [confirming, setConfirming] = useState(false);
  const update = (key: number, patch: Partial<Line>) => setLines(rows => rows.map(row => row.key === key ? { ...row, ...patch } : row));
  const body = (): OrderBody => ({ reason: reason.trim(), lines: lines.map(l => ({ kind: l.kind, description: l.description.trim(), quantity: Number(l.quantity) })) });
  const send = async () => { if (await onSubmit(body())) { setReason(""); setLines([fresh(0)]); } };
  return (
    <form className="mt-1" onSubmit={event => { event.preventDefault(); if (confirm) setConfirming(true); else void send(); }}>
      <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{hint}</p>
      <label htmlFor={`${id}-reason`} className="mt-3 block text-sm font-semibold">{f.reason}</label>
      <p id={`${id}-reason-hint`} className="text-[0.8125rem] text-ink-500">{f.reasonHint}</p>
      <textarea id={`${id}-reason`} className="field" rows={3} maxLength={4000} required value={reason} aria-describedby={`${id}-reason-hint`} onChange={event => setReason(event.target.value)}/>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">{f.lines}</legend>
        <ol className="mt-1 space-y-3">
          {lines.map((line, index) => {
            const n = String(index + 1);
            return (
              <li key={line.key} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[10rem_minmax(0,1fr)_7rem_auto] sm:items-end">
                <span className="sr-only">{fillTemplate(f.line, { n })}</span>
                <label className="block text-[0.8125rem] font-semibold">{f.kind}
                  <select className="field" value={line.kind} onChange={event => update(line.key, { kind: event.target.value })}>
                    {LINE_KINDS.map(k => <option key={k} value={k}>{t.orders.lineKinds[k]}</option>)}
                  </select>
                </label>
                <label className="block text-[0.8125rem] font-semibold">{f.description}
                  <input className="field" required maxLength={500} autoComplete="off" value={line.description} onChange={event => update(line.key, { description: event.target.value })}/>
                </label>
                <label className="block text-[0.8125rem] font-semibold">{f.quantity}
                  <input className="field" type="number" inputMode="decimal" min="0.01" step="0.01" required dir="ltr" value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value })}/>
                </label>
                {lines.length > 1 && <button type="button" className="btn-secondary" onClick={() => setLines(rows => rows.filter(row => row.key !== line.key))}>
                  <X size={16} aria-hidden/><span className="sr-only">{fillTemplate(f.removeLine, { n })}</span></button>}
              </li>
            );
          })}
        </ol>
        {lines.length < 20 && <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-700"
          onClick={() => setLines(rows => [...rows, fresh(Math.max(...rows.map(r => r.key)) + 1)])}>{f.addLine}</button>}
      </fieldset>
      <button className="btn-secondary mt-3" disabled={busy}>{submitLabel}</button>
      {confirming && confirm && <ConfirmDialog title={confirm.title} body={confirm.body} confirm={submitLabel} cancel={t.cancel}
                                               onConfirm={() => { setConfirming(false); void send(); }} onCancel={() => setConfirming(false)}/>}
    </form>
  );
}

/** Finance prices every line of the order in EGP (step-up); totals and the band are the backend's. */
function PriceForm({ t, order, busy, primary, onPrice }: { t: Copy; order: ChangeOrder; busy: boolean; primary: boolean; onPrice: (lines: { lineId: string; unitEgp: number }[]) => Promise<boolean> }) {
  return (
    <form className="mt-3 rounded-lg border border-line bg-mist p-3" onSubmit={submit(data => onPrice(order.lines.map(line => ({ lineId: line.id, unitEgp: Number(data.get(`unit-${line.id}`)) }))))}>
      <p className="text-[0.875rem] font-bold text-ink-800">{fillTemplate(t.pricing.title, { orderNumber: `⁨${order.orderNumber}⁩` })}</p>
      <p className="mt-0.5 max-w-[65ch] text-[0.8125rem] text-ink-600">{t.pricing.hint}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {order.lines.map(line => (
          <label key={line.id} className="block text-sm font-semibold">
            {fillTemplate(t.pricing.unitEgp, { line: `⁨${line.description}⁩` })}
            <input className="field" name={`unit-${line.id}`} type="number" inputMode="decimal" min="0" step="0.01" required dir="ltr" defaultValue={line.unitEgp ?? undefined}/>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[0.8125rem] text-ink-500">{t.freshSignIn}</p>
      <button className={`${primary ? "btn-primary" : "btn-secondary"} mt-2`} disabled={busy}>{t.pricing.save}</button>
    </form>
  );
}

/** The Consultant withdraws an undecided order, with a reason, after a confirmation. */
function Withdraw({ t, order, busy, onWithdraw }: { t: Copy; order: ChangeOrder; busy: boolean; onWithdraw: (reason: string) => Promise<boolean> }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-brand-700">{t.orders.withdraw}<span className="sr-only">: {order.orderNumber}</span></summary>
      <form className="pb-1" onSubmit={event => { event.preventDefault(); if (reason.trim()) setConfirming(true); }}>
        <label htmlFor={`${id}-reason`} className="block text-sm font-semibold">{t.orders.withdrawReason}</label>
        <textarea id={`${id}-reason`} className="field" rows={2} maxLength={2000} required value={reason} onChange={event => setReason(event.target.value)}/>
        <button className="btn-secondary mt-2" disabled={busy}>{t.orders.withdraw}</button>
      </form>
      {confirming && <ConfirmDialog title={t.orders.withdrawTitle} body={t.orders.withdrawBody} confirm={t.orders.withdraw} cancel={t.cancel}
                                    onConfirm={() => { setConfirming(false); void onWithdraw(reason.trim()).then(done => { if (done) setReason(""); }); }} onCancel={() => setConfirming(false)}/>}
    </details>
  );
}
