import { ArrowRight, Activity, Bone, HeartPulse } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { CARE_AREA_SLUGS } from "@/lib/care-areas";
import { localeHref } from "@/lib/links";
import { SectionHeader } from "@/components/SectionHeader";
import { TrackedLink } from "@/components/TrackedLink";

const ICONS = [HeartPulse, Activity, Bone] as const;
// Soft section washes from the brand handoff — one per care area.
const WASHES = ["bg-wash-aqua", "bg-wash-sky", "bg-wash-peach"] as const;

export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  return (
    <section className="section">
      <div className="container-site">
        <SectionHeader
          eyebrow={d.home.areasEyebrow}
          title={d.home.areasTitle}
          intro={d.home.areasIntro}
          action={
            <TrackedLink
              event="send_case_cta_clicked"
              className="link-cta"
              href={localeHref(locale, "care-areas")}
            >
              {d.common.explore}
              <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
          }
        />

        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {d.home.areas.map((area, index) => {
            const Icon = ICONS[index] ?? HeartPulse;
            const wash = WASHES[index] ?? WASHES[0];
            const href = localeHref(locale, CARE_AREA_SLUGS[index]);
            return (
              <li key={area.title} className={`flex flex-col rounded-[0.875rem] p-6 sm:p-7 ${wash}`}>
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/70 text-accent-700">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="title mt-5">{area.title}</h3>
                <p className="mt-3 text-[0.95rem] leading-7 text-ink-600">{area.body}</p>
                <Link href={href} className="link-cta mt-auto pt-6">
                  {d.home.areasAction}
                  <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
