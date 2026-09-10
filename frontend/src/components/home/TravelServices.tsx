import { ChevronRight } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";

/**
 * Travel told as one sequence, not four features of equal importance: the stops run across a single rule
 * with the arrow doing the work four identical boxes used to do badly. The section stays lighter than the
 * clinical sections above it, because that is its actual place in the journey.
 */
export function TravelServices({ d }: { d: Dictionary }) {
  const t = d.home.travel;

  return (
    <section className="section bg-white">
      <div className="container-site">
        <div className="grid gap-x-14 gap-y-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 className="headline mt-2 max-w-[18ch] rtl:max-w-[26ch] [text-wrap:balance]">{t.title}</h2>
          </div>
          <div>
            <p className="text-[0.98rem] leading-7 text-ink-600">{t.intro}</p>
            <p className="mt-3 text-[0.88rem] font-semibold leading-6 text-brand-800">{t.packageLabel}</p>
          </div>
        </div>

        <ol className="mt-8 grid border-t border-line-strong pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.items.map((item, index) => (
            <li key={item.title} className="flex gap-3 py-3 lg:py-0 lg:pe-6">
              {index > 0 && (
                <ChevronRight aria-hidden size={16}
                              className="mt-0.5 hidden flex-none text-brand-400 rtl:-scale-x-100 lg:block lg:-ms-5" />
              )}
              <div className="min-w-0">
                <h3 className="text-[0.98rem] font-semibold leading-6 text-brand-900">{item.title}</h3>
                <p className="mt-1 text-[0.86rem] leading-6 text-ink-600">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-[0.85rem] leading-6 text-ink-500">{t.note}</p>
      </div>
    </section>
  );
}
