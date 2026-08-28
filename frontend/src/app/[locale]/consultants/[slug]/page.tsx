import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
import { CtaPanel } from "@/components/CtaPanel";
import { CONSULTANT_SLUGS, consultantUi, getConsultant } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return ["en", "ar"].flatMap(locale => CONSULTANT_SLUGS.map(slug => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const profile = getConsultant(locale, slug);
  return profile ? pageMetadata(locale, `consultants/${slug}`, profile.name, profile.summary) : {};
}

function DetailList({ items }: { items: readonly string[] }) {
  return <ul className="mt-5 grid gap-3">{items.map(item => <li className="flex gap-3 leading-7 text-ink-700" key={item}><Check size={17} className="mt-1.5 shrink-0 text-accent-700" aria-hidden="true" />{item}</li>)}</ul>;
}

export default async function ConsultantProfilePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const profile = getConsultant(locale, slug);
  if (!profile) notFound();
  const ui = consultantUi[locale];
  const d = getDictionary(locale);
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;

  return <>
    <section className="border-b border-line bg-mist">
      <div className="container-site py-12 md:py-18">
        <Link href={localeHref(locale, "consultants")} className="inline-flex items-center gap-2 text-sm font-bold text-brand-700"><BackIcon size={17} aria-hidden="true" />{ui.back}</Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
          <div className="overflow-hidden rounded-3xl border border-line bg-white"><ConsultantPortrait profile={profile} locale={locale} compact /></div>
          <div>
            <p className="eyebrow">{profile.careAreaLabel}</p>
            <h1 className="display mt-4">{profile.name}</h1>
            <p className="mt-4 text-lg font-bold leading-7 text-accent-800">{profile.credentials}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {profile.achievementBadges.map((badge) => <span className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-white px-3.5 py-2 text-sm font-bold text-brand-800 shadow-sm" key={badge}><BadgeCheck size={16} className="text-accent-700" aria-hidden="true" />{badge}</span>)}
            </div>
            <p className="mt-3 text-lg leading-8 text-ink-700">{profile.role}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-500"><MapPin size={16} aria-hidden="true" />{profile.location}</p>
            <p className="lead mt-6">{profile.summary}</p>
          </div>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="container-site grid gap-6 lg:grid-cols-2">
        {([[ui.focus, profile.focusAreas], [ui.qualifications, profile.qualifications], [ui.appointments, profile.appointments], [ui.standing, profile.professionalStanding]] as const).map(([title, items]) => <article className="card p-6 sm:p-8" key={title}><h2 className="text-2xl font-bold text-brand-900">{title}</h2><DetailList items={items} /></article>)}
      </div>
      <div className="container-site mt-7">
        <div className="rounded-2xl border border-line bg-wash-aqua p-5 text-sm leading-6 text-ink-700">
          <div className="flex gap-2"><BadgeCheck size={18} className="mt-0.5 shrink-0 text-accent-700" aria-hidden="true" /><p>{profile.verification}</p></div>
          {profile.externalLinks?.length ? <div className="mt-4 flex flex-wrap gap-4">{profile.externalLinks.map(link => <a className="inline-flex items-center gap-1.5 font-bold text-brand-700" href={link.href} target="_blank" rel="noreferrer" key={link.href}>{link.label}<ExternalLink size={14} aria-hidden="true" /></a>)}</div> : null}
        </div>
        <Link href={localeHref(locale, profile.careAreaHref)} className="btn-secondary mt-7">{ui.careArea}<ArrowRight size={17} className="rtl:-scale-x-100" aria-hidden="true" /></Link>
      </div>
    </section>

    <CtaPanel locale={locale} title={d.consultants.finalTitle} body={d.consultants.finalBody} button={d.common.send} />
  </>;
}
