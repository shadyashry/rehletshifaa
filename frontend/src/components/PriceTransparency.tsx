import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { FinalQuoteState } from "@/lib/price-transparency";

export type PriceCopy = Dictionary["portalProposal"]["price"];

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
