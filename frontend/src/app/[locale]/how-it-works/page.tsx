import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CtaPanel } from "@/components/CtaPanel";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const d = getDictionary(locale); return pageMetadata(locale, "how-it-works", d.how.title, d.how.intro); }
export default async function HowItWorks({ params }: Props) { const { locale } = await params; if (!isLocale(locale)) notFound(); const d = getDictionary(locale); return <><PageHero eyebrow={d.how.eyebrow} title={d.how.title} intro={d.how.intro} /><section className="section"><ol className="container-site relative space-y-5">{d.how.steps.map((step, i) => <li className="card grid gap-5 p-6 md:grid-cols-[110px_1fr] md:p-9" key={step.title}><div className="text-4xl font-bold tracking-[-.06em] text-[#9cb5c0]">0{i + 1}</div><div><h2 className="text-2xl font-bold text-[#08263b]">{step.title}</h2><p className="mt-3 max-w-3xl leading-7 text-[#5c7180]">{step.body}</p></div></li>)}</ol></section><CtaPanel locale={locale} title={d.home.finalTitle} body={d.home.finalBody} button={d.common.send} /></>; }

