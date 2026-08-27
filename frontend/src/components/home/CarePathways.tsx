import { ArrowRight, Activity, HeartPulse, Stethoscope } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { SectionHeader } from "@/components/SectionHeader";
import { TrackedLink } from "@/components/TrackedLink";

const ICONS = [Stethoscope, HeartPulse, Activity] as const;

export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  return (
    <section className="section">
      <div className="container-site">
        <SectionHeader
          eyebrow={d.home.areasEyebrow}
          title={d.home.areasTitle}
          action={
            <TrackedLink
              event="send_case_cta_clicked"
              className="link-cta"
              href={localeHref(locale, "cardiology")}
            >
              {d.common.explore}
              <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
          }
        />

        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {d.home.areas.map((area, index) => {
            const Icon = ICONS[index] ?? Stethoscope;
            return (
              <li key={area.title} className="card flex flex-col p-6 sm:p-7">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent-50 text-accent-700">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="title mt-5">{area.title}</h3>
                <p className="mt-3 text-[0.95rem] leading-7 text-ink-500">{area.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
