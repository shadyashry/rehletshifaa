"use client";

import { Component, use, useEffect, useId, useRef, useState, type FocusEventHandler, type FormEvent, type ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, CircleDashed, CircleDot, Clock } from "lucide-react";

import { intlLocale, latinDigits, type Locale } from "@/lib/i18n";
import { ConfirmDialog, FeedbackContext } from "@/components/portal/portal-ui";
import { useWorkCopy } from "@/components/portal/portal-copy";

/**
 * The small pieces the staff evidence panels share (P1-15 "Admission & money", P1-16 "Treatment"): a recording task that
 * opens first when it is the viewer's next thing to do, a labelled fact, an amount isolated left-to-right, a picker of the
 * case's checked documents, an action behind a confirmation, the form helpers, and the boundary each panel renders inside.
 */

/**
 * UX 3-2: one panel that cannot be drawn (a view the page does not expect) says so in its own place; the cover, the step
 * and the other panels keep working. Keyed per case by the page, so opening another case starts afresh.
 */
export class PanelBoundary extends Component<{ title: string; message: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card p-5" aria-label={this.props.title}>
        <h3 className="title text-base">{this.props.title}</h3>
        <p role="alert" className="mt-2 flex items-start gap-2 text-[0.875rem] text-alert-800"><CircleAlert size={16} aria-hidden className="mt-0.5 flex-none"/>{this.props.message}</p>
      </section>
    );
  }
}
export type PanelDocument = { documentId: string; fileName: string; status: string };

