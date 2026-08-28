import { ArrowRight, Check, FileText, Image, MessageSquareText, PlayCircle } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

const PREP_ICONS = [FileText, Image, MessageSquareText] as const;

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
          <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-brand-700">{d.home.slogan}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-primary"
              href={localeHref(locale, "send-my-case")}
            >
              {d.home.primaryAction}
              <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
            <Link
              className="btn-secondary"
              href="#journey-video"
            >
              <PlayCircle size={18} aria-hidden="true" />
              {d.home.watchJourney}
            </Link>
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

        <aside className="overflow-hidden rounded-3xl border border-brand-200 bg-white/85 p-7 shadow-[0_24px_70px_-44px_rgba(41,69,77,.38)] backdrop-blur sm:p-9">
          <p className="eyebrow">{d.home.heroCardTitle}</p>
          <p className="mt-4 text-lg font-semibold leading-7 text-brand-900">{d.home.reassurance}</p>

          <ul className="mt-7 grid gap-3">
            {d.home.prepareItems.map((item, index) => {
              const Icon = PREP_ICONS[index] ?? FileText;
              return (
                <li key={item} className="grid grid-cols-[2.75rem_1fr] items-center gap-3 rounded-2xl bg-brand-50 p-4">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-brand-700">
                    <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="text-[0.95rem] font-semibold leading-6 text-ink-700">{item}</span>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 border-t border-line pt-5 text-sm leading-6 text-ink-600">{d.home.heroCardNote}</p>
        </aside>
      </div>
    </section>
  );
}
