import type { Metadata } from "next";
import { BadgeCheck, Languages, Stethoscope } from "lucide-react";
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
        <div className="grid gap-3 sm:grid-cols-3">
          {[[BadgeCheck,locale==="ar"?"مؤهلات موثقة قبل التوجيه":"Credentials checked before matching"],[Stethoscope,locale==="ar"?"استشاري مسؤول عن القرار السريري":"Consultant-owned clinical decision"],[Languages,locale==="ar"?"تنسيق بالعربية والإنجليزية":"Arabic and English coordination"]].map(([Icon,label])=>{const I=Icon as typeof BadgeCheck;return <div key={String(label)} className="surface-muted flex items-center gap-3 p-4"><I size={20} className="text-brand-600" aria-hidden/><span className="text-sm font-semibold leading-6 text-ink-700">{String(label)}</span></div>})}
        </div>
        <p className="mt-5 rounded-2xl border border-line bg-wash-aqua p-5 text-sm leading-6 text-ink-700">{ui.notice}</p>
        <div className="mt-8 grid gap-6 lg:grid-cols-3">{consultants.map(profile => <ConsultantProfileCard key={profile.slug} profile={profile} locale={locale} />)}</div>
      </div>
    </section>
    <CtaPanel locale={locale} title={d.consultants.finalTitle} body={d.consultants.finalBody} button={d.common.send} />
  </>;
}

