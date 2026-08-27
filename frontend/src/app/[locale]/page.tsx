import type { Metadata } from "next";
import { ArrowUpRight, FileText, HeartPulse, Route, ShieldCheck, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { TrackedLink } from "@/components/TrackedLink";
import { CtaPanel } from "@/components/CtaPanel";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const d = getDictionary(locale); return pageMetadata(locale, "", d.home.title, d.home.intro); }

export default async function Home({ params }: Props) {
  const { locale } = await params; if (!isLocale(locale)) notFound(); const d = getDictionary(locale);
  const icons = [HeartPulse, ShieldCheck, Route];
  return <>
    <section className="relative overflow-hidden bg-[#f7fafb]"><div className="absolute inset-y-0 end-0 w-1/2 bg-[radial-gradient(circle_at_70%_45%,#cce9ea_0,transparent_48%)] opacity-75" aria-hidden="true" /><div className="container-site relative grid min-h-[670px] items-center py-20 lg:grid-cols-[1.15fr_.85fr]">
      <div><p className="eyebrow">{d.home.eyebrow}</p><h1 className="display mt-6 max-w-4xl">{d.home.title}</h1><p className="lead mt-7 max-w-2xl">{d.home.intro}</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><TrackedLink event="send_case_cta_clicked" className="btn-primary gap-2" href={`/${locale}/send-my-case`}>{d.common.send}<ArrowUpRight size={18} /></TrackedLink><TrackedLink event="whatsapp_clicked" target="_blank" className="btn-secondary" href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "201000000000"}?text=${encodeURIComponent("Hello RehletShifaa, I would like help reviewing a cardiac medical case.")}`}>{d.common.whatsapp}</TrackedLink></div><p className="mt-8 flex max-w-xl items-start gap-3 border-s-2 border-[#168a86] ps-4 font-semibold leading-7 text-[#274a5e]"><ShieldCheck className="mt-1 shrink-0 text-[#168a86]" size={20} />{d.home.reassurance}</p></div>
      <div className="mt-14 hidden justify-end lg:flex" aria-hidden="true"><div className="relative h-[390px] w-[330px] rounded-[2rem] border border-[#c5dbe2] bg-white/65 p-7 shadow-[0_30px_80px_rgba(8,38,59,.08)]"><div className="h-full rounded-2xl bg-[#08263b] p-7 text-white"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#168a86]"><HeartPulse /></div><p className="mt-20 text-sm font-semibold uppercase tracking-[.16em] text-[#85c9c6]">RehletShifaa</p><p className="mt-3 text-3xl font-bold leading-tight">{d.common.tagline}</p><div className="absolute -start-14 bottom-12 rounded-xl border border-[#d9e4e9] bg-white p-4 text-[#08263b] shadow-lg"><p className="text-xs uppercase tracking-wider text-[#168a86]">01</p><p className="mt-1 font-bold">{d.home.steps[0]}</p></div></div></div></div>
    </div></section>
    <section className="section"><div className="container-site"><p className="eyebrow">{d.home.areasEyebrow}</p><div className="mt-4 flex flex-col justify-between gap-5 md:flex-row md:items-end"><h2 className="headline max-w-3xl">{d.home.areasTitle}</h2><TrackedLink event="send_case_cta_clicked" className="font-bold text-[#176b92]" href={`/${locale}/cardiology`}>{d.common.explore} →</TrackedLink></div><div className="mt-12 grid gap-5 md:grid-cols-3">{d.home.areas.map((area, i) => { const Icon = icons[i]; return <article className="card p-7" key={area.title}><Icon className="text-[#168a86]" size={28} strokeWidth={1.7} /><h3 className="mt-8 text-xl font-bold leading-7 text-[#08263b]">{area.title}</h3><p className="mt-4 leading-7 text-[#5c7180]">{area.body}</p></article>; })}</div></div></section>
    <section className="section section-soft"><div className="container-site"><p className="eyebrow">{d.home.howEyebrow}</p><h2 className="headline mt-4">{d.home.howTitle}</h2><ol className="mt-12 grid gap-4 md:grid-cols-5">{d.home.steps.map((step, i) => <li className="relative border-t border-[#9ab8c4] pt-5" key={step}><span className="text-sm font-extrabold text-[#168a86]">0{i + 1}</span><p className="mt-3 font-bold leading-6 text-[#08263b]">{step}</p></li>)}</ol></div></section>
    <section className="section"><div className="container-site grid gap-6 md:grid-cols-2"><article className="card p-8 md:p-11"><UserRound className="text-[#168a86]" /><h2 className="mt-8 text-3xl font-bold tracking-[-.035em] text-[#08263b]">{d.home.coordinatorTitle}</h2><p className="lead mt-5">{d.home.coordinatorBody}</p><TrackedLink event="whatsapp_clicked" className="mt-7 inline-block font-bold text-[#176b92]" target="_blank" href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "201000000000"}`}>{d.common.whatsapp} →</TrackedLink></article><article className="card bg-[#f4f8fa] p-8 md:p-11"><FileText className="text-[#168a86]" /><h2 className="mt-8 text-3xl font-bold tracking-[-.035em] text-[#08263b]">{d.home.beforeTitle}</h2><p className="lead mt-5">{d.home.beforeBody}</p></article></div></section>
    <CtaPanel locale={locale} title={d.home.finalTitle} body={d.home.finalBody} button={d.common.send} />
  </>;
}

