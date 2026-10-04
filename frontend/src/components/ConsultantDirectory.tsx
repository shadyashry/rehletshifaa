"use client";

import { useState } from "react";
import { ArrowRight, Award, GraduationCap, MapPin, Search, X } from "lucide-react";
import Link from "next/link";
import { ConsultantPortrait } from "./ConsultantProfileCard";
import { consultantUi, type ConsultantProfile } from "@/lib/consultants";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

const copy = {
  en: { title: "Find expertise for your care", intro: "Explore the team by care area, clinical focus or doctor’s name.", search: "Search by name, specialty or expertise", all: "All care areas", count: "doctors", focus: "Clinical focus", distinction: "Career highlight", empty: "No doctors match your search.", reset: "Clear filters", area: "Care area", source: "CV-based profile", feature: "Academic leadership & international experience", featureIntro: "A closer look at university leadership, specialist qualifications and international research across the team.", featured: "Featured credentials" },
  ar: { title: "اكتشف الخبرة المناسبة لرعايتك", intro: "تصفح الفريق حسب مجال الرعاية أو التخصص السريري أو اسم الطبيب.", search: "ابحث بالاسم أو التخصص أو الخبرة", all: "جميع مجالات الرعاية", count: "أطباء", focus: "التركيز السريري", distinction: "أبرز الإنجازات المهنية", empty: "لا يوجد أطباء مطابقون للبحث.", reset: "مسح عوامل التصفية", area: "مجال الرعاية", source: "ملف مستند إلى السيرة الذاتية", feature: "القيادة الأكاديمية والخبرة الدولية", featureIntro: "تعرّف على القيادة الجامعية والمؤهلات التخصصية والأبحاث الدولية لدى الفريق.", featured: "مؤهلات بارزة" },
};
const FEATURED = ["mohamed-hamdy-zaid", "mostafa-baraka", "mostafa-farid"];

