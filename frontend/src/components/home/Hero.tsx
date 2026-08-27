import { ArrowRight, Check, MessageCircle } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { GuidedArc } from "@/components/Logo";
import { TrackedLink } from "@/components/TrackedLink";

export function Hero({ locale, d }: { locale: Locale; d: Dictionary }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-mist">
      {/* Soft healing washes — decorative, kept subtle and out of the a11y tree. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 hidden w-3/5 opacity-90 md:block"
        style={{
          backgroundImage:
            "radial-gradient(circle at 78% 26%, var(--color-wash-aqua) 0, transparent 46%), radial-gradient(circle at 58% 82%, var(--color-wash-lavender) 0, transparent 42%), radial-gradient(circle at 94% 64%, var(--color-wash-peach) 0, transparent 38%)",
        }}
      />
      <div className="container-site relative grid gap-12 py-14 md:py-18 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-16 lg:py-24">
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

        <aside className="overflow-hidden rounded-2xl border border-brand-200 bg-brand-100 p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-brand-200 bg-white">
              <GuidedArc size={24} />
            </span>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-accent-700 rtl:tracking-normal">
              {d.home.heroCardTitle}
            </p>
          </div>
          <p className="mt-5 text-lg leading-7 text-ink-700">{d.home.reassurance}</p>

          <ol className="mt-6 space-y-px">
            {d.home.steps.map((step, index) => (
              <li
                key={step}
                className={`flex items-center gap-4 py-3.5 ${index > 0 ? "border-t border-brand-200" : ""}`}
              >
                <span className="w-6 shrink-0 text-sm font-bold tabular-nums text-brand-700">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-[0.95rem] font-semibold leading-6 text-ink-800">{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-6 border-t border-brand-200 pt-5 text-sm leading-6 text-ink-600">
            {d.home.heroCardNote}
          </p>
          <Link
            href={localeHref(locale, "how-it-works")}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 underline-offset-4 hover:underline"
          >
            {d.nav.how}
            <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
          </Link>
        </aside>
      </div>
    </section>
  );
}
