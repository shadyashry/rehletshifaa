import { ArrowRight, Check, HandHeart, HeartPulse, Languages, Stethoscope, UserRoundCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * The opening screen carries one claim, one action and the page's one photograph: the guidance scene —
 * a patient listening while a Consultant walks him through his RehletShifaa report, the coordinator
 * present behind them. Patient and guidance, not doctor and treatment. The still is a native 7:5 frame,
 * shown whole on desktop; the tighter tablet/phone crops are anchored just below centre so both faces and
 * the report stay in view. The "start with what you have" note docks onto the photograph's lower edge so
 * the two read as one composed visual unit.
 * Below, the reassurance rail runs as one quiet line on the clinical mist — the hero's closing thought,
 * not a separate section.
 */
export function Hero({ locale, d }: { locale: Locale; d: Dictionary }) {
  const arabic = locale === "ar";
  const still = "/media/rehletshifaa-hero-consultation.jpg";
  const stillAlt = arabic
    ? "مريض يستمع إلى استشاري يشرح له تقريره الطبي بهدوء، ومنسّقة الرعاية حاضرة خلفهما"
    : "A patient listening as a Consultant calmly explains his medical report, with the care coordinator present";

  const trust = arabic
    ? [[Stethoscope, "مراجعة بقيادة استشاري"], [UserRoundCheck, "منسّق واحد طوال الرحلة"], [HeartPulse, "متابعة بعد عودتك"], [Languages, "بالعربية والإنجليزية"], [HandHeart, "لا التزام عند البدء"]] as const
    : [[Stethoscope, "Consultant-led review"], [UserRoundCheck, "One coordinator throughout"], [HeartPulse, "Follow-up after you return"], [Languages, "Arabic & English"], [HandHeart, "No commitment to start"]] as const;

  return (
    <section className="home-hero bg-surface-pearl">
      <div className="container-site grid gap-8 py-8 sm:gap-9 sm:py-10 lg:grid-cols-[minmax(0,53fr)_minmax(0,47fr)] lg:items-center lg:gap-16 lg:py-16">
        <div className="max-w-[34rem]">
          <p className="flex items-start gap-2 text-[0.9375rem] font-semibold leading-6 text-brand-700">
            {/* Aligned to the first line, so a label that wraps on a phone keeps its dot at the start of the text. */}
            <span aria-hidden className="mt-[0.5625rem] h-1.5 w-1.5 flex-none rounded-full bg-brand-400" />
            {d.home.eyebrow}
          </p>
          <h1 className="display mt-2.5 [text-wrap:balance] sm:mt-3">{d.home.title}</h1>
          <p className="lead mt-4 max-w-[52ch] sm:mt-5">{d.home.intro}</p>

          {/* On a phone the secondary action is a quiet link beside the button — one primary control, one row. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-7">
            <TrackedLink event="send_case_cta_clicked" className="btn-primary" href={localeHref(locale, "send-my-case")}>
              {d.home.primaryAction}
              <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
            <Link className="link-cta text-[0.9375rem] sm:hidden" href="#how-it-works">{d.home.watchJourney}</Link>
            <Link className="btn-secondary hidden sm:inline-flex" href="#how-it-works">{d.home.watchJourney}</Link>
          </div>

          <div className="mt-7 border-s-[3px] border-brand-400 ps-4 sm:mt-8">
            <p className="text-[1.0625rem] font-semibold leading-7 text-brand-900 [text-wrap:balance]">{d.home.slogan}</p>
            <p className="mt-1 max-w-[56ch] text-[0.875rem] leading-6 text-ink-500">{d.home.preliminaryNotice}</p>
          </div>
        </div>

        {/* One composed visual unit: the photograph, and the note docked onto its lower edge. */}
        <figure className="m-0 w-full">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[16px] border border-border-subtle bg-surface-clinical sm:aspect-[16/9] lg:aspect-[7/5]">
            <Image
              src={still}
              alt={stillAlt}
              fill
              priority
              unoptimized
              sizes="(min-width: 1024px) 560px, (min-width: 640px) 728px, 100vw"
              className="object-cover object-[50%_58%]"
            />
          </div>
          <figcaption className="home-hero-card relative z-[1] -mt-5 mx-4 rounded-[12px] border border-border-subtle bg-surface-elevated px-4 py-3.5 shadow-[0_10px_30px_-24px_rgba(28,51,58,0.35)] sm:mx-8 sm:px-5 sm:py-4 lg:mx-6">
            <p className="text-[0.875rem] font-semibold text-brand-900">{d.home.heroCardTitle}</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {d.home.prepareItems.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-[0.875rem] leading-6 text-ink-600">
                  <Check size={14} strokeWidth={2.4} className="flex-none text-accent-700" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[0.875rem] leading-5 text-ink-500">{d.home.reassurance}</p>
          </figcaption>
        </figure>
      </div>

      {/* The reassurance rail: one line of five, separated by hairlines, on the clinical mist. On phones the fifth
          promise (no commitment) closes the two-column grid on a line of its own. */}
      <div className="home-hero-rail border-y border-border-clinical bg-surface-clinical">
        <ul className="container-site grid grid-cols-2 gap-y-3.5 py-[1.125rem] lg:grid-cols-5 lg:divide-x lg:divide-border-clinical lg:py-0">
          {trust.map(([Icon, label]) => (
            <li key={label} className="flex items-center gap-2.5 text-[0.875rem] font-semibold leading-5 text-ink-700 last:col-span-2 lg:justify-center lg:px-2 lg:py-[1.125rem] lg:last:col-span-1">
              <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-elevated text-brand-600 ring-1 ring-border-clinical">
                <Icon size={15} strokeWidth={1.9} />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
