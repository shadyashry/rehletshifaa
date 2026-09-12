import type { Metadata } from "next";
import { ArrowRight, Activity, Bone, HeartPulse } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";
import { CARE_AREA_SLUGS } from "@/lib/care-areas";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

const ICONS = [HeartPulse, Activity, Bone] as const;
/** One card family, three near-white undertones — teal-pearl, cool pearl, ivory-pearl — and a matching icon-well tint. */
const SURFACES = [
  { card: "bg-card-cardiology hover:bg-card-cardiology-hover", well: "bg-well-cardiology ring-border-clinical" },
  { card: "bg-card-rehab hover:bg-card-rehab-hover", well: "bg-well-rehab ring-well-rehab-ring" },
  { card: "bg-card-ortho hover:bg-card-ortho-hover", well: "bg-well-ortho ring-well-ortho-ring" },
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "care-areas", d.careAreasPage.title, d.careAreasPage.intro);
}

/**
 * The selection page: three care areas of equal standing in one card family — a near-white undertone per
 * specialty (a 2–3% tint, never a coloured card), a soft gray-teal hairline, a small tinted icon well and
 * one text action — so no specialty reads as the platform's real business. The cards share a subgrid, so icon, title, description and action sit on the same rows in
 * every card whatever the title's length. One quiet reassurance line under the intro and one warm,
 * unsaturated closing panel; nothing else.
 */
export default async function CareAreas({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const page = d.careAreasPage;

  return (
    <>
      <PageHero tone="pearl" eyebrow={page.eyebrow} title={page.title} intro={page.intro}>
        <p className="flex max-w-[60ch] items-start gap-3 text-[0.95rem] leading-6 text-ink-700">
          <span aria-hidden className="mt-3 h-px w-6 flex-none bg-brand-400" />
          {page.reassurance}
        </p>
      </PageHero>

      <section className="bg-surface-pearl pt-12 md:pt-14">
        <ul className="container-site grid gap-4 sm:gap-5 lg:grid-cols-3 lg:grid-rows-[auto_auto_minmax(0,1fr)_auto] lg:gap-x-6 lg:gap-y-0">
          {d.home.areas.map((area, index) => {
            const Icon = ICONS[index] ?? HeartPulse;
            const surface = SURFACES[index] ?? SURFACES[0];
            const href = localeHref(locale, CARE_AREA_SLUGS[index]);
            return (
              <li
                key={area.title}
                className={`group relative flex flex-col rounded-[14px] border border-border-card p-6 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-brand-400 has-[a:focus-visible]:border-brand-500 motion-reduce:transform-none sm:p-7 lg:grid lg:row-span-4 lg:grid-rows-subgrid ${surface.card}`}
              >
                {/* Below the three-column layout the icon sits beside the title; from lg the wrapper dissolves and both join the subgrid. */}
                <div className="flex items-center gap-3.5 lg:contents">
                  <span aria-hidden className={`grid h-10 w-10 flex-none place-items-center rounded-full text-brand-800 ring-1 ${surface.well}`}>
                    <Icon size={19} strokeWidth={1.7} />
                  </span>
                  <h2 className="text-[1.125rem] font-semibold leading-[1.3] tracking-[-0.008em] text-brand-900 [text-wrap:balance] sm:text-[1.1875rem] lg:mt-4">{area.title}</h2>
                </div>
                <p className="mt-3 max-w-[52ch] text-[0.95rem] leading-6 text-ink-600 sm:text-[1rem] sm:leading-7 lg:mt-2">{area.body}</p>
                <Link
                  href={href}
                  aria-label={`${d.home.areasAction} — ${area.title}`}
                  className="link-cta mt-3 min-h-11 text-[0.95rem] after:absolute after:inset-0 lg:mt-4"
                >
                  {d.home.areasAction}
                  <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <CtaPanel variant="quiet" locale={locale} title={d.home.finalTitle} body={page.ctaBody} button={d.common.send} />
    </>
  );
}
