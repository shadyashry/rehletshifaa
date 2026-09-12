import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";
import { CareJourney, JourneyPreview } from "@/components/journey/CareJourney";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "how-it-works", d.how.title, d.how.intro);
}

/**
 * The complete international-patient journey, explained: seven stages in four phases on one spine, with
 * information visualisations instead of photography — the homepage gives the short version, this page the
 * whole way from sending a case to follow-up. One closing action; no actions between stages.
 */
export default async function HowItWorks({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);

  return (
    <>
      <PageHero tone="pearl" eyebrow={d.how.eyebrow} title={d.how.title} intro={d.how.intro} aside={<JourneyPreview items={d.how.preview} />} />
      <CareJourney how={d.how} />
      <CtaPanel locale={locale} title={d.how.cta.title} body={d.how.cta.body} button={d.common.send} />
    </>
  );
}
