import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileUp, UserRoundCheck } from "lucide-react";

import { TrackedLink } from "@/components/TrackedLink";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

const STEP_ICONS = [FileUp, ClipboardCheck, UserRoundCheck] as const;

/**
 * The page's closing answer to "which one is mine?": the patient does not have to choose. What routing involves is
 * said in three short, unnumbered lines (the one numbered journey, four stages, lives on How it works, linked here),
 * with one quiet text link to the case form. The header already carries the primary action, so the page body does not
 * repeat it as a button.
 */
export function CaseRouter({ locale, copy, button }: {
  locale: Locale;
  copy: { eyebrow: string; title: string; body: string; note: string; howLink: string; steps: readonly { title: string; body: string }[] };
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

        <div className="rounded-lg border border-border-clinical bg-surface-default p-6 sm:p-8">
          <ul className="grid gap-6 md:grid-cols-3">
            {copy.steps.map((step, index) => {
              const Icon = STEP_ICONS[index] ?? FileUp;
              return (
                <li key={step.title} className="flex gap-4 md:flex-col">
                  <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface-default text-brand-800 ring-[1.75px] ring-brand-600">
                    <Icon size={19} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3 className="text-[1.0625rem] font-semibold leading-snug text-brand-900">{step.title}</h3>
                    <p className="mt-1 text-[0.9375rem] leading-6 text-ink-600">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link className="mt-6 inline-flex min-h-11 items-center gap-1.5 border-t border-border-subtle pt-4 text-[0.9375rem] font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current md:w-full" href={localeHref(locale, "how-it-works")}>
            {copy.howLink}
            <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
    </section>
  );
}
