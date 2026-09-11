import { ArrowRight } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "./TrackedLink";

export function CtaPanel({
  locale,
  title,
  body,
  button,
  note,
}: {
  locale: Locale;
  title: string;
  body: string;
  button: string;
  note?: string;
}) {
  return (
    <section className="section-tight">
      <div className="container-site">
        {/* Healing Teal is the one primary-action colour, so the closing call to
            action is the page's single saturated surface. */}
        <div className="on-dark overflow-hidden rounded-[14px] bg-brand-600 px-5 py-6 text-white sm:px-9 sm:py-8 md:px-10 md:py-9">
          <div className="grid items-center gap-5 sm:gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h2 className="text-[1.4rem] font-semibold leading-tight tracking-[-0.02em] rtl:tracking-normal rtl:leading-snug sm:text-[1.5rem] md:text-[1.8rem]">
                {title}
              </h2>
              <p className="mt-2 max-w-xl text-[0.95rem] leading-6 text-white sm:mt-2.5 sm:text-[0.98rem] sm:leading-7">{body}</p>
              {note ? <p className="mt-2 text-[0.875rem] leading-5 text-white/90 sm:mt-2.5 sm:text-[0.83rem] sm:leading-6">{note}</p> : null}
            </div>
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-inverse w-full md:w-auto"
              href={localeHref(locale, "send-my-case")}
            >
              {button}
              <ArrowRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
          </div>
        </div>
      </div>
    </section>
  );
}