export function ConsultantDirectory({ profiles, locale }: { profiles: readonly ConsultantProfile[]; locale: Locale }) {
  const t = copy[locale];
  const ui = consultantUi[locale];
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const areas = [...new Map(profiles.map(p => [p.careAreaHref, p.careAreaLabel])).entries()];
  const search = query.trim().normalize("NFKC").toLocaleLowerCase(locale);
  const filtered = profiles.filter(p => (!area || p.careAreaHref === area) && [p.name, p.specialty, p.role, p.careAreaLabel, ...p.focusAreas, ...p.qualifications].join(" ").normalize("NFKC").toLocaleLowerCase(locale).includes(search));
  return <>
    <section className="bg-surface-pearl py-12 md:py-16" aria-labelledby="featured-title">
      <div className="container-site">
        <div className="max-w-2xl"><p className="eyebrow">{t.featured}</p><h2 id="featured-title" className="headline mt-3">{t.feature}</h2><p className="mt-4 text-base leading-7 text-ink-600">{t.featureIntro}</p></div>
        <ul className="mt-8 grid gap-5 lg:grid-cols-3">
          {FEATURED.map(slug => profiles.find(p => p.slug === slug)).filter((p): p is ConsultantProfile => !!p).map(p => <li key={p.slug} className="relative overflow-hidden rounded-2xl border border-border-card bg-white p-6 sm:p-7">
            <div className="flex items-center gap-4"><ConsultantPortrait profile={p} /><div><p className="text-xs font-semibold text-brand-700">{p.careAreaLabel}</p><h3 className="mt-1 text-xl font-semibold text-brand-900">{p.name}</h3></div></div>
            <div className="mt-6 border-t border-border-subtle pt-5"><Award size={22} className="text-accent-700" aria-hidden="true" /><p className="mt-3 text-lg font-semibold leading-7 text-brand-900">{p.distinction}</p><p className="mt-3 text-sm leading-6 text-ink-600">{p.achievements?.[1] ?? p.cardSummary}</p></div>
            <Link href={localeHref(locale, `consultants/${p.slug}`)} className="link-cta mt-5 min-h-11 after:absolute after:inset-0" aria-label={ui.viewProfileOf(p.name)}>{ui.viewProfile}<ArrowRight size={16} className="rtl:-scale-x-100" aria-hidden="true" /></Link>
          </li>)}
        </ul>
      </div>
    </section>
    <section id="doctor-directory" className="border-t border-border-subtle bg-surface-clinical py-12 md:py-16" aria-labelledby="directory-title">
      <div className="container-site">
        <h2 id="directory-title" className="headline">{t.title}</h2><p className="mt-3 text-ink-600">{t.intro}</p>
        <div className="mt-7 grid gap-4 rounded-2xl border border-border-card bg-white p-5 md:grid-cols-[1fr_20rem]">
          <div><label htmlFor="doctor-search" className="mb-2 block text-sm font-semibold text-brand-900">{t.search}</label><div className="relative"><Search size={18} aria-hidden="true" className="absolute start-3 top-3.5 text-brand-600" /><input id="doctor-search" type="search" value={query} onChange={e => setQuery(e.target.value)} className="h-12 w-full rounded-lg border border-brand-300 bg-surface-pearl pe-3 ps-10 text-base text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" /></div></div>
          <div><label htmlFor="doctor-area" className="mb-2 block text-sm font-semibold text-brand-900">{t.area}</label><select id="doctor-area" value={area} onChange={e => setArea(e.target.value)} className="h-12 w-full rounded-lg border border-brand-300 bg-surface-pearl px-3 text-base text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"><option value="">{t.all}</option>{areas.map(([slug, label]) => <option value={slug} key={slug}>{label}</option>)}</select></div>
        </div>
        <div className="my-6 flex min-h-11 items-center justify-between gap-4"><p role="status" aria-live="polite" className="text-sm font-semibold text-brand-800">{filtered.length} {t.count}</p>{(query || area) && <button type="button" onClick={() => { setQuery(""); setArea(""); }} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700"><X size={16} aria-hidden="true" />{t.reset}</button>}</div>
        {filtered.length ? <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => <li key={p.slug}><article className="flex h-full flex-col rounded-2xl border border-border-card bg-white p-6 transition-shadow hover:shadow-lg motion-reduce:transition-none sm:p-7">
            <div className="flex items-start gap-4"><ConsultantPortrait profile={p} /><div className="min-w-0"><p className="text-xs font-semibold leading-5 text-brand-700">{p.careAreaLabel}</p><h3 className="mt-1 text-xl font-semibold leading-7 text-brand-900">{p.name}</h3><p className="mt-2 text-sm leading-6 text-ink-600">{p.specialty}</p></div></div>
            <p className="mt-5 flex gap-2 text-sm leading-6 text-ink-700"><GraduationCap size={18} aria-hidden="true" className="mt-1 shrink-0 text-brand-600" />{p.role}</p>
            {p.distinction && <div className="mt-5 rounded-xl bg-surface-clinical p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t.distinction}</p><p className="mt-2 text-sm font-semibold leading-6 text-brand-900">{p.distinction}</p></div>}
            <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t.focus}</p><ul className="mt-2 flex flex-wrap gap-2">{p.focusAreas.slice(0, 3).map(f => <li key={f} className="rounded-md border border-border-subtle px-2.5 py-1 text-xs leading-5 text-ink-700">{f}</li>)}</ul></div>
            <div className="mt-auto pt-6"><p className="flex items-center gap-2 text-sm text-ink-500"><MapPin size={15} aria-hidden="true" />{p.location}</p><Link href={localeHref(locale, `consultants/${p.slug}`)} aria-label={ui.viewProfileOf(p.name)} className="mt-4 flex min-h-12 items-center justify-between rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-surface-clinical focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">{ui.viewProfile}<ArrowRight size={16} className="rtl:-scale-x-100" aria-hidden="true" /></Link></div>
          </article></li>)}
        </ul> : <p className="rounded-xl border border-border-card bg-white p-10 text-center text-ink-700">{t.empty}</p>}
      </div>
    </section>
  </>;
}
