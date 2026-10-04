import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { TrackedLink } from "@/components/TrackedLink";
import { careAreaAtlas, careAtlasSystems } from "@/lib/care-area-catalog";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

/**
 * The care areas as a compact atlas — the homepage preview of the Care Areas page. Every area has equal
 * standing (no featured specialty): six body-system panels, each with a tinted header and its areas as
 * link rows that name how many Consultants lead them. The same systems, tints and icons as the Care
 * Areas page and the Consultants panel, so the three read as one system.
 */
export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  const areas = careAreaAtlas(locale, d);
  const systems = careAtlasSystems(areas, d);
  const consultants = (n: number) =>
    n === 1 ? d.home.areasConsultantsOne : n === 2 ? d.home.areasConsultantsTwo : d.home.areasConsultantsMany.replace("{n}", String(n));

  return (
    <section aria-labelledby="home-areas-title" className="bg-surface-pearl pb-[clamp(2.75rem,2rem+2.2vw,4.5rem)] pt-[clamp(2rem,1.5rem+1.8vw,3.25rem)]">
      <div className="container-site">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">{d.home.areasEyebrow}</p>
            <h2 id="home-areas-title" className="headline mt-2">{d.home.areasTitle}</h2>
            <p className="mt-3 max-w-[56ch] text-[1rem] leading-7 text-ink-600">{d.home.areasIntro.replace("{count}", String(areas.length))}</p>
          </div>
          <TrackedLink event="send_case_cta_clicked" className="link-cta text-[0.95rem] lg:justify-self-end" href={localeHref(locale, "care-areas")}>
            {d.common.explore}
            <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>

        <div className="mt-7 grid gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {systems.map((system) => {
            const style = SYSTEM_STYLES[system.key];
            return (
              <section key={system.key} aria-labelledby={`home-system-${system.key}`} className="flex flex-col overflow-hidden rounded-[16px] border border-border-card bg-surface-default shadow-[0_1px_2px_rgba(36,64,74,0.04)]">
                <div className={`flex items-start gap-3 px-5 pb-4 pt-5 ${style.soft}`}>
                  <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${style.dot}`} />
                  <div className="min-w-0">
                    <h3 id={`home-system-${system.key}`} className="text-[1.0625rem] font-semibold leading-6 text-brand-900">{system.title}</h3>
                    <p className="mt-0.5 text-[0.875rem] leading-5 text-ink-600">{system.body}</p>
                  </div>
                </div>
                <ul className="flex flex-1 flex-col divide-y divide-border-subtle">
                  {system.areas.map((area) => (
                    <li key={area.slug} className="flex-1">
                      <Link
                        href={localeHref(locale, area.slug)}
                        className="group flex h-full min-h-[4.25rem] items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-pearl focus-visible:bg-surface-pearl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
                      >
                        <span aria-hidden className={`grid h-10 w-10 flex-none place-items-center rounded-xl text-brand-800 ring-1 ${style.well} ${style.ring}`}>
                          <CareAreaIcon name={area.icon} size={19} strokeWidth={1.7} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.98rem] font-semibold leading-snug text-brand-900 group-hover:text-brand-700">{area.title}</span>
                          {area.consultants.length > 0 ? <span className="mt-0.5 block text-[0.8125rem] leading-5 text-ink-500">{consultants(area.consultants.length)}</span> : null}
                        </span>
                        <ArrowRight size={16} aria-hidden="true" className="flex-none text-brand-600 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
