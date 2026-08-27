import type { Locale } from "@/lib/i18n";
import { ArrowUpRight } from "lucide-react";
import { TrackedLink } from "./TrackedLink";

export function CtaPanel({ locale, title, body, button }: { locale: Locale; title: string; body: string; button: string }) {
  return <section className="section"><div className="container-site rounded-2xl bg-[#08263b] px-6 py-12 text-white md:px-12 md:py-16"><div className="grid items-end gap-8 md:grid-cols-[1fr_auto]"><div><h2 className="text-3xl font-bold tracking-[-.035em] md:text-5xl">{title}</h2><p className="mt-4 max-w-2xl text-lg leading-8 text-[#c5dae2]">{body}</p></div><TrackedLink event="send_case_cta_clicked" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-md bg-white px-5 font-bold text-[#08263b] hover:bg-[#dff3f3]" href={`/${locale}/send-my-case`}>{button}<ArrowUpRight size={18} /></TrackedLink></div></div></section>;
}

