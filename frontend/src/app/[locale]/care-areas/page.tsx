import type { Metadata } from "next";
import { ArrowDown, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";

import { CareAreaCard } from "@/components/care-areas/CareAreaCard";
import { SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { CareNetwork } from "@/components/care-areas/CareNetwork";
import { CaseRouter } from "@/components/care-areas/CaseRouter";
import { HeroStats } from "@/components/HeroStats";
import { PageHero } from "@/components/PageHero";
import { TrackedLink } from "@/components/TrackedLink";
import { careAreaAtlas, careAtlasSystems } from "@/lib/care-area-catalog";
import { universityFacultySlugs } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  const count = careAreaAtlas(locale, d).length;
  return pageMetadata(locale, "care-areas", d.careAreasPage.title, fill(d.careAreasPage.intro, { count }));
}

/**
 * The care-areas selection page, organised as a care atlas: a hero whose visual is the platform's promise
 * (one case at the centre, every specialty around it, grouped by body system), the atlas itself — numbered
 * body systems, each with its care-area cards and the named Consultants behind them — and a closing
 * router that tells the undecided patient they never have to choose. Counts are derived, never typed.
 */
export default async function CareAreas({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const page = d.careAreasPage;
  const areas = careAreaAtlas(locale, d);
  const systems = careAtlasSystems(areas, d);

  const consultantsLabel = (n: number) =>
    fill(n === 1 ? page.atlas.consultantsOne : n === 2 ? page.atlas.consultantsTwo : page.atlas.consultantsMany, { n });
  const areasLabel = (n: number) => (n === 1 ? page.atlas.areasOne : fill(page.atlas.areasMany, { n }));

  const consultantSlugs = new Set(areas.flatMap((area) => area.consultants.map((profile) => profile.slug)));
  const faculty = universityFacultySlugs();
  const stats = [
    { value: areas.length, label: page.stats.areas },
    { value: consultantSlugs.size, label: page.stats.consultants },
    { value: [...consultantSlugs].filter((slug) => faculty.has(slug)).length, label: page.stats.faculty },
  ];

  return (
    <>
      <PageHero
        tone="pearl"
        eyebrow={page.eyebrow}
        title={page.title}
        intro={fill(page.intro, { count: areas.length })}
        aside={<CareNetwork areas={areas} rtl={locale === "ar"} label={page.map.label} center={page.map.center} jump={page.map.jump} />}
      >
        <HeroStats stats={stats} />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          <TrackedLink event="send_case_cta_clicked" className="btn-primary w-full sm:w-auto" href={localeHref(locale, "send-my-case")}>
            {d.common.send}
            <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
          <a href="#atlas" className="link-cta justify-center text-[0.9375rem] sm:justify-start">
            {page.explore}
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </PageHero>

      <section id="atlas" aria-labelledby="atlas-title" className="scroll-mt-20 bg-surface-pearl pb-6 pt-14 md:pt-20">
        <div className="container-site">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <div>
              <p className="eyebrow">{page.atlas.eyebrow}</p>
              <h2 id="atlas-title" className="mt-3 max-w-[22ch] text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.25rem]">
                {fill(page.atlas.title, { count: areas.length })}
              </h2>
            </div>
            <p className="max-w-[52ch] text-[1rem] leading-7 text-ink-600">{page.atlas.intro}</p>
          </div>

          <nav aria-label={page.atlas.index} className="mt-8 flex flex-wrap gap-2">
            {systems.map((system) => (
              <a
                key={system.key}
                href={`#system-${system.key}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-card bg-surface-default px-4 text-[0.875rem] font-medium text-ink-700 transition-colors hover:border-brand-400 hover:text-brand-800"
              >
                <span aria-hidden className={`h-2 w-2 rounded-full ${SYSTEM_STYLES[system.key].dot}`} />
                {system.title}
                <span className="text-ink-400 tabular-nums">{system.areas.length}</span>
              </a>
            ))}
          </nav>

          <div className="mt-10 md:mt-12">
            {systems.map((system, index) => {
              const style = SYSTEM_STYLES[system.key];
              const people = system.areas.reduce((sum, area) => sum + area.consultants.length, 0);
              return (
                <section
                  key={system.key}
                  id={`system-${system.key}`}
                  aria-labelledby={`system-${system.key}-title`}
                  className="grid scroll-mt-24 gap-6 border-t border-border-subtle py-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12 lg:py-12"
                >
                  <div className="lg:sticky lg:top-28 lg:self-start">
                    <div className="flex items-center gap-4 lg:block">
                      <p aria-hidden className="text-[2.5rem] font-semibold leading-none tracking-[-0.03em] text-brand-600/40 tabular-nums lg:text-[3.25rem]">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <span aria-hidden className={`h-[3px] w-10 rounded-full lg:mt-5 lg:block ${style.dot}`} />
                    </div>
                    <h3 id={`system-${system.key}-title`} className="mt-4 text-[1.375rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 rtl:leading-snug rtl:tracking-normal sm:text-[1.5rem]">
                      {system.title}
                    </h3>
                    <p className="mt-2 max-w-[40ch] text-[0.9375rem] leading-6 text-ink-600">{system.body}</p>
                    <p className="mt-3 text-[0.8125rem] font-medium leading-5 text-ink-500">
                      {areasLabel(system.areas.length)} · {consultantsLabel(people)}
                    </p>
                  </div>
                  <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                    {system.areas.map((area) => (
                      <CareAreaCard
                        key={area.slug}
                        area={area}
                        href={localeHref(locale, area.slug)}
                        action={d.home.areasAction}
                        consultantsLabel={consultantsLabel(area.consultants.length)}
                        wide={system.areas.length === 1}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <CaseRouter locale={locale} copy={page.router} button={d.common.send} />
    </>
  );
}
