import { ArrowRight, HandHeart, HeartPulse, Languages, Stethoscope, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { CaseStory } from "@/components/home/story/CaseStory";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * The opening screen carries one claim, one action and the product itself: one example case told in five scenes that
 * follow How It Works (CaseStory), each opening on a moment from the patient film, so the visitor sees what happens to
 * their file, who reads it and what comes back before they send anything.
 * The five promises close the text column, so it ends level with the card.
 */
export function Hero({ locale, d }: { locale: Locale; d: Dictionary }) {
  const arabic = locale === "ar";

  const trust = arabic
    ? [[Stethoscope, "مراجعة بقيادة استشاري"], [UserRoundCheck, "منسّق واحد طوال الرحلة"], [HeartPulse, "متابعة بعد عودتك"], [Languages, "بالعربية والإنجليزية"], [HandHeart, "لا التزام عند البدء"]] as const
    : [[Stethoscope, "Consultant-led review"], [UserRoundCheck, "One coordinator throughout"], [HeartPulse, "Follow-up after you return"], [Languages, "Arabic & English"], [HandHeart, "No commitment to start"]] as const;

  return (
    <section className="home-hero bg-surface-pearl">
      <div className="container-site grid gap-8 py-8 sm:gap-9 sm:py-10 lg:grid-cols-[minmax(0,53fr)_minmax(0,47fr)] lg:items-stretch lg:gap-16 lg:py-16">
        {/* As tall as the story card: the eyebrow sits level with its step bar and the promises end level with its foot. */}
        <div className="max-w-[34rem] lg:flex lg:flex-col lg:justify-between">
          {/* Four groups — the claim, the actions, the statement, the promises — spaced evenly down the card's height. */}
          <div>
          <p className="flex items-start gap-2 text-[0.9375rem] font-semibold leading-6 text-brand-700">
            {/* Aligned to the first line, so a label that wraps on a phone keeps its dot at the start of the text. */}
            <span aria-hidden className="mt-[0.5625rem] h-1.5 w-1.5 flex-none rounded-full bg-brand-400" />
            {d.home.eyebrow}
          </p>
          <h1 className="display home-title mt-2.5 [text-wrap:balance] sm:mt-3"><HeroTitle title={d.home.title} accent={d.home.titleAccent} /></h1>
          <p className="lead mt-4 max-w-[52ch] sm:mt-5">{d.home.intro}</p>
          </div>

          {/* On a phone the secondary action is a quiet link beside the button — one primary control, one row. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-7 lg:mt-0">
            <TrackedLink event="send_case_cta_clicked" className="btn-primary" href={localeHref(locale, "send-my-case")}>
              {d.home.primaryAction}
              <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
            <Link className="link-cta text-[0.9375rem] sm:hidden" href="#how-it-works">{d.home.watchJourney}</Link>
            <Link className="btn-secondary hidden sm:inline-flex" href="#how-it-works">{d.home.watchJourney}</Link>
          </div>

          <div className="mt-7 border-s-[3px] border-brand-400 ps-4 sm:mt-8 lg:mt-0">
            <p className="text-[1.0625rem] font-semibold leading-7 text-brand-900 [text-wrap:balance]">{d.home.slogan}</p>
            <p className="mt-1 max-w-[56ch] text-[0.875rem] leading-6 text-ink-500">{d.home.preliminaryNotice}</p>
          </div>

          {/* The five promises, closing the column on a hairline (they were a full-width band below the hero). */}
          <ul className="home-hero-promises mt-7 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-line pt-5 sm:mt-8 lg:mt-0">
            {trust.map(([Icon, label]) => (
              <li key={label} className="flex items-center gap-2.5 text-[0.875rem] font-semibold leading-5 text-ink-700 last:col-span-2">
                <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-default text-brand-600 ring-1 ring-line">
                  <Icon size={15} strokeWidth={1.9} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* The picture is the product: one example case, from the first file to follow-up at home. */}
        <CaseStory locale={locale} d={d} />
      </div>

    </section>
  );
}

/**
 * The promise's turn — "before you travel" — in petrol, underlined once by hand with the journey line in coral (the
 * coral is a mark, never the text). Without motion the line is simply there.
 */
function HeroTitle({ title, accent }: { title: string; accent: string }) {
  const at = title.lastIndexOf(accent);
  if (!accent || at < 0) return title;
  return (
    <>
      {title.slice(0, at)}
      <span className="home-title-accent">
        {accent}
        <svg aria-hidden focusable="false" className="home-title-line" viewBox="0 0 200 12" preserveAspectRatio="none">
          <path d="M2 8C50 2.5 120 11.5 198 4.5" pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
      {title.slice(at + accent.length)}
    </>
  );
}
