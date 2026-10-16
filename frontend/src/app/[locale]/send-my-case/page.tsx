import type { Metadata } from "next";
import { Clock, HandHeart, MessageCircle } from "lucide-react";
import { notFound } from "next/navigation";
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
  // One paper sheet from the title to the form: the heading introduces the form instead of standing in a band of its
  // own, and the promise is set as a hairline ledger in the aside's column, so the two columns start on one grid.
  return (
    <section className="intake-page border-b border-line bg-surface-pearl">
      <div className="container-site pb-12 pt-7 md:pb-16 md:pt-9">
        <div className="grid gap-x-7 gap-y-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div>
            <p className="eyebrow">{d.form.eyebrow}</p>
            <h1 className="display mt-3 max-w-[22ch] rtl:max-w-[30ch] [text-wrap:balance]">{d.form.title}</h1>
            <p className="lead mt-3 max-w-[58ch]">{d.form.intro}</p>
          </div>
          <ul className="intake-promise m-0 grid list-none gap-0 border-b border-line p-0 sm:grid-cols-3 lg:grid-cols-1" aria-label={d.form.promise.label}>
            {promise.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-3 border-t border-line py-2 text-[0.9375rem] font-semibold leading-6 text-ink-700 sm:py-2.5 sm:pe-4 lg:py-1.5 lg:pe-0">
                <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-md bg-mist-deep text-brand-700 sm:h-9 sm:w-9">
                  <Icon size={17} strokeWidth={1.9} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 grid items-start gap-7 md:mt-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <CaseForm locale={locale} d={d} />
          <NextStepsAside locale={locale} d={d} />
        </div>
      </div>
    </section>
  );
}
