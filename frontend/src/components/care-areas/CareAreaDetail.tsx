import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronRight, Send, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CaseRouter } from "@/components/care-areas/CaseRouter";
import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { HeroStats } from "@/components/HeroStats";
import { careAreaAtlas, careAtlasSystems } from "@/lib/care-area-catalog";
import { consultantUi, universityFacultySlugs } from "@/lib/consultants";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

export type AreaScope = readonly { title: string; items: readonly string[]; signs?: readonly string[] }[];

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

/**
 * One template for every care-area page, so the nine areas read as one system with equal standing:
 * 1. hero — body system, area, three derived facts, the action, and a snapshot of the area (sub-areas and
 *    the Consultants who lead it, in the area's system tint);
 * 2. scope — numbered cards of what the area covers, with "you might contact us if" signs where we have
 *    them, and the suitability note;
 * 3. the Consultants who lead it — the same cards as the Consultants panel;
 * 4. other care areas (same system first) and the closing router.
 * Areas without curated scope copy show their Consultants' CV-verified focus areas instead.
 */
export function CareAreaDetail({ locale, d, slug, scope, note, highlight, signsLabel, closing }: {
  locale: Locale;
  d: Dictionary;
  slug: string;
  scope: AreaScope;
  note: string;
  highlight?: string;
  signsLabel?: string;
  closing?: { title: string; body: string };
}) {
  const atlas = careAreaAtlas(locale, d);
  const area = atlas.find((item) => item.slug === slug);
  if (!area) notFound();
  const t = d.careAreaDetail;
  const ui = consultantUi[locale];
  const systems = careAtlasSystems(atlas, d);
  const system = systems.find((item) => item.key === area.system)!;
  const style = SYSTEM_STYLES[area.system];
  const faculty = universityFacultySlugs();
  const singleConsultant = area.consultants.length === 1;
  const namedLeads = area.consultants.length > 0 && area.consultants.length <= 2;
  const facultyCount = area.consultants.filter((p) => faculty.has(p.slug)).length;
  const signGroups = scope.filter((section) => section.signs?.length);
  const PREVIEW = 4;
  const focusCount = scope.reduce((sum, section) => sum + section.items.length, 0);
  const led = (n: number) => (n === 1 ? d.careAreasPage.atlas.consultantsOne : n === 2 ? d.careAreasPage.atlas.consultantsTwo : fill(d.careAreasPage.atlas.consultantsMany, { n }));
  const siblings = system.areas.filter((item) => item.slug !== slug);
  const others = atlas.filter((item) => item.slug !== slug && item.system !== area.system);
  const router = closing ? { ...d.careAreasPage.router, title: closing.title, body: closing.body } : d.careAreasPage.router;

  return (
    <>
      {/* 1 — hero */}
      <section className="page-hero border-b border-border-subtle bg-surface-pearl bg-[radial-gradient(70%_120%_at_88%_-10%,var(--color-surface-clinical),var(--color-surface-pearl)_72%)]">
        <div className="container-site grid gap-9 pb-12 pt-8 md:pt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16 lg:pb-14">
          <div>
            <nav aria-label={t.careAreas} className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
              <Link href={localeHref(locale, "care-areas")} className="rounded px-0.5 hover:text-brand-700">{t.careAreas}</Link>
              <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
              <Link href={`${localeHref(locale, "care-areas")}#system-${area.system}`} className="inline-flex items-center gap-1.5 rounded px-0.5 hover:text-brand-700">
                <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
                {system.title}
              </Link>
            </nav>
            <h1 className="display mt-4 max-w-[20ch] rtl:max-w-[28ch] [text-wrap:balance]">{area.title}</h1>
            <p className="lead mt-4 max-w-[58ch]">{area.body}</p>
            {highlight ? (
              <p className="hero-island mt-4 inline-flex max-w-full items-start gap-2 rounded-xl bg-surface-default px-3.5 py-2.5 text-[0.9375rem] font-semibold leading-6 text-brand-800 ring-1 ring-border-clinical">
                <Sparkles size={17} aria-hidden="true" className="mt-0.5 flex-none text-brand-600" />
                {highlight}
              </p>
            ) : null}
            <div className="mt-6">
              {namedLeads ? (
                // One or two Consultants: name them — a person builds more trust than a count of one.
                <div className="hero-island max-w-[36rem] rounded-[16px] bg-surface-default/80 p-4 ring-1 ring-border-subtle">
                  <p className="text-[0.8125rem] font-semibold text-ink-500">{t.ledBy}</p>
                  <ul className="mt-2.5 grid gap-2.5">
                    {area.consultants.map((profile) => (
                      <li key={profile.slug}>
                        <Link href={localeHref(locale, `consultants/${profile.slug}`)} className="group flex items-center gap-3 rounded-xl">
                          <span aria-hidden className={`grid h-10 w-10 flex-none place-items-center rounded-full text-[0.8125rem] font-semibold tracking-[0.03em] text-brand-800 ring-1 ${style.well} ${style.ring}`}>
                            {profile.initials}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[1rem] font-semibold leading-6 text-brand-900 group-hover:text-brand-700">{profile.name}</span>
                            <span className="line-clamp-1 text-[0.875rem] leading-5 text-ink-500">{profile.distinction ?? profile.role}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <HeroStats
                  stats={[
                    { value: area.consultants.length, label: area.consultants.length === 1 ? t.stats.consultantsOne : t.stats.consultants },
                    { value: facultyCount, label: facultyCount === 1 ? t.stats.facultyOne : t.stats.faculty },
                    { value: focusCount, label: t.stats.focus },
                  ]}
                />
              )}
            </div>
            {/* One in-content route to the form, at the close (CaseRouter); the header carries the primary action. */}
            <div className="mt-6">
              <a href="#area-consultants" className="link-cta text-[0.9375rem]">
                {t.meet}
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* The area snapshot: icon, sub-areas, and the Consultants who lead it. */}
          <figure aria-hidden className={`hero-island relative mx-auto w-full max-w-[26rem] overflow-hidden rounded-[22px] border border-border-card bg-surface-default shadow-[0_30px_60px_-42px_rgba(36,64,74,0.6)] ${singleConsultant ? "hidden lg:block" : ""}`}>
            <div className={`relative px-6 pb-6 pt-6 ${style.soft}`}>
              <CareAreaIcon name={area.icon} strokeWidth={0.7} className={`pointer-events-none absolute end-3 top-3 h-28 w-28 opacity-[0.16] ${style.line}`} />
              <span className={`relative grid h-14 w-14 place-items-center rounded-2xl bg-surface-default text-brand-800 shadow-[0_10px_24px_-14px_rgba(36,64,74,0.6)] ring-1 ${style.ring}`}>
                <CareAreaIcon name={area.icon} size={26} strokeWidth={1.6} />
              </span>
              <p className="relative mt-4 text-[1.125rem] font-semibold leading-snug text-brand-900">{area.title}</p>
              <p className="relative mt-0.5 text-[0.8125rem] font-medium text-ink-500">{system.title}</p>
            </div>
            <ul className="divide-y divide-border-subtle px-6">
              {area.facets.map((facet) => (
                <li key={facet} className="flex items-center gap-3 py-3 text-[0.9375rem] font-medium text-brand-900">
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${style.well}`}>
                    <Check size={13} strokeWidth={2.4} className="text-brand-700" />
                  </span>
                  {facet}
                </li>
              ))}
            </ul>
            {area.consultants.length > 0 ? (
              <div className="mt-1 flex items-center gap-3 border-t border-border-subtle bg-surface-pearl px-6 py-4">
                <span className="flex -space-x-2 rtl:space-x-reverse">
                  {area.consultants.slice(0, 4).map((profile) => (
                    <span key={profile.slug} className={`grid h-9 w-9 place-items-center rounded-full text-[0.75rem] font-semibold tracking-[0.03em] text-brand-800 ring-2 ring-surface-pearl ${style.well}`}>
                      {profile.initials}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 text-[0.875rem] leading-5 text-ink-600">
                  {t.snapshotLed}{" "}
                  <span className="font-semibold text-brand-900">
                    {namedLeads ? area.consultants.map((profile) => profile.name).join(locale === "ar" ? " و" : " & ") : led(area.consultants.length)}
                  </span>
                </span>
              </div>
            ) : null}
          </figure>
        </div>
      </section>

      {/* 2 — scope */}
      <section aria-labelledby="scope-title" className="bg-surface-pearl py-14 md:py-20">
        <div className="container-site">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <div>
              <p className="eyebrow">{t.scopeEyebrow}</p>
              <h2 id="scope-title" className="mt-3 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 rtl:leading-snug rtl:tracking-normal sm:text-[2.125rem]">{t.scopeTitle}</h2>
            </div>
            <p className="max-w-[52ch] text-[1rem] leading-7 text-ink-600">{t.scopeIntro}</p>
          </div>

          <div className={`mt-8 grid gap-5 ${scope.length > 1 ? "lg:grid-cols-2" : ""} ${scope.length === 3 ? "xl:grid-cols-3" : ""}`}>
            {scope.map((section, index) => (
              <article key={section.title} className="flex flex-col rounded-[18px] border border-border-card bg-surface-default p-6 shadow-[0_1px_2px_rgba(36,64,74,0.04)] sm:p-7">
                <div className="flex items-center gap-3.5">
                  <span aria-hidden className={`grid h-10 w-10 flex-none place-items-center rounded-full text-[0.8125rem] font-semibold tabular-nums text-brand-800 ring-1 ${style.well} ${style.ring}`}>
                    {scope.length === 1 ? <CareAreaIcon name={area.icon} size={18} strokeWidth={1.8} /> : String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[1.125rem] font-semibold leading-snug text-brand-900 [text-wrap:balance]">{section.title}</h3>
                </div>
                {/* Phones show the first items and a "show more" toggle; from sm every item is listed. */}
                <ul className={`mt-5 grid gap-x-5 gap-y-2.5 ${scope.length === 1 ? "sm:grid-cols-2" : ""}`}>
                  {section.items.map((item, i) => (
                    <li key={item} className={`flex gap-2.5 text-[0.9375rem] leading-6 text-ink-700 ${i >= PREVIEW ? "max-sm:hidden" : ""}`}>
                      <Check size={16} strokeWidth={2.2} aria-hidden="true" className="mt-1 flex-none text-brand-600" />
                      {item}
                    </li>
                  ))}
                </ul>
                {section.items.length > PREVIEW ? (
                  <details className="group/more mt-2.5 sm:hidden">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
                      {fill(t.showMore, { n: section.items.length - PREVIEW })}
                      <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open/more:rotate-180" />
                    </summary>
                    <ul className="mt-1 grid gap-y-2.5">
                      {section.items.slice(PREVIEW).map((item) => (
                        <li key={item} className="flex gap-2.5 text-[0.9375rem] leading-6 text-ink-700">
                          <Check size={16} strokeWidth={2.2} aria-hidden="true" className="mt-1 flex-none text-brand-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            ))}
          </div>

          {/* When to send a case: every section's signs in one panel, with the suitability note as its footer. */}
          <div className="mt-6 overflow-hidden rounded-[18px] border border-border-clinical bg-surface-clinical">
            {signGroups.length ? (
              <div className="p-6 sm:p-7">
                <p className="flex items-center gap-2.5 text-[1.125rem] font-semibold text-brand-900">
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-surface-default text-brand-700 ring-1 ring-border-clinical">
                    <Send size={16} strokeWidth={1.9} className="rtl:-scale-x-100" />
                  </span>
                  {signsLabel ?? t.signsTitle}
                </p>
                <div className={`mt-5 grid gap-6 ${signGroups.length > 1 ? "md:grid-cols-2" : ""} ${signGroups.length > 2 ? "xl:grid-cols-3" : ""}`}>
                  {signGroups.map((section) => (
                    <div key={section.title}>
                      {signGroups.length > 1 ? <p className="text-[0.8125rem] font-semibold text-brand-700">{section.title}</p> : null}
                      <ul className="mt-2 grid gap-1.5">
                        {section.signs!.map((sign) => (
                          <li key={sign} className="flex gap-2.5 text-[0.9375rem] leading-6 text-ink-700">
                            <span aria-hidden className={`mt-2.5 h-1.5 w-1.5 flex-none rounded-full ${style.dot}`} />
                            {sign}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <p className={`flex items-start gap-3 bg-surface-default px-6 py-4 text-[0.9375rem] font-medium leading-7 text-brand-900 sm:px-7 ${signGroups.length ? "border-t border-border-clinical" : ""}`}>
              <ShieldCheck size={18} aria-hidden="true" className="mt-1 flex-none text-brand-600" />
              {note}
            </p>
          </div>
        </div>
      </section>

      {/* 3 — the Consultants */}
      <section id="area-consultants" aria-labelledby="area-consultants-title" className="scroll-mt-20 border-t border-border-subtle bg-surface-default py-14 md:py-20">
        <div className={`container-site grid grid-cols-1 gap-8 ${singleConsultant ? "" : "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12"}`}>
          <div className={singleConsultant ? "" : "lg:sticky lg:top-28 lg:self-start"}>
            <div>
              <p className="eyebrow">{t.consultantsEyebrow}</p>
              <h2 id="area-consultants-title" className="mt-3 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.125rem]">
                {fill(t.consultantsTitle, { area: area.title })}
              </h2>
            </div>
            <p className={`mt-4 text-[1rem] leading-7 text-ink-600 ${singleConsultant ? "max-w-[70ch]" : "max-w-[44ch]"}`}>{t.consultantsIntro}</p>
          </div>
          <ul className={`grid grid-cols-1 gap-5 ${singleConsultant ? "" : "md:grid-cols-2"}`}>
            {area.consultants.map((profile) => (
              <li key={profile.slug}>
                <ConsultantCard
                  featured={singleConsultant}
                  profile={profile}
                  system={area.system}
                  icon={area.icon}
                  href={localeHref(locale, `consultants/${profile.slug}`)}
                  labels={{ view: ui.viewProfile, viewOf: ui.viewProfileOf(profile.name), distinction: ui.verifiedRole, focus: ui.focus }}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 — other care areas */}
      <section aria-labelledby="related-title" className="border-t border-border-subtle bg-surface-pearl py-14 md:py-16">
        <div className="container-site">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{t.relatedEyebrow}</p>
              <h2 id="related-title" className="mt-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 rtl:tracking-normal sm:text-[1.75rem]">{t.relatedTitle}</h2>
            </div>
            <Link href={localeHref(locale, "care-areas")} className="link-cta text-[0.9375rem]">
              {t.allAreas}
              <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </div>
          {siblings.length > 0 ? <p className="mt-6 text-[0.8125rem] font-semibold text-ink-500">{fill(t.sameSystem, { system: system.title })}</p> : null}
          <ul className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${siblings.length > 0 ? "mt-3" : "mt-6"}`}>
            {[...siblings, ...others].map((item) => {
              const itemStyle = SYSTEM_STYLES[item.system];
              return (
                <li key={item.slug}>
                  <Link
                    href={localeHref(locale, item.slug)}
                    className={`group flex h-full items-center gap-3 rounded-[14px] border bg-surface-default px-4 py-3.5 transition-colors hover:border-brand-300 ${item.system === area.system ? "border-brand-300" : "border-border-card"}`}
                  >
                    <span aria-hidden className={`grid h-9 w-9 flex-none place-items-center rounded-lg text-brand-800 ring-1 ${itemStyle.well} ${itemStyle.ring}`}>
                      <CareAreaIcon name={item.icon} size={17} strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1 text-[0.9375rem] font-medium leading-snug text-brand-900 group-hover:text-brand-700">{item.title}</span>
                    <ArrowRight size={15} aria-hidden="true" className="flex-none text-brand-600 rtl:-scale-x-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <CaseRouter locale={locale} copy={router} button={d.common.send} />
    </>
  );
}
