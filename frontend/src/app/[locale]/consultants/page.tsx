import type { Metadata } from "next";
import { ArrowDown, BadgeCheck, FileText, ScanSearch } from "lucide-react";
import { notFound } from "next/navigation";

import { CaseRouter } from "@/components/care-areas/CaseRouter";
import { ConsultantMatching } from "@/components/consultants/ConsultantMatching";
import { ConsultantPanel, type PanelEntry } from "@/components/consultants/ConsultantPanel";
import { PageHero } from "@/components/PageHero";
import { CARE_SYSTEMS, careAreaMeta } from "@/lib/care-area-catalog";
import { consultantUi, getConsultants } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

const VERIFY_ICONS = [FileText, ScanSearch, BadgeCheck] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "consultants", consultantUi[locale].pageTitle, consultantUi[locale].pageIntro);
}

/**
 * The Consultants page is a trust page, not a marketplace. The hero shows how a case reaches a Consultant
 * (the patient never has to pick); the panel lists every named Consultant grouped by the same body
 * systems as the Care Areas atlas, with search and filters; then how profiles are reviewed, and the
 * closing router. No featured row, ratings or rankings — the order of profiles carries no meaning.
 */
export default async function Consultants({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const ui = consultantUi[locale];
  const page = d.consultantsPage;
  const profiles = getConsultants(locale);

  const entries: PanelEntry[] = profiles.flatMap((profile) => {
    const meta = careAreaMeta(profile.careAreaHref);
    if (!meta) return [];
    return [{ profile, ...meta, href: localeHref(locale, `consultants/${profile.slug}`), viewOf: ui.viewProfileOf(profile.name) }];
  });
  const systems = CARE_SYSTEMS.filter((key) => entries.some((entry) => entry.system === key)).map((key) => ({ key, title: d.careAreasPage.systems[key].title }));

  return (
    <>
      <PageHero
        tone="pearl"
        eyebrow={ui.eyebrow}
        title={ui.pageTitle}
        intro={ui.pageIntro}
        aside={
          <ConsultantMatching
            label={page.matching.label}
            stages={ui.matching}
            criteria={page.matching.criteria}
            matched={page.matching.matched}
            initials={entries.map((entry) => entry.profile.initials)}
          />
        }
      >
        <div className="mt-6">
          <a href="#consultant-panel" className="link-cta text-[0.9375rem]">
            {page.explore}
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </PageHero>

      <section id="consultant-panel" aria-labelledby="panel-title" className="scroll-mt-20 bg-surface-pearl pb-16 pt-14 md:pb-20 md:pt-20">
        <div className="container-site">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
            <div>
              <p className="eyebrow">{page.panel.eyebrow}</p>
              <h2 id="panel-title" className="mt-3 max-w-[24ch] text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.25rem]">
                {page.panel.title}
              </h2>
            </div>
            <p className="max-w-[52ch] text-[1rem] leading-7 text-ink-600">{page.panel.intro}</p>
          </div>
          <ConsultantPanel entries={entries} systems={systems} locale={locale} copy={{ ...page.panel, view: ui.viewProfile }} />
        </div>
      </section>

      <section aria-labelledby="verification-title" className="border-t border-border-subtle bg-surface-default py-16 md:py-20">
        <div className="container-site grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <p className="eyebrow">{ui.verificationEyebrow}</p>
            <h2 id="verification-title" className="mt-3 max-w-[22ch] text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.125rem]">
              {ui.verificationTitle}
            </h2>
            <p className="mt-4 max-w-[48ch] text-[1rem] leading-7 text-ink-600">{ui.notice}</p>
            <p className="mt-4 max-w-[52ch] text-[0.875rem] leading-6 text-ink-500">{page.verification.disclaimer}</p>
          </div>
          <ol className="divide-y divide-border-subtle rounded-[18px] border border-border-card bg-surface-pearl">
            {page.verification.steps.map((step, index) => {
              const Icon = VERIFY_ICONS[index] ?? BadgeCheck;
              return (
                <li key={step.title} className="flex gap-4 p-5 sm:gap-5 sm:p-6">
                  <span aria-hidden className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-surface-default text-brand-700 ring-1 ring-border-clinical">
                    <Icon size={21} strokeWidth={1.7} />
                  </span>
                  <div>
                    <p className="text-[0.75rem] font-semibold tabular-nums tracking-[0.08em] text-brand-600 rtl:tracking-normal">0{index + 1}</p>
                    <h3 className="mt-0.5 text-[1.0625rem] font-semibold leading-snug text-brand-900">{step.title}</h3>
                    <p className="mt-1 text-[0.9375rem] leading-6 text-ink-600">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <CaseRouter locale={locale} copy={page.router} button={d.common.send} />
    </>
  );
}
