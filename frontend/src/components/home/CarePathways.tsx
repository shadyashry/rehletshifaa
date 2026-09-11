import { ArrowRight, Activity, Bone, HeartPulse } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { CARE_AREA_SLUGS } from "@/lib/care-areas";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

const ICONS = [HeartPulse, Activity, Bone] as const;

/**
 * Care areas as an editorial list rather than a rank of identical cards. On a phone all three are ruled
 * rows a thumb can scan in one screen — title, two lines, one tertiary action; from a desktop width the
 * first area leads on a tinted surface and the rest follow as rows. Every area stays one click away and
 * equally legible — only the visual weight differs, which is what keeps the section from reading as a
 * template.
 */
export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  const [lead, ...rest] = d.home.areas;
  const LeadIcon = ICONS[0];

  return (
    <section className="section bg-mist">
      <div className="container-site">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 sm:gap-y-3">
          <div className="max-w-xl">
            <p className="eyebrow">{d.home.areasEyebrow}</p>
            <h2 className="headline mt-1.5 sm:mt-2">{d.home.areasTitle}</h2>
          </div>
          <TrackedLink event="send_case_cta_clicked" className="link-cta text-[0.92rem]" href={localeHref(locale, "care-areas")}>
            {d.common.explore}
            <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>

        <div className="mt-5 sm:mt-7 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <div className="group relative border-t border-line py-4 lg:rounded-[14px] lg:border-0 lg:bg-white lg:p-7 lg:ring-1 lg:ring-line">
            <div className="flex items-start gap-3.5 lg:block">
              <LeadIcon size={20} strokeWidth={1.7} className="mt-0.5 flex-none text-brand-600 lg:mt-0 lg:h-[22px] lg:w-[22px]" aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="text-[1.05rem] font-semibold leading-6 text-brand-900 lg:mt-4 lg:text-[1.3rem] lg:leading-[1.4] lg:tracking-[-0.008em]">{lead.title}</h3>
                <p className="mt-1 text-[0.9rem] leading-6 text-ink-600 lg:mt-2 lg:max-w-[46ch] lg:text-[0.95rem] lg:leading-7">{lead.body}</p>
                <Link href={localeHref(locale, CARE_AREA_SLUGS[0])}
                      className="link-cta mt-1 min-h-0 text-[0.88rem] after:absolute after:inset-0 lg:mt-5 lg:min-h-11 lg:text-[0.9rem]">
                  {d.home.areasAction}
                  <ArrowRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </div>
            </div>
          </div>

          <ul className="grid content-start">
            {rest.map((area, index) => {
              const Icon = ICONS[index + 1] ?? HeartPulse;
              return (
                <li key={area.title} className="group relative border-t border-line py-4 last:border-b lg:py-5 lg:first:border-t-0 lg:first:pt-5 lg:last:border-b-0">
                  <div className="flex items-start gap-3.5">
                    <Icon size={20} strokeWidth={1.7} className="mt-0.5 flex-none text-brand-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="text-[1.05rem] font-semibold leading-6 text-brand-900">{area.title}</h3>
                      <p className="mt-1 text-[0.9rem] leading-6 text-ink-600 lg:mt-1.5">{area.body}</p>
                      <Link href={localeHref(locale, CARE_AREA_SLUGS[index + 1])}
                            className="link-cta mt-1 min-h-0 text-[0.88rem] after:absolute after:inset-0 lg:mt-2.5 lg:min-h-11">
                        {d.home.areasAction}
                        <ArrowRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
