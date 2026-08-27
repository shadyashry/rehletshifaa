import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaPanel } from "@/components/CtaPanel";
import { AudiencePaths } from "@/components/home/AudiencePaths";
import { CarePathways } from "@/components/home/CarePathways";
import { Hero } from "@/components/home/Hero";
import { SupportBand } from "@/components/home/SupportBand";
import { TrustSection } from "@/components/home/TrustSection";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "", d.home.title, d.home.intro);
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);

  return (
    <>
      <Hero locale={locale} d={d} />
      <CarePathways locale={locale} d={d} />
      <AudiencePaths locale={locale} d={d} />
      <SupportBand d={d} />
      <TrustSection d={d} />
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