/** One recording task: a disclosure whose summary names the outcome; the next task opens first and carries the `anchor` id. */
export function Task({ title, next, anchor, children }: { title: string; next: boolean; anchor: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line" open={next || undefined} id={next ? anchor : undefined}>
      <Summary>{title}</Summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

/**
 * UX 5-1: an act already done, said as one line ("Reserved · Nile Heart Hospital · 30 Oct 2026"); a correction, when the act
 * still takes one, sits behind its own disclosure.
 */
export function DoneAct({ fact, tone = "done", change, children }: {
  fact: ReactNode; /** "waiting": recorded, someone else still checks it; "warning": recorded, with a problem the fact names; "neutral": closed
   * without being done (a cancelled or refunded deposit, UX 4-0), so no check. */ tone?: "done" | "waiting" | "warning" | "neutral";
  /** The correction's disclosure label. */ change?: string; children?: ReactNode;
}) {
  const Icon = tone === "warning" ? CircleAlert : tone === "waiting" ? Clock : tone === "neutral" ? CircleDot : Check;
  return (
    <div className="py-2">
      <p className="flex items-start gap-2 text-[0.875rem] text-ink-800">
        <Icon size={16} aria-hidden className={`mt-0.5 flex-none ${tone === "warning" ? "text-alert-800" : tone === "waiting" || tone === "neutral" ? "text-ink-500" : "text-brand-600"}`}/>
        <span className="min-w-0 [overflow-wrap:anywhere]">{fact}</span>
      </p>
      {change && children && <details className="group ps-6"><Summary>{change}</Summary><div className="pb-3">{children}</div></details>}
    </div>
  );
}

/** UX 5-1: an act that comes later, named so the order is plain. UX 5-4: its "Later:" is shown, and its marker is dashed, so the
 * row never reads as a radio button to pick. */
export function LaterAct({ notYet, children }: { notYet: string; children: ReactNode }) {
  return <p className="flex items-start gap-2 py-2 text-[0.875rem] text-ink-500"><CircleDashed size={16} aria-hidden className="mt-0.5 flex-none"/><span className="min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold">{notYet}</span> {children}</span></p>;
}

/** A disclosure's summary with a drawn marker that turns as its own `<details>` opens (the native marker is gone once it is a
 * flex box). It reads its parent, not a `group`, so a closed disclosure inside an open one keeps its closed marker (UX 5-2). It does
 * not wrap, so a long label wraps beside its marker, never under it (UX 5-4). */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-x-2 text-sm font-bold text-brand-700 hover:text-brand-900 [&::-webkit-details-marker]:hidden">
      <ChevronDown size={16} aria-hidden className="flex-none transition-transform motion-reduce:transition-none [details[open]>summary>&]:rotate-180"/>{children}
    </summary>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  // UX 4-1: a long reference wraps inside its own column rather than widening the grid past a phone's width.
  return <div className="min-w-0 [overflow-wrap:anywhere]"><dt className="text-ink-500">{label}</dt><dd className="font-semibold text-ink-900">{children}</dd></div>;
}

/** An amount, left-to-right and never split between its currency and its figure. */
export function Money({ children }: { children: ReactNode }) {
  return <bdi dir="ltr" className="whitespace-nowrap tabular-nums">{children}</bdi>;
}

export function DocumentPicker({ name, label, empty, documents, required = false }: { name: string; label: string; empty: string; documents: PanelDocument[]; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold">{label}
      <select className="field" name={name} required={required} defaultValue="">
        <option value="">{empty}</option>
        {documents.filter(d => d.status === "CLEAN").map(d => <option key={d.documentId} value={d.documentId}>{d.fileName}</option>)}
      </select>
    </label>
  );
}

/** A button whose action runs only after a confirmation (countersigning, withdrawing): the dialog names the consequence. */
export function ConfirmAction({ label, context, title, body, confirm, cancel, primary, busy, onConfirm }: {
  label: string; /** Read after the label by screen readers, so several identical buttons stay distinguishable. */ context?: string;
  title: string; body: string; confirm: string; cancel: string; primary: boolean; busy: boolean; onConfirm: () => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" className={primary ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={() => setConfirming(true)}>
        {label}{context && <span className="sr-only">: {context}</span>}
      </button>
      {confirming && <ConfirmDialog title={title} body={body} confirm={confirm} cancel={cancel}
                                    onConfirm={() => { setConfirming(false); void onConfirm(); }} onCancel={() => setConfirming(false)}/>}
    </>
  );
}

/** A code's words from a copy table, or the code itself in plain lower case when the table does not know it yet. */
export const pick = (table: Record<string, string>, key: string) => Object.hasOwn(table, key) ? table[key] : key.replaceAll("_", " ").toLowerCase();
export function instant(value: FormDataEntryValue | null) { return value ? new Date(String(value)).toISOString() : null; }
/** An instant as a `datetime-local` value on this device's clock (the field has no zone; `instant()` reads it back the same way). */
export function localInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function text(value: FormDataEntryValue | null) { const v = String(value ?? "").trim(); return v || null; }

/** An EGP amount copied from paper: plain digits, or thousands grouped by commas throughout, with up to two decimals. */
const AMOUNT = /^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?$/;
/** Grouped with Latin digits through `intlLocale`, as `formatMoney` writes amounts in both languages; cents kept when there are any. */
const GROUPING = new Map<Locale, { whole: Intl.NumberFormat; cents: Intl.NumberFormat }>();
const groupAmount = (value: number, locale: Locale) => {
  let formats = GROUPING.get(locale);
  if (!formats) GROUPING.set(locale, formats = { whole: new Intl.NumberFormat(intlLocale(locale)),
    cents: new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
  return (Number.isInteger(value) ? formats.whole : formats.cents).format(value);
};
/**
 * The amount typed, or NaN when it is not one. Arabic-Indic digits and separators read as Latin (an Arabic keypad types them)
 * and a currency word around the figure is dropped ("EGP 195,500"); anything else ambiguous — "195,50", "1,2" — is refused,
 * never re-read as another amount.
 */
export function readAmount(value: FormDataEntryValue | string | null, signed = false) {
  const strip = (text: string) => text.replace(/^[\p{L}\p{Sc}\s]+|[\p{L}\p{Sc}\s.]+$/gu, "");
  let latin = latinDigits(String(value ?? "").trim())
    .replace(/٫/g, ".").replace(/٬/g, ",");
  // UX 4-2: an invoice's discount line is negative ("-1,200", "−1,200", "-EGP 1,200" or "EGP -1,200"), only where the field says so.
  const minus = /^[-−]/;
  let negative = signed && minus.test(latin);
  if (negative) latin = latin.slice(1);
  latin = strip(latin);
  if (signed && !negative && minus.test(latin)) { negative = true; latin = latin.slice(1).trim(); }
  return AMOUNT.test(latin) ? (negative ? -1 : 1) * Number(latin.replaceAll(",", "")) : Number.NaN;
}

/** Which amounts a field takes: above zero (a price, a receipt), zero or more (what was paid), or any but zero (an invoice line). */
export type AmountRange = "positive" | "zero" | "signed";
const inRange = (value: number, accepts: AmountRange) => accepts === "positive" ? value > 0 : accepts === "zero" ? value >= 0 : Number.isFinite(value) && value !== 0;

/**
 * UX 5-4: an EGP amount the officer copies from paper (the letter's price, the cashier's receipt; UX 4-1: Finance's fee and refund). It reads as
 * printed ("195,500.00"), is grouped again when left, and says in the page's language when it is not an amount above zero.
 * UX 4-2: `accepts` widens the range (zero paid, a negative discount line); `onValue` hands each keystroke's reading to a running total.
 */
export function AmountInput({ id, name, invalid, defaultValue, describedBy, accepts = "positive", max, required = true, className, onValue }: {
  id: string; name: string; invalid: string; defaultValue?: number; describedBy?: string; accepts?: AmountRange;
  /** UX X-1: the most the field takes (a deposit's balance); above it the field says `invalid`, as for any other refusal. */
  max?: number; required?: boolean; className?: string; onValue?: (value: number) => void;
}) {
  const { locale } = useWorkCopy();
  const fits = (value: number) => inRange(value, accepts) && (max == null || value <= max);
  const check = (field: HTMLInputElement) => {
    const value = readAmount(field.value, accepts === "signed");
    field.setCustomValidity(field.value.trim() && !fits(value) ? invalid : "");
    return value;
  };
  return (
    <input id={id} className={`field tabular-nums ${className ?? ""}`} name={name} type="text" inputMode="decimal" required={required} dir="ltr" autoComplete="off" spellCheck={false}
           defaultValue={defaultValue != null ? groupAmount(defaultValue, locale) : undefined} aria-describedby={describedBy}
           onChange={event => { const value = check(event.currentTarget); onValue?.(value); }}
           onBlur={event => {
             const value = check(event.currentTarget);
             if (fits(value)) event.currentTarget.value = `${value < 0 ? "-" : ""}${groupAmount(Math.abs(value), locale)}`;
           }}/>
  );
}

/**
 * UX 4-1/4-2: a fixed rate the way Egyptian finance quotes it, the patient's currency first ("1 USD = 49.0196 EGP", six
 * significant digits, as it was fixed). The stored rate is EGP → the patient's currency.
 * UX X-1 (DESIGN.md "A rate is one run"): ISO codes and Latin digits only, so one left-to-right isolate reads the same way round
 * in both languages; the sentence around it carries the date.
 */
export function quotedRate(locale: Locale, currency: string, fxRate?: number | null) {
  if (!fxRate || currency === "EGP") return null;
  const egpPer = new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 6 }).format(1 / fxRate);
  return `\u20661 ${currency} = ${egpPer} EGP\u2069`;
}

/**
 * A reason typed for a decision. When one is owed, the page refuses an empty or blank reason in its own words, at the field
 * and read out (the browser's own message would be in the browser's language, and a passing tooltip).
 */
export function ReasonField({ label, owed, hint }: { label: string; /** The page's own words when a reason is owed. */ owed?: string; hint?: string }) {
  const id = useId();
  const [missing, setMissing] = useState(false);
  const described = missing ? `${id}-missing` : hint ? `${id}-hint` : undefined;
  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <textarea id={id} className="field" name="note" rows={2} maxLength={2000} dir="auto" required={!!owed} aria-invalid={missing || undefined} aria-describedby={described}
        onInvalid={owed ? event => { event.currentTarget.setCustomValidity(owed); setMissing(true); } : undefined}
        onInput={owed ? event => {
          // A reason of spaces only is no reason: the backend refuses it, so the form does first.
          const blank = !event.currentTarget.value.trim();
          event.currentTarget.setCustomValidity(blank && event.currentTarget.value ? owed : "");
          if (!blank) setMissing(false);
        } : undefined}/>
      {missing ? <p id={`${id}-missing`} role="alert" className="mt-1 text-[0.8125rem] font-semibold text-alert-800">{owed}</p>
        : hint && <p id={`${id}-hint`} className="mt-1 text-[0.8125rem] text-ink-600">{hint}</p>}
    </div>
  );
}

