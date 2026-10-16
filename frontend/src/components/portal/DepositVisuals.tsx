import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";

import { CaseStamp } from "@/components/brand/CaseStamp";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";

/**
 * The deposit's three pictures (UX 1c-1), each drawn only from a field the page already receives:
 * - `PaymentTrack`: where the payment is — you pay and send · Finance checks · received — numbered like the journey;
 * - `PaymentReceipt`: the reference the patient sent, stamped Sent (`submittedAt`) or, once Finance confirmed it,
 *   Received (`decidedAt`); no date, no stamp;
 * - `PaidBar`: how much of the deposit has been received, for a partial payment only. A sent transfer carries no
 *   amount, so a payment being checked never fills the bar.
 */

/** The step a deposit is on, from the backend's states: 3 = all done (paid), 1 = Finance checking a sent reference, 0 = the patient's turn. */
export function paymentStep(status: string, transferStatus?: string | null): 0 | 1 | 3 {
  return status === "PAID" ? 3 : transferStatus === "SUBMITTED" ? 1 : 0;
}

/** Unnumbered, so it never competes with the payment slip's numbered parts; the words carry the order. */
export function PaymentTrack({ steps, current, label, completedLabel, currentLabel, className = "" }: {
  /** The three steps' words, in order. */
  steps: readonly string[];
  /** The step the payment is on; `steps.length` when every step is done. */
  current: number;
  label: string; completedLabel: string; currentLabel: string; className?: string;
}) {
  return (
    <ol aria-label={label} className={`pay-track ${className}`} style={{ "--pay-steps": steps.length } as CSSProperties}>
      {steps.map((words, index) => {
        const state = index < current ? "reached" : index === current ? "current" : "upcoming";
        return (
          <li key={words} className="pay-track-step" aria-current={state === "current" ? "step" : undefined}>
            {index < steps.length - 1 && <span aria-hidden className="pay-track-link" data-reached={index < current || undefined}/>}
            <span aria-hidden className="journey-marker relative z-10 flex-none" data-state={state}>{state === "reached" ? <Check size={15} strokeWidth={3}/> : state === "current" ? <span className="pay-track-now"/> : null}</span>
            <span className={`text-[0.8125rem] leading-5 ${state === "current" ? "font-semibold text-brand-900" : "text-ink-600"}`}>
              {words}
              {state === "reached" && <span className="sr-only"> ({completedLabel})</span>}
              {state === "current" && <span className="sr-only"> ({currentLabel})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The slip the patient keeps: what they sent, with the stamp of what happened to it. */
export function PaymentReceipt({ title, rows, stamp, className = "" }: {
  title: string;
  rows: readonly { label: string; value: ReactNode }[];
  /** The stamp's word and the instant the backend recorded, or nothing. */
  stamp?: { label: string; date?: string | null; locale: Locale } | null;
  className?: string;
}) {
  const stamped = !!stamp?.date;
  return (
    <div className={`pay-receipt ${className}`} data-stamped={stamped || undefined}>
      <p className="label-micro text-ink-500">{title}</p>
      <dl className="mt-1 text-[0.875rem] leading-6">
        {rows.map(row => (
          <div key={row.label} className="flex flex-wrap gap-x-2">
            <dt className="text-ink-600">{row.label}</dt>
            <dd className="font-semibold text-ink-900">{row.value}</dd>
          </div>
        ))}
      </dl>
      {stamp && <CaseStamp label={stamp.label} date={stamp.date} locale={stamp.locale} className="pay-receipt-stamp"/>}
    </div>
  );
}

/**
 * Received of the total, as one bar from zero to the deposit, with the figures beside it as its visible twin. The bar
 * is an image with one sentence for screen readers; the caption repeats it for everyone else.
 */
export function PaidBar({ paid, total, remaining, currency, locale, copy, className = "" }: {
  paid: number; total: number; remaining?: number | null; currency: string; locale: Locale;
  copy: { receivedOf: string; remaining: string; paidChart: string };
  className?: string;
}) {
  const money = (n: number) => formatMoney(n, currency, locale);
  const share = Math.min(1, Math.max(0, paid / total));
  const sentence = fillTemplate(copy.paidChart, { paid: money(paid), total: money(total) })
    + (remaining != null ? ` ${fillTemplate(copy.remaining, { amount: money(remaining) })}.` : "");
  const figure = (n: number, strong = false) => <bdi dir="ltr" className={`tabular-nums ${strong ? "font-semibold text-brand-900" : ""}`}>{money(n)}</bdi>;
  return (
    <div className={`pay-paid ${className}`}>
      <div role="img" aria-label={sentence} className="pay-paid-bar">
        <span style={{ inlineSize: `${share * 100}%` }}/>
      </div>
      <p aria-hidden className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-0.5 text-[0.875rem] leading-6 text-ink-600">
        <span>{fillNodes(copy.receivedOf, { paid: figure(paid, true), total: figure(total) })}</span>
        {remaining != null && <span>{fillNodes(copy.remaining, { amount: figure(remaining, true) })}</span>}
      </p>
    </div>
  );
}

/** `fillTemplate` for nodes: each `{key}` becomes the given element, so a figure can stay isolated inside a sentence. */
function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{key && key in values ? values[key] : part}</Fragment>;
  });
}
