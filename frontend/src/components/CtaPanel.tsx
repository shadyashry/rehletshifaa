import { ArrowRight } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "./TrackedLink";

/**
 * The closing call to action: the page's single saturated surface, in deep teal, no ornament. Title and
 * one line on one side, the action on the other, the no-commitment note beneath — and no more height than
 * the two lines it needs. A confident continuation of the page, not a banner.
 */
export function CtaPanel({
  locale,
  title,
  body,
  button,
  note,
  variant = "teal",
}: {
  locale: Locale;
  title: string;
  body: string;
  button: string;
  note?: string;
  /** "quiet": for selection pages where a saturated slab would outweigh the content — a warm pearl surface instead. */
  variant?: "teal" | "quiet";
}) {
  if (variant === "quiet") {
    return (
      <section className="bg-surface-pearl pb-14 pt-12 md:pb-16 md:pt-14">
        <div className="container-site">
          <div className="grid items-center gap-5 rounded-[14px] border border-sand-200 bg-surface-warm px-6 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10 md:px-9 md:py-7">
            <div>
              <h2 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 rtl:leading-snug rtl:tracking-normal sm:text-[1.5rem]">{title}</h2>
              <p className="mt-1.5 max-w-[52ch] text-[0.95rem] leading-6 text-ink-600 sm:text-[1rem] sm:leading-7">{body}</p>
            </div>
            <TrackedLink event="send_case_cta_clicked" className="btn-primary w-full md:w-auto" href={localeHref(locale, "send-my-case")}>
              {button}
              <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-tight bg-surface-pearl">
      <div className="container-site">
        <div className="on-dark rounded-[14px] bg-brand-700 px-5 py-5 text-white sm:px-8 sm:py-6 lg:px-10 lg:py-6">
          <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10">
            <div>
              <h2 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] rtl:leading-snug rtl:tracking-normal sm:text-[1.5rem] lg:text-[1.75rem]">
                {title}
              </h2>
              <p className="mt-1.5 max-w-xl text-[0.95rem] leading-6 text-white sm:text-[1rem] sm:leading-7">{body}</p>
            </div>
            <div className="md:text-end">
              <TrackedLink event="send_case_cta_clicked" className="btn-inverse w-full md:w-auto" href={localeHref(locale, "send-my-case")}>
                {button}
                <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
              </TrackedLink>
              {note ? <p className="mt-2 text-[0.875rem] leading-5 text-sand-100 md:max-w-[30ch]">{note}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
