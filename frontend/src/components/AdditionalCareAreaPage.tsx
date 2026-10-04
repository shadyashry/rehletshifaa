import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryTabs } from "@/components/CategoryTabs";
import { ConsultantSpotlight } from "@/components/ConsultantProfileCard";
import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";
import { ADDITIONAL_CARE_AREAS } from "@/lib/additional-care-areas";
import { careAreaTabs } from "@/lib/care-areas";
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
export default async function AdditionalCareArea({ params }: Props) {
  const { locale, careArea } = await params;
  const area = ADDITIONAL_CARE_AREAS.find(a => a.slug === careArea);
  if (!isLocale(locale) || !area) notFound();
  const d = getDictionary(locale);
  const doctors = getConsultants(locale).filter(p => p.careAreaHref === careArea);
  return <>
    <PageHero tone="pearl" eyebrow={d.careAreasPage.eyebrow} title={area[locale].title} intro={area[locale].body} />
    <CategoryTabs tabs={careAreaTabs(locale, d)} label={d.careAreasPage.tabsLabel} />
    <section className="section bg-surface-pearl"><div className="container-site grid gap-6">
      {doctors.map(profile => <ConsultantSpotlight key={profile.slug} profile={profile} locale={locale} />)}
    </div></section>
    <CtaPanel locale={locale} title={d.consultants.finalTitle} body={d.consultants.finalBody} button={d.common.send} />
  </>;
}
