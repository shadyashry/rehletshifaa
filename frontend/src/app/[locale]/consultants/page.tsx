import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaPanel } from "@/components/CtaPanel";
import { ConsultantProfileCard } from "@/components/ConsultantProfileCard";
import { consultantUi, getConsultants } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const ui = consultantUi[locale]; return pageMetadata(locale, "consultants", ui.pageTitle, ui.pageIntro); }
export default async function Consultants({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const ui = consultantUi[locale];
  const consultants = getConsultants(locale);
  return <>
    <PageHero eyebrow={ui.eyebrow} title={ui.pageTitle} intro={ui.pageIntro} />
    <section className="section">
      <div className="container-site">
        <p className="rounded-2xl border border-line bg-wash-aqua p-5 text-sm leading-6 text-ink-700">{ui.notice}</p>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">{consultants.map(profile => <ConsultantProfileCard key={profile.slug} profile={profile} locale={locale} />)}</div>
      </div>
    </section>
    <CtaPanel locale={locale} title={d.consultants.finalTitle} body={d.consultants.finalBody} button={d.common.send} />
  </>;
}

