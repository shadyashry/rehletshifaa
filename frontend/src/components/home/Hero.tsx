import { ArrowRight, Check, MessageCircle } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { PulseLine } from "@/components/PulseLine";
import { TrackedLink } from "@/components/TrackedLink";

export function Hero({ locale, d }: { locale: Locale; d: Dictionary }) {
  return (
    <section className="border-b border-line bg-mist">
      <div className="container-site grid gap-12 py-14 md:py-18 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-16 lg:py-24">
        <div>
          <p className="eyebrow">{d.home.eyebrow}</p>
          <h1 className="display mt-4">{d.home.title}</h1>
          <p className="lead mt-5 max-w-xl">{d.home.intro}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-primary"
              href={localeHref(locale, "send-my-case")}
            >
              {d.common.send}
              <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
            <TrackedLink
              event="whatsapp_clicked"
              target="_blank"
              className="btn-secondary"
              href={whatsappHref(WHATSAPP_INTRO)}
            >
              <MessageCircle size={18} aria-hidden="true" />
              {d.common.whatsapp}
            </TrackedLink>
          </div>

          <ul className="mt-9 grid gap-3 border-t border-line-strong pt-7">
            {d.home.assurances.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[0.95rem] leading-6 text-ink-700">
                <Check size={17} className="mt-0.5 text-accent-700" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <aside className="on-dark overflow-hidden rounded-2xl bg-brand-900 p-7 text-white sm:p-9">
          <div>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-accent-200 rtl:tracking-normal">
              {d.home.heroCardTitle}
            </p>
            <p className="mt-4 text-lg leading-7 text-brand-100">{d.home.reassurance}</p>

            <PulseLine className="mt-6 h-7 w-full text-accent-500 opacity-70" />

            <ol className="mt-4 space-y-px">
              {d.home.steps.map((step, index) => (
                <li
                  key={step}
                  className={`flex items-center gap-4 py-3.5 ${index > 0 ? "border-t border-white/12" : ""}`}
                >
                  <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-accent-200">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[0.95rem] font-medium leading-6">{step}</span>
                </li>
              ))}
            </ol>

            <p className="mt-6 border-t border-white/12 pt-5 text-sm leading-6 text-brand-200">
              {d.home.heroCardNote}
            </p>
            <Link
              href={localeHref(locale, "how-it-works")}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-200 underline-offset-4 hover:underline"
            >
              {d.nav.how}
              <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
