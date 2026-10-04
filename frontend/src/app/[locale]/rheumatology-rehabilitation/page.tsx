import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CareAreaDetail } from "@/components/care-areas/CareAreaDetail";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "rheumatology-rehabilitation", d.rheumatology.title, d.rheumatology.intro);
}

export default async function Rheumatology({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const content = d.rheumatology;
  return (
    <CareAreaDetail
      locale={locale}
      d={d}
      slug="rheumatology-rehabilitation"
      scope={content.sections}
      note={content.note}
      highlight={content.highlight}
      closing={{ title: content.finalTitle, body: content.finalBody }}
    />
  );
}
