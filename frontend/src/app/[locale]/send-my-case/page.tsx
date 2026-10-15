import type { Metadata } from "next";
import { Clock, HandHeart, MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CaseForm } from "@/components/CaseForm";
import { NextStepsAside } from "@/components/NextStepsAside";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const d = getDictionary(locale); return pageMetadata(locale, "send-my-case", d.form.title, d.form.intro); }
export default async function SendMyCase({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  // The promise sits with the title, before any field: how long it takes, who answers and when, and what it commits you to.
  const promise = [[Clock, d.form.promise.time], [MessageCircle, d.form.promise.reply], [HandHeart, d.form.promise.commitment]] as const;
  return <>
    <PageHero eyebrow={d.form.eyebrow} title={d.form.title} intro={d.form.intro}>
      <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-label={d.form.promise.label}>
        {promise.map(([Icon, label]) => (
          <li key={label} className="flex items-center gap-2 text-[0.9375rem] font-semibold leading-6 text-ink-700">
            <Icon size={16} strokeWidth={1.9} aria-hidden="true" className="flex-none text-brand-600" />
            {label}
          </li>
        ))}
      </ul>
    </PageHero>
    <section className="section section-soft">
      <div className="container-site grid items-start gap-7 lg:grid-cols-[1fr_340px]">
        <CaseForm locale={locale} d={d} />
        <NextStepsAside locale={locale} d={d} />
      </div>
    </section>
  </>;
}
