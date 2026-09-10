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
        <div className="on-dark overflow-hidden rounded-[14px] bg-brand-600 px-6 py-8 text-white sm:px-9 md:px-10 md:py-9">
          <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h2 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] rtl:tracking-normal rtl:leading-snug md:text-[1.8rem]">
                {title}
              </h2>
              <p className="mt-2.5 max-w-xl text-[0.98rem] leading-7 text-white">{body}</p>
              {note ? <p className="mt-2.5 text-[0.83rem] leading-6 text-white/90">{note}</p> : null}
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
