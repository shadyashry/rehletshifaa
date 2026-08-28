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
const WASHES = ["bg-wash-aqua", "bg-wash-sky", "bg-wash-peach"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "care-areas", d.careAreasPage.title, d.careAreasPage.intro);
}

export default async function CareAreas({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);

  return (
    <>
      <PageHero eyebrow={d.careAreasPage.eyebrow} title={d.careAreasPage.title} intro={d.careAreasPage.intro} />

      <section className="section">
        <div className="container-site grid gap-5 md:grid-cols-3">
          {d.home.areas.map((area, index) => {
            const Icon = ICONS[index] ?? HeartPulse;
            const wash = WASHES[index] ?? WASHES[0];
            const href = localeHref(locale, CARE_AREA_SLUGS[index]);
            return (
              <article key={area.title} className={`flex flex-col rounded-[0.875rem] p-6 sm:p-7 ${wash}`}>
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/70 text-accent-700">
                  <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h2 className="title mt-5">{area.title}</h2>
                <p className="mt-3 text-[0.95rem] leading-7 text-ink-600">{area.body}</p>
                <Link href={href} className="link-cta mt-auto pt-6">
                  {d.home.areasAction}
                  <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <CtaPanel
        locale={locale}
        title={d.home.finalTitle}
        body={d.home.finalBody}
        button={d.common.send}
        note={d.home.finalNote}
      />
    </>
  );
}
