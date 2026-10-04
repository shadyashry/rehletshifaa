import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CareAreaDetail } from "@/components/care-areas/CareAreaDetail";
import { ADDITIONAL_CARE_AREAS } from "@/lib/additional-care-areas";
import { getConsultants } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string; careArea: string }> };

export function generateStaticParams() {
  return ["en", "ar"].flatMap(locale => ADDITIONAL_CARE_AREAS.map(area => ({ locale, careArea: area.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, careArea } = await params;
  const area = ADDITIONAL_CARE_AREAS.find(a => a.slug === careArea);
  if (!isLocale(locale) || !area) return {};
  return pageMetadata(locale, careArea, area[locale].title, area[locale].body);
}

/**
 * The care areas added after launch share the one care-area template. They have no curated scope copy yet,
 * so their scope is their Consultants' CV-verified clinical focus — accurate, and replaced by curated
 * sections whenever an area gets its own dictionary node like Cardiology.
 */
export default async function AdditionalCareArea({ params }: Props) {
  const { locale, careArea } = await params;
  const area = ADDITIONAL_CARE_AREAS.find(a => a.slug === careArea);
  if (!isLocale(locale) || !area) notFound();
  const d = getDictionary(locale);
  const focus = [...new Set(getConsultants(locale).filter(p => p.careAreaHref === careArea).flatMap(p => p.focusAreas))];
  return (
    <CareAreaDetail
      locale={locale}
      d={d}
      slug={careArea}
      scope={[{ title: d.careAreaDetail.focusTitle, items: focus }]}
      note={d.cardiology.suitability}
    />
  );
}
