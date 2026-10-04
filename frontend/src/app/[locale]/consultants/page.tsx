import type { Metadata } from "next";
import { ArrowRight, GraduationCap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsultantDirectory } from "@/components/ConsultantDirectory";
import { CtaPanel } from "@/components/CtaPanel";
import { consultantUi, getConsultants } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "consultants", consultantUi[locale].pageTitle, consultantUi[locale].pageIntro);
}
export default async function Consultants({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const doctors = getConsultants(locale);
  const ar = locale === "ar";
  const areaCount = new Set(doctors.map(p => p.careAreaHref)).size;
  return <>
    <section className="relative overflow-hidden border-b border-brand-800 bg-brand-900 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full border-[48px] border-white/5" />
      <div className="container-site relative grid gap-10 py-14 md:py-20 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">{ar ? "فريقنا الطبي" : "Our medical team"}</p><h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{ar ? "خبرة تخصصية.\nرعاية تتمحور حولك." : "Specialist expertise.\nCare centred on you."}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-white/85">{ar ? "تعرّف على الأطباء وخبراتهم السريرية وإسهاماتهم الأكاديمية. نوجّه حالتك إلى التخصص المناسب وفق احتياجك الطبي." : "Meet the doctors, explore their clinical focus and discover their academic contributions. Your case is matched to the appropriate expertise according to clinical need."}</p><div className="mt-8 flex flex-wrap items-center gap-5"><a href="#doctor-directory" className="inline-flex min-h-12 items-center gap-3 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-brand-900">{ar ? "استكشف الفريق" : "Explore the team"}<ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" /></a><Link href={localeHref(locale, "send-my-case")} className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-white underline underline-offset-4">{ar ? "أرسل حالتك للمراجعة" : "Start your case review"}</Link></div></div>
        <div className="rounded-2xl border border-white/20 bg-white/5 p-7"><GraduationCap size={30} aria-hidden="true" className="text-white/80" /><p className="mt-4 text-lg font-semibold">{ar ? "خبرات متعددة. مسار رعاية واحد." : "Many disciplines. One care journey."}</p><dl className="mt-6 grid grid-cols-2 gap-6 border-t border-white/20 pt-6"><div><dt className="text-sm text-white/75">{ar ? "الأطباء" : "Doctors"}</dt><dd className="mt-2 text-4xl font-semibold">{doctors.length}</dd></div><div><dt className="text-sm text-white/75">{ar ? "مجالات الرعاية" : "Care areas"}</dt><dd className="mt-2 text-4xl font-semibold">{areaCount}</dd></div></dl><p className="mt-6 text-sm leading-6 text-white/80">{ar ? "لا تحتاج إلى اختيار طبيب قبل البدء؛ يعتمد التوجيه على احتياج حالتك." : "You don’t need to choose a doctor before you start. Clinical matching follows your case needs."}</p></div>
      </div>
    </section>
    <ConsultantDirectory profiles={doctors} locale={locale} />
    <div className="container-site py-8"><p className="max-w-4xl text-sm leading-6 text-ink-600">{ar ? "تستند الملفات إلى السير الذاتية المقدمة والمصادر المحددة في كل ملف. إبراز المؤهلات لا يمثل تصنيفاً للأطباء أو ضماناً للنتائج. تخضع المؤهلات للتدقيق قبل التوجيه السريري." : "Profiles draw on supplied CVs and the sources identified on each profile. Featured credentials do not represent a doctor ranking or an outcome guarantee. Credentials are reviewed before clinical matching."}</p></div>
    <CtaPanel locale={locale} title={d.consultants.finalTitle} body={d.consultants.finalBody} button={d.common.send} />
  </>;
}
