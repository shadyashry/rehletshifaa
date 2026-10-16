import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { FinalQuoteState } from "@/lib/price-transparency";

export type PriceCopy = Dictionary["portalProposal"]["price"];
export type PayeeTotal = { payee: string; total: number };

/** P1-19 (design §7.4): a quote pays more than one party when two payees besides the platform have lines; then each line says whose it is. */
export const payeesSplit = (totals?: PayeeTotal[] | null) => (totals ?? []).filter((t) => t.payee !== "PLATFORM").length > 1;

/** "Paid to the hospital": whose line it is, or nothing when the quote pays one party only (the fee line has its own words). */
export function PayeeNote({ copy, payee, split, className = "block text-[0.8125rem] leading-5 text-ink-600" }: { copy: PriceCopy; payee?: string | null; split: boolean; className?: string }) {
  const to = copy.payees.to as Record<string, string>;
  if (!split || !payee || payee === "PLATFORM" || !Object.hasOwn(to, payee)) return null;
  return <span className={className}>{to[payee]}</span>;
}

/**
 * Who is paid (P1-19, design §7.4): the Consultant's fee and the hospital's charges apart, never blended, each as the backend summed it
 * (mandatory lines, the display currency). Shown only when the quote pays more than one party.
 */
export function PayeeTotals({ copy, totals, format, headingId, className = "" }: {
  copy: PriceCopy; totals?: PayeeTotal[] | null; format: (amount: number) => string; headingId: string; className?: string;
}) {
  if (!payeesSplit(totals)) return null;
  const to = copy.payees.to as Record<string, string>;
  return (
    <section aria-labelledby={headingId} className={className}>
      <h3 id={headingId} className="text-[0.9375rem] font-semibold text-brand-900">{copy.payees.title}</h3>
      <dl className="mt-2 divide-y divide-line border-y border-line">
        {(totals ?? []).map((t) => (
          <div key={t.payee} className="flex items-baseline justify-between gap-4 py-2.5 text-[0.9375rem]">
            <dt className="min-w-0 text-ink-800">{to[t.payee] ?? t.payee}</dt>
            <dd className="shrink-0 font-semibold tabular-nums text-ink-900"><bdi dir="ltr">{format(t.total)}</bdi></dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 max-w-[60ch] text-[0.875rem] leading-6 text-ink-600">{copy.payees.note}</p>
    </section>
  );
}

/** Id of the note that explains why accepting is unavailable; the disabled action points at it. */
export const ACCEPTANCE_HOLD_ID = "acceptance-hold";

/**
 * "How your price works": a preliminary range, the Consultant's examination, then the no-surprise promise. The three
 * are a real sequence, so they are numbered; the third carries the guarantee text from one key, so counsel's approved
 * wording is a copy change. Used on the home page and on the proposal, with no action of its own.
 */
export function HowYourPriceWorks({ copy, headingId, layout = "stack", Heading = "h2", headingClassName = "text-[1.0625rem] font-semibold leading-7 text-brand-900" }: {
  copy: PriceCopy; headingId: string; layout?: "stack" | "columns"; Heading?: "h2" | "h3"; headingClassName?: string;
}) {
  const steps = [
    ...copy.how.steps,
    { title: copy.how.protectTitle, body: copy.guarantee },
  ];
  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} className={headingClassName}>{copy.how.title}</Heading>
      <ol className={layout === "columns" ? "mt-6 grid gap-x-10 gap-y-6 md:grid-cols-3" : "mt-3 divide-y divide-line border-y border-line"}>
        {steps.map((step, index) => (
          <li key={step.title} className={`flex gap-3 ${layout === "columns" ? "" : "py-3.5"}`}>
            <span aria-hidden className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-[0.78rem] font-bold text-brand-800">{index + 1}</span>
            <div className="min-w-0">
              <p className="text-[0.95rem] font-semibold leading-6 text-ink-900">{step.title}</p>
              <p className="mt-0.5 max-w-[62ch] text-[0.9rem] leading-6 text-ink-700">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Why the Consultant changed the plan, in their own words; shown prominently, before the price it explains. */
export function ScopeChangeNotice({ copy, reason, id, className = "" }: { copy: PriceCopy; reason?: string | null; id: string; className?: string }) {
  if (!reason?.trim()) return null;
  return (
    <section aria-labelledby={id} className={`rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200 sm:p-5 ${className}`}>
      <h2 id={id} className="text-[1rem] font-semibold leading-6 text-brand-900">{copy.scopeChange.title}</h2>
      <p dir="auto" className="mt-2 max-w-[66ch] whitespace-pre-line text-[0.97rem] leading-7 text-ink-800">{reason}</p>
    </section>
  );
}

/** The sentence with the opening time set in its own element, so Arabic digits and dates keep their order. */
function withTime(template: string, when: Date, locale: Locale) {
  const [before, after = ""] = template.split("{time}");
  const text = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeStyle: "short" }).format(when);
  return <>{before}<time dateTime={when.toISOString()} className="font-semibold text-ink-900"><bdi>{text}</bdi></time>{after}</>;
}

/**
 * Why a final quote cannot be accepted yet, calmly: the cooling period after a change of plan (with the time it opens,
 * in the viewer's own timezone) or Finance checking the exchange rate. Nothing for the patient to do in either case.
 */
export function AcceptanceHold({ copy, locale, state }: { copy: PriceCopy; locale: Locale; state: FinalQuoteState }) {
  if (!state.acceptBlocked) return null;
  const message = state.acceptableFrom ? withTime(copy.cooling.text, new Date(state.acceptableFrom), locale)
    : state.coolingUnknown ? copy.cooling.unknown
    : copy.fxPending;
  return (
    <p id={ACCEPTANCE_HOLD_ID} role="status" className="rounded-xl border border-line bg-mist p-4 text-[0.95rem] leading-7 text-ink-800">
      <span className="block max-w-[66ch]">{message}</span>
    </p>
  );
}
