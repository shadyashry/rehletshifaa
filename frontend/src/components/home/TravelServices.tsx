import { ChevronRight } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";

/**
 * Travel told as one sequence, not four features of equal importance. On a phone the four stops are a
 * short ruled list — title and one line each — because the section is supporting, and it must read
 * lighter than the clinical sections above it. From a desktop width the stops run across a single rule
 * with the arrow doing the work four identical boxes used to do badly.
 */
export function TravelServices({ d }: { d: Dictionary }) {
  const t = d.home.travel;

  return (
    <section className="section bg-white">
      <div className="container-site">
        <div className="grid gap-x-14 gap-y-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end lg:gap-y-4">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 className="headline mt-1.5 max-w-[18ch] rtl:max-w-[26ch] [text-wrap:balance] sm:mt-2">{t.title}</h2>
          </div>
          <div>
            <p className="text-[0.95rem] leading-6 text-ink-600 sm:text-[0.98rem] sm:leading-7">{t.intro}</p>
            <p className="mt-2 text-[0.85rem] font-semibold leading-6 text-brand-800 sm:mt-3 sm:text-[0.88rem]">{t.packageLabel}</p>
          </div>
        </div>

        <ol className="mt-5 grid border-t border-line-strong sm:mt-8 sm:grid-cols-2 sm:gap-x-8 sm:pt-6 lg:grid-cols-4">
          {t.items.map((item, index) => (
            <li key={item.title} className="flex gap-3 border-b border-line py-3 sm:border-0 sm:py-3 lg:py-0 lg:pe-6">
              {/* Phone: a small ordinal keeps the sequence readable without the desktop arrow. */}
              <span aria-hidden className="mt-[3px] text-[0.72rem] font-bold tabular-nums leading-5 text-accent-700 sm:hidden">
                {String(index + 1).padStart(2, "0")}
              </span>
              {index > 0 && (
                <ChevronRight aria-hidden size={16}
                              className="mt-0.5 hidden flex-none text-brand-400 rtl:-scale-x-100 lg:block lg:-ms-5" />
              )}
              <div className="min-w-0">
                <h3 className="text-[0.95rem] font-semibold leading-6 text-brand-900 sm:text-[0.98rem]">{item.title}</h3>
                <p className="mt-0.5 text-[0.88rem] leading-6 text-ink-600 sm:mt-1 sm:text-[0.86rem]">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-[0.875rem] leading-6 text-ink-500 sm:mt-6 sm:text-[0.85rem]">{t.note}</p>
      </div>
    </section>
  );
}
