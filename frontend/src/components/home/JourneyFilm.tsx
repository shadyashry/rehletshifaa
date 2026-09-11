import { ArrowRight } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * The process as a journey rather than a specification. One numbered marker per step — the number is
 * the marker, not a decoration beside it — and a single rule that links them: vertical on a phone, where
 * the four steps sit in one screen with a thumb-height gap between them; a 2×2 grid on a tablet; a
 * horizontal rule on a desktop. The section closes with the one thing to do once the process is
 * understood, on the widths where the header's own action is not on screen.
 */
export function JourneyFilm({ d, locale }: { d: Dictionary; locale: Locale }) {
  const steps = d.home.video.steps;
  const last = steps.length - 1;

  return (
    <section id="how-it-works" className="section scroll-mt-20 border-b border-line bg-white">
      <div className="container-site">
        <div className="max-w-2xl">
          <p className="eyebrow">{d.home.howEyebrow}</p>
          <h2 className="headline mt-1.5 sm:mt-2">{d.home.howTitle}</h2>
          <p className="lead mt-2 sm:mt-3">{d.home.howIntro}</p>
        </div>

        <ol className="mt-6 sm:mt-8 sm:grid sm:grid-cols-2 sm:gap-x-8 sm:gap-y-7 lg:mt-9 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-0">
          {steps.map((step, index) => (
            <li key={step.title} className="relative flex gap-3.5 pb-6 last:pb-0 sm:block sm:pb-0 lg:pe-6">
              {/* Phone: the rule runs from this marker down to the next one. */}
              {index < last && (
                <span aria-hidden className="absolute bottom-0 start-[15.5px] top-8 w-px bg-line-strong sm:hidden" />
              )}
              {/* Desktop: the rule runs across, behind the markers, and stops at the last one. */}
              {index < last && (
                <span aria-hidden className="absolute inset-x-0 top-[15px] hidden h-px bg-line-strong lg:block" />
              )}
              <span
                aria-hidden
                className="relative z-[1] grid h-8 w-8 flex-none place-items-center rounded-full bg-white text-[0.78rem] font-bold tabular-nums text-brand-800 ring-[1.5px] ring-inset ring-brand-600"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 sm:mt-3.5">
                <h3 className="text-[1.0625rem] font-semibold leading-6 text-brand-900 min-[360px]:text-[1.125rem] sm:text-[1.02rem]">{step.title}</h3>
                <p className="mt-1.5 text-[0.95rem] leading-6 text-ink-600 sm:max-w-[30ch] sm:text-[0.9rem]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* The conversion point after the journey. Hidden where the header already carries the action. */}
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4 sm:mt-7 sm:flex-row sm:items-center sm:gap-5 sm:pt-5 lg:hidden">
          <p className="text-[0.95rem] font-semibold text-brand-900">{d.home.howReady}</p>
          <TrackedLink event="send_case_cta_clicked" className="btn-primary sm:ms-auto" href={localeHref(locale, "send-my-case")}>
            {d.home.primaryAction}
            <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
