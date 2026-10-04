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
  return pageMetadata(locale, "cardiology", d.cardiology.title, d.cardiology.intro);
}

export default async function Cardiology({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const c = d.cardiology;
  return (
    <CareAreaDetail
      locale={locale}
      d={d}
      slug="cardiology"
      scope={[
        { title: c.coronaryTitle, items: c.coronaryItems, signs: c.coronaryExamples },
        { title: c.structuralTitle, items: c.structuralItems },
        { title: c.rhythmTitle, items: c.rhythmItems, signs: c.rhythmExamples },
      ]}
      signsLabel={c.examples}
      note={c.suitability}
      closing={{ title: c.finalTitle, body: c.finalBody }}
    />
  );
}
