import { ArrowRight, Activity, Bone, HeartPulse } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { CARE_AREA_SLUGS } from "@/lib/care-areas";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * The care areas as an editorial portfolio, not three equal tiles: Cardiology — the platform's first and
 * deepest area — holds the wider column on the clinical mist, its three approved sub-areas named under
 * the title, and the other two stand beside it on the elevated surface at the same voice, the same action
 * and the same restraint. Flat surfaces, hairline edges, one arrow per area. Phone: a stack, Cardiology
 * first.
 */
const ICONS = [HeartPulse, Activity, Bone] as const;

export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  const arrow = <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />;

  return (
    <section className="bg-surface-pearl pb-[clamp(2.5rem,2rem+2vw,4.25rem)] pt-[clamp(1.75rem,1.25rem+1.6vw,2.75rem)]">
      <div className="container-site">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-1 sm:gap-y-3">
          <div className="max-w-xl">
            <p className="eyebrow">{d.home.areasEyebrow}</p>
            <h2 className="headline mt-2">{d.home.areasTitle}</h2>
          </div>
          <TrackedLink event="send_case_cta_clicked" className="link-cta text-[0.95rem]" href={localeHref(locale, "care-areas")}>
            {d.common.explore}
            <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>

        <ul className="mt-6 grid gap-4 sm:mt-8 lg:mt-9 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:grid-rows-2 lg:gap-5">
          {d.home.areas.map((area, index) => {
            const Icon = ICONS[index] ?? HeartPulse;
            const href = localeHref(locale, CARE_AREA_SLUGS[index]);

            if (index === 0) {
              return (
                <li key={area.title} className="group relative flex flex-col justify-center rounded-[14px] bg-surface-clinical p-6 ring-1 ring-border-clinical transition-shadow hover:ring-brand-300 sm:p-7 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:px-9 lg:py-8">
                  <div className="flex items-center gap-4">
                    <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface-elevated text-brand-700 ring-1 ring-border-clinical lg:h-12 lg:w-12">
                      <Icon size={20} strokeWidth={1.7} />
                    </span>
                    <h3 className="text-[1.5rem] font-semibold leading-[1.2] tracking-[-0.015em] text-brand-900 sm:text-[1.75rem] lg:text-[1.875rem]">
                      {area.title}
                    </h3>
                  </div>
                  <div className="mt-4 lg:mt-5">
                    {/* The area's approved sub-areas, as one quiet line of labels. */}
                    <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8rem] font-semibold uppercase leading-5 tracking-[0.08em] text-brand-700 rtl:text-[0.9rem] rtl:normal-case rtl:tracking-normal">
                      {d.home.cardiologyFacets.map((facet, i, all) => (
                        <li key={facet} className="flex items-center gap-x-2.5">
                          {facet}
                          {i < all.length - 1 && <span aria-hidden className="h-1 w-1 rounded-full bg-brand-400" />}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 max-w-[52ch] text-[1rem] leading-7 text-ink-600 sm:text-[1.0625rem]">{area.body}</p>
                    <Link href={href} className="link-cta mt-3 text-[0.95rem] after:absolute after:inset-0 sm:mt-4">
                      {d.home.areasAction}
                      {arrow}
                    </Link>
                  </div>
                </li>
              );
            }

            return (
              <li key={area.title} className="group relative flex flex-col rounded-[12px] bg-surface-elevated p-6 ring-1 ring-border-subtle transition-shadow hover:ring-brand-300 lg:col-start-2">
                <div className="flex items-center gap-3.5">
                  <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-surface-sage text-brand-600">
                    <Icon size={18} strokeWidth={1.7} />
                  </span>
                  <h3 className="text-[1.125rem] font-semibold leading-[1.3] text-brand-900 lg:text-[1.2rem] lg:tracking-[-0.008em]">{area.title}</h3>
                </div>
                <p className="mt-2.5 max-w-[56ch] text-[0.95rem] leading-6 text-ink-600 lg:text-[1rem] lg:leading-[1.6]">{area.body}</p>
                <Link href={href} className="link-cta mt-auto min-h-11 pt-1 text-[0.95rem] after:absolute after:inset-0">
                  {d.home.areasAction}
                  {arrow}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
