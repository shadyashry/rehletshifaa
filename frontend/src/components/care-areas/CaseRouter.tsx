import { ArrowRight, ClipboardCheck, FileUp, UserRoundCheck } from "lucide-react";

import { JourneyLine } from "@/components/home/JourneyConnector";
import { TrackedLink } from "@/components/TrackedLink";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

const STEP_ICONS = [FileUp, ClipboardCheck, UserRoundCheck] as const;

/**
 * The page's closing answer to "which one is mine?": the patient does not have to choose. Three moments
 * joined by the care-journey line — outlined markers, one filled anchor at the matched Consultant — and one
 * quiet text link to the case form. The header already carries the primary action, so the page body does not
 * repeat it as a button.
 */
export function CaseRouter({ locale, copy, button }: {
  locale: Locale;
  copy: { eyebrow: string; title: string; body: string; note: string; steps: readonly { title: string; body: string }[] };
  button: string;
}) {
  return (
    <section aria-labelledby="case-router-title" className="canvas-clinical py-16 md:py-20">
      <div className="container-site grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="case-router-title" className="mt-3 max-w-[20ch] text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.125rem]">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-[48ch] text-[1rem] leading-7 text-ink-600">{copy.body}</p>
          <div className="mt-6">
            <TrackedLink event="send_case_cta_clicked" className="link-cta text-[1rem]" href={localeHref(locale, "send-my-case")}>
              {button}
              <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
            <p className="mt-1 text-[0.875rem] leading-5 text-ink-500">{copy.note}</p>
          </div>
        </div>

        <ol className="relative grid gap-8 rounded-lg border border-border-clinical bg-surface-default p-6 sm:p-8 md:grid-cols-3 md:gap-6">
          <div aria-hidden className="absolute end-[calc(16.67%+0.5rem)] start-[calc(16.67%+0.5rem)] top-[3.375rem] hidden h-6 -translate-y-1/2 md:block"><JourneyLine orientation="horizontal" className="h-full w-full" /></div>
          {copy.steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? FileUp;
            const last = index === copy.steps.length - 1;
            return (
              <li key={step.title} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
                {last ? null : (
                  <div aria-hidden className="absolute -bottom-8 start-[1.375rem] top-11 w-6 -translate-x-1/2 rtl:translate-x-1/2 md:hidden"><JourneyLine className="h-full w-full" /></div>
                )}
                <span
                  aria-hidden
                  className={`relative grid h-11 w-11 flex-none place-items-center rounded-full ${last ? "bg-brand-700 text-white ring-4 ring-brand-100" : "bg-surface-default text-brand-800 ring-[1.75px] ring-brand-600"}`}
                >
                  <Icon size={19} strokeWidth={1.7} />
                </span>
                <div>
                  <p className="text-[0.8125rem] font-semibold tabular-nums tracking-[0.08em] text-brand-600 rtl:tracking-normal">0{index + 1}</p>
                  <h3 className="mt-0.5 text-[1.0625rem] font-semibold leading-snug text-brand-900">{step.title}</h3>
                  <p className="mt-1 text-[0.9375rem] leading-6 text-ink-600 md:max-w-[22ch] md:mx-auto">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