/** UX 5-2: a `datetime-local` field with its clock hint (the field has no zone, so it says whose clock it reads). */
export function TimeField({ label, name, hint, defaultValue, required = true }: { label: string; name: string; hint: string; defaultValue?: string; required?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <input id={id} className="field" name={name} type="datetime-local" required={required} dir="ltr" defaultValue={defaultValue} aria-describedby={`${id}-hint`}/>
      <p id={`${id}-hint`} className="mt-1 text-[0.8125rem] text-ink-600">{hint}</p>
    </div>
  );
}

/**
 * UX 5-2: a recording form whose refusal is said in place. When the command fails, the form keeps what was typed and says,
 * above its fields, that nothing was saved and why (the portal's own message, which on a phone is scrolled out of view);
 * focus moves to that line, so it is read before the fields. `confirm`, when given, asks first, its title worded from what
 * was typed: for a recording that moves the case on.
 */
export function ActForm({ action, refused, retry, confirm, className, onFocusCapture, children }: {
  action: (data: FormData) => Promise<boolean>; /** "Not saved." */ refused: string; /** Said when the portal gave no reason. */ retry: string;
  confirm?: { title: (data: FormData) => string; body: string | ((data: FormData) => string); confirm: string; cancel: string };
  className?: string; onFocusCapture?: FocusEventHandler<HTMLFormElement>; children: ReactNode;
}) {
  const { error } = use(FeedbackContext);
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState<FormData | null>(null);
  useEffect(() => { if (failed) alert.current?.focus(); }, [failed]);
  function run(data: FormData) {
    void action(data).catch(() => false).then(done => {
      if (done) form.current?.reset(); else setFailed(true);
    });
  }
  return (
    <>
      <form ref={form} className={className} onFocusCapture={onFocusCapture} onInput={() => { if (failed) setFailed(false); }} onSubmit={event => {
        event.preventDefault(); setFailed(false);
        const data = new FormData(event.currentTarget);
        if (confirm) setAsking(data); else run(data);
      }}>
        {failed && <p ref={alert} tabIndex={-1} role="alert" className="col-span-full flex w-full items-start gap-2 text-[0.875rem] font-semibold text-alert-800 outline-none">
          <CircleAlert size={16} aria-hidden className="mt-0.5 flex-none"/><span>{refused} {error || retry}</span></p>}
        {children}
      </form>
      {asking && confirm && <ConfirmDialog title={confirm.title(asking)} body={typeof confirm.body === "function" ? confirm.body(asking) : confirm.body} confirm={confirm.confirm} cancel={confirm.cancel}
                                           onConfirm={() => { setAsking(null); run(asking); }} onCancel={() => setAsking(null)}/>}
    </>
  );
}
/** Submits a form's data; the form is cleared once the command succeeded. */
export function submit(action: (data: FormData) => Promise<boolean>) {
  return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; void action(new FormData(form)).then(done => { if (done) form.reset(); }); };
}
