import { ArrowRight } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";
import { JourneyLine } from "./JourneyConnector";
import { JourneyVideo } from "./JourneyVideo";

/**
 * The process as one care journey: four numbered moments joined by the flowing connector, and beside
 * them the one film, always as a composed poster (play, "Watch how it works", duration) that opens the
 * player in a lightbox — never a raw native player idling on the page. Desktop: journey left, poster
 * right (≈44% of the section); phone and tablet: the journey, then the poster, then the one action.
 */
export function JourneyFilm({ d, locale }: { d: Dictionary; locale: Locale }) {
  const v = d.home.video;
  const steps = v.steps;
  const last = steps.length - 1;
  const arabic = locale === "ar";
  const source = arabic ? "/media/rehletshifaa-journey-ar.mp4?v=5" : "/media/rehletshifaa-journey-en.mp4?v=3";
  // The film's own case-review scene, so the poster reads as the process and not as the hero still again.
  const poster = "/media/rehletshifaa-journey-scene-review.jpg";

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-surface-pearl pb-[clamp(2rem,1.5rem+1.6vw,3.25rem)] pt-[clamp(2.5rem,2rem+2vw,4.25rem)]">
      <div className="container-site">
        <div className="max-w-2xl">
          <p className="eyebrow">{d.home.howEyebrow}</p>
          <h2 className="headline mt-2">{d.home.howTitle}</h2>
          <p className="lead mt-2.5 sm:mt-3">{d.home.howIntro}</p>
        </div>

        <div className="mt-7 grid gap-8 sm:mt-9 lg:mt-10 lg:grid-cols-[minmax(0,56fr)_minmax(0,44fr)] lg:items-center lg:gap-16">
          <ol className="relative">
            {steps.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0 sm:gap-5 lg:pb-7">
                {/* The connector flows from this marker to the next. */}
                {index < last && (
                  <JourneyLine className="absolute start-[4px] top-9 h-[calc(100%-2.25rem)] w-6 rtl:-scale-x-100 sm:start-[6px] sm:w-7" />
                )}
                <span aria-hidden className="journey-marker relative z-[1] flex-none sm:h-9 sm:w-9 sm:text-[0.8rem]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 pt-1">
                  <h3 className="text-[1.0625rem] font-semibold leading-6 text-brand-900 min-[360px]:text-[1.125rem] lg:text-[1.25rem] lg:leading-7">{step.title}</h3>
                  <p className="mt-1 max-w-[46ch] text-[0.95rem] leading-6 text-ink-600 lg:text-[1rem] lg:leading-7">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="w-full sm:mx-auto sm:max-w-[620px] lg:mx-0 lg:max-w-none">
            <JourneyVideo src={source} poster={poster} label={v.label} watch={v.watch} duration={v.duration} dialogTitle={v.dialogTitle} close={v.close} />
          </div>
        </div>

        {/* The conversion point after the journey. Hidden where the header already carries the action. */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-border-subtle pt-4 sm:mt-8 sm:pt-5 lg:hidden">
          <p className="text-[0.95rem] font-semibold text-brand-900">{d.home.howReady}</p>
          <TrackedLink event="send_case_cta_clicked" className="btn-primary" href={localeHref(locale, "send-my-case")}>
            {d.home.primaryAction}
            <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
