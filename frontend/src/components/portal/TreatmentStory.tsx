"use client";

import { useId, useMemo, useState } from "react";

import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import type { PatientChangeOrder, PatientTreatmentView } from "@/components/portal/portal-model";

export type TreatmentCopy = Dictionary["portalWork"]["myCare"]["treatment"];
export type ChangeDecision = "ACCEPT" | "REJECT";

const words = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : null;

/**
 * P1-16, the patient's own treatment page (My Care and the verified status link): the change waiting for their decision, when
 * there is one, then a calm timeline of what has happened (a complication reads only as a care update; a line the Consultant has
 * not countersigned yet is "reported by the care team"), then the changes already decided. Amounts are shown exactly as the
 * API returns them, in EGP and, at the rate fixed on the quote, the patient's currency.
 */
export function TreatmentStory({ locale, copy: t, view, decision }: { locale: Locale; copy: TreatmentCopy; view: PatientTreatmentView;
  /** The decision on the order awaiting the patient, rendered first; absent where this surface cannot decide. */
  decision?: React.ReactNode }) {
  const date = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeZone: "UTC" }), [locale]);
  const history = view.changeOrders.filter(order => !order.awaitingDecision);
  const id = useId();
  return (
    <div>
      {decision}
      <section aria-labelledby={`${id}-timeline`} className={decision ? "mt-6 border-t border-line pt-4" : undefined}>
        <h3 id={`${id}-timeline`} className="text-[0.9375rem] font-bold text-ink-800">{t.timelineTitle}</h3>
        {view.facilityName && <p className="mt-0.5 text-[0.875rem] text-ink-600"><bdi>{view.facilityName}</bdi>{view.facilityCity && <> · <bdi>{view.facilityCity}</bdi></>}</p>}
        {view.timeline.length === 0 ? <p className="mt-2 text-[0.9375rem] text-ink-600">{t.empty}</p> : (
          <ol className="mt-3 space-y-3 border-s border-brand-200 ps-4">
            {view.timeline.map((line, index) => {
              const said = words(t.lines, line.kind);
              return (
                <li key={`${line.kind}-${line.occurredAt}-${index}`} className="relative text-[0.9375rem] leading-6">
                  <span aria-hidden className="absolute -start-[1.3125rem] top-2 h-2 w-2 rounded-full bg-brand-600"/>
                  <p className="text-ink-900">{said ? fillTemplate(said, { date: line.plannedDischargeOn ? day.format(new Date(`${line.plannedDischargeOn}T00:00:00Z`)) : "" }) : line.kind}</p>
                  <p className="text-[0.8125rem] text-ink-600">
                    <time dateTime={line.occurredAt}>{date.format(new Date(line.occurredAt))}</time>
                    {line.reportedBy === "CARE_TEAM" && <> · {t.careTeam}</>}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {history.length > 0 && (
        <section aria-labelledby={`${id}-orders`} className="mt-6 border-t border-line pt-4">
          <h3 id={`${id}-orders`} className="text-[0.9375rem] font-bold text-ink-800">{t.orders.title}</h3>
          <ul className="mt-2 divide-y divide-line">
            {history.map(order => (
              <li key={order.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-[0.9375rem]">
                <span className="min-w-0">
                  <span className="font-semibold text-ink-900">{words(t.orders.status, order.status) ?? order.status}</span>
                  <span className="block text-[0.8125rem] text-ink-600"><bdi dir="ltr" translate="no">{order.orderNumber}</bdi>{order.decidedAt && <> · {date.format(new Date(order.decidedAt))}</>}</span>
                </span>
                <Amount locale={locale} order={order} toFollow={t.orders.priceToFollow}/>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Amount({ locale, order, toFollow }: { locale: Locale; order: PatientChangeOrder; toFollow: string }) {
  if (order.totalEgp == null) return <span className="text-[0.875rem] text-ink-600">{toFollow}</span>;
  return (
    <span className="text-end tabular-nums">
      <bdi dir="ltr" className="font-semibold text-ink-900">{formatMoney(order.totalEgp, "EGP", locale)}</bdi>
      {order.displayCurrency && order.displayCurrency !== "EGP" && order.totalDisplay != null &&
        <bdi dir="ltr" className="block text-[0.8125rem] text-ink-600">{formatMoney(order.totalDisplay, order.displayCurrency, locale)}</bdi>}
    </span>
  );
}

/**
 * The change awaiting the patient (D-E, above the band): why the Consultant recommends it, what it adds line by line and the
 * added cost, then one primary action — accept — with decline beside it, each behind a confirmation. The surface sends the
 * decision (My Care with a fresh sign-in, the status link with its verified grant).
 */
export function ChangeOrderDecision({ locale, copy: t, order, busy, hint, error, onDecide }: {
  locale: Locale; copy: TreatmentCopy; order: PatientChangeOrder; busy: boolean;
  /** A line under the buttons (My Care: a fresh sign-in may be asked for). */ hint?: string | null;
  /** A failure of the last decision, said under the buttons. */ error?: string | null;
  onDecide: (decision: ChangeDecision, note: string | null) => Promise<unknown>;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<ChangeDecision | null>(null);
  const currency = order.displayCurrency && order.displayCurrency !== "EGP" ? order.displayCurrency : null;
  const c = t.change;
  const quantity = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }), [locale]);
  return (
    <section id="change-order-decision" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-[1.0625rem] font-bold text-brand-900">{c.title}</h3>
      <p className="mt-0.5 text-[0.8125rem] text-ink-600"><bdi dir="ltr" translate="no">{order.orderNumber}</bdi></p>
      {order.reason && <>
        <p className="mt-3 text-[0.875rem] font-semibold text-ink-600">{c.reason}</p>
        <p className="mt-0.5 max-w-[65ch] whitespace-pre-wrap text-ink-800" dir="auto">{order.reason}</p>
      </>}
      <p className="mt-4 text-[0.875rem] font-semibold text-ink-600">{c.lines}</p>
      <ul className="mt-1 divide-y divide-line border-y border-line">
        {order.lines.map((line, index) => (
          <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-[0.9375rem]">
            <span className="min-w-0">
              <span className="text-ink-900" dir="auto">{line.description}</span>
              <span className="block text-[0.8125rem] text-ink-600">{words(t.orders.lineKinds, line.kind) ?? line.kind}{line.quantity !== 1 && <> · <bdi dir="ltr">×{quantity.format(line.quantity)}</bdi></>}</span>
            </span>
            {line.lineEgp != null && <span className="text-end tabular-nums">
              <bdi dir="ltr" className="font-semibold text-ink-900">{formatMoney(line.lineEgp, "EGP", locale)}</bdi>
              {currency && line.lineDisplay != null && <bdi dir="ltr" className="block text-[0.8125rem] text-ink-600">{formatMoney(line.lineDisplay, currency, locale)}</bdi>}
            </span>}
          </li>
        ))}
      </ul>
      {order.totalEgp != null && (
        <div className="mt-4">
          <p className="text-[0.875rem] font-semibold text-ink-600">{c.total}</p>
          <p className="statement mt-1 text-brand-900 tabular-nums"><bdi dir="ltr">{formatMoney(order.totalEgp, "EGP", locale)}</bdi></p>
          {currency && order.totalDisplay != null && <p className="mt-1 text-[0.875rem] text-ink-600">{fillTemplate(c.inYourCurrency, { amount: `⁨${formatMoney(order.totalDisplay, currency, locale)}⁩` })}</p>}
        </div>
      )}
      <label htmlFor={`${id}-note`} className="mt-5 block text-sm font-semibold">{c.note}</label>
      <textarea id={`${id}-note`} className="field" rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)}/>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => setConfirming("ACCEPT")}>{c.accept}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming("REJECT")}>{c.decline}</button>
      </div>
      {hint && <p className="mt-2 text-[0.8125rem] text-ink-600">{hint}</p>}
      {error && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-6 text-alert-800">{error}</p>}
      {confirming && <ConfirmDialog title={confirming === "ACCEPT" ? c.acceptTitle : c.declineTitle} body={confirming === "ACCEPT" ? c.acceptBody : c.declineBody}
                                    confirm={confirming === "ACCEPT" ? c.acceptConfirm : c.declineConfirm} cancel={c.cancel}
                                    onConfirm={() => { const decision = confirming; setConfirming(null); void onDecide(decision, note.trim() || null); }}
                                    onCancel={() => setConfirming(null)}/>}
    </section>
  );
}
