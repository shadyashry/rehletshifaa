import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaPanel } from "@/components/CtaPanel";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { Check } from "lucide-react";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const d = getDictionary(locale); return pageMetadata(locale, "how-it-works", d.how.title, d.how.intro); }
export default async function HowItWorks({ params }: Props) { const { locale } = await params; if (!isLocale(locale)) notFound(); const d = getDictionary(locale); const ar=locale==="ar"; return <><PageHero eyebrow={d.how.eyebrow} title={d.how.title} intro={d.how.intro} /><section className="section"><ol className="container-site relative space-y-0 before:absolute before:bottom-10 before:start-[1.1rem] before:top-10 before:w-px before:bg-brand-200 md:before:start-[1.35rem]">{d.how.steps.map((step, i) => <li className="relative grid grid-cols-[2.25rem_1fr] gap-5 pb-9 md:grid-cols-[2.75rem_1fr] md:gap-7" key={step.title}><div className="relative z-10 grid h-9 w-9 place-items-center rounded-full border-4 border-white bg-brand-600 text-xs font-bold text-white md:h-11 md:w-11">{i+1}</div><div className="surface-muted p-6 md:p-8"><p className="eyebrow">{ar?`الخطوة ${i+1}`:`Step ${i+1}`}</p><h2 className="mt-2 text-2xl font-bold text-brand-900">{step.title}</h2><p className="mt-3 max-w-3xl leading-7 text-ink-600">{step.body}</p><p className="mt-5 flex items-center gap-2 text-sm font-semibold text-brand-700"><Check size={17}/>{ar?"سنوضح لك المطلوب قبل الانتقال للخطوة التالية":"We explain what is needed before the next step"}</p></div></li>)}</ol></section><CtaPanel locale={locale} title={d.home.finalTitle} body={d.home.finalBody} button={d.common.send} /></>; }

