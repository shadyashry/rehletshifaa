import type { Dictionary } from "@/lib/dictionary";
import { JourneyLine } from "./JourneyConnector";

/**
 * Travel as concierge support around the medical plan, not a travel-site feature grid. The heading in one
 * column, "the medical plan comes first" in the other, and beneath them the four stops as one connected
 * journey — 01 ─ 02 ─ 03 ─ 04 on the warm line — on the soft champagne canvas, the page's one hospitality
 * note. Phone and tablet: the same journey standing upright. No imagery; short copy; no dead space.
 */
export function TravelServices({ d }: { d: Dictionary }) {
  const t = d.home.travel;
  const last = t.items.length - 1;

  return (
    <section className="canvas-hospitality py-[clamp(2.25rem,1.6rem+1.6vw,3.25rem)]">
      <div className="container-site">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 className="headline mt-2 max-w-[18ch] rtl:max-w-[26ch] [text-wrap:balance]">{t.title}</h2>
          </div>
          <div className="lg:pt-1.5">
            <p className="text-[1.0625rem] font-semibold leading-7 text-brand-900 sm:text-[1.125rem]">{d.home.travelLead}</p>
            <p className="mt-1 max-w-[50ch] text-[1rem] leading-7 text-ink-600">{t.intro}</p>
            <p className="mt-2.5 inline-flex items-center gap-2.5 text-[0.875rem] font-semibold leading-6 text-sand-700">
              <span aria-hidden className="h-px w-6 bg-accent-warm" />
              {t.packageLabel}
            </p>
          </div>
        </div>

        <ol className="mt-6 grid gap-0 sm:mt-7 lg:mt-8 lg:grid-cols-4 lg:gap-x-6">
          {t.items.map((item, index) => (
            <li key={item.title} className="relative flex gap-4 pb-5 last:pb-0 sm:gap-5 lg:block lg:pb-0">
              {/* Upright between stops below lg; from lg the line runs from this stop to the next. */}
              {index < last && (
                <>
                  <JourneyLine tone="warm" className="absolute start-[4px] top-9 h-[calc(100%-2.25rem)] w-6 rtl:-scale-x-100 lg:hidden" />
                  <JourneyLine
                    tone="warm"
                    orientation="horizontal"
                    className="absolute start-[2.5rem] top-4 hidden h-6 w-[calc(100%-1.5rem)] -translate-y-1/2 rtl:-scale-x-100 lg:block"
                  />
                </>
              )}
              <span aria-hidden className="journey-marker journey-marker-warm relative z-[1] flex-none">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 pt-1 lg:pt-3.5">
                <h3 className="text-[1.0625rem] font-semibold leading-6 text-brand-900 lg:text-[1.125rem]">{item.title}</h3>
                <p className="mt-0.5 max-w-[40ch] text-[0.95rem] leading-6 text-ink-600 lg:max-w-[24ch]">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-[0.9rem] leading-6 text-ink-500">{t.note}</p>
      </div>
    </section>
  );
}
