import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { CaseForm } from "@/components/CaseForm";
import { TrackedLink } from "@/components/TrackedLink";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const d = getDictionary(locale); return pageMetadata(locale, "send-my-case", d.form.title, d.form.intro); }
export default async function SendMyCase({ params }: Props) { const { locale } = await params; if (!isLocale(locale)) notFound(); const d = getDictionary(locale); const whatsapp = `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "201000000000"}?text=${encodeURIComponent("Hello RehletShifaa, I would like help reviewing a cardiac medical case.")}`; return <><PageHero eyebrow={d.form.eyebrow} title={d.form.title} intro={d.form.intro} /><section className="section section-soft"><div className="container-site grid items-start gap-7 lg:grid-cols-[1fr_340px]"><CaseForm locale={locale} d={d} /><aside className="card p-6 lg:sticky lg:top-6"><MessageCircle className="text-accent-700" /><h2 className="mt-5 text-xl font-bold text-brand-900">{d.common.whatsapp}</h2><p className="mt-3 text-sm leading-6 text-ink-500">{d.home.coordinatorBody}</p><TrackedLink event="whatsapp_clicked" className="btn-secondary mt-6 w-full" target="_blank" href={whatsapp}>{d.common.whatsapp}</TrackedLink></aside></div></section></>; }

