import { ArrowRight, Activity, Bone, HeartPulse } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { CARE_AREA_SLUGS } from "@/lib/care-areas";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

const ICONS = [HeartPulse, Activity, Bone] as const;

/**
 * Care areas as an editorial list rather than a rank of identical cards: the first area leads on a tinted
 * surface, the rest follow as ruled rows. Every area stays one click away and equally legible — only the
 * visual weight differs, which is what keeps the section from reading as a template.
 */
export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  const [lead, ...rest] = d.home.areas;
  const LeadIcon = ICONS[0];

  return (
    <section className="section bg-mist">
      <div className="container-site">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="max-w-xl">
            <p className="eyebrow">{d.home.areasEyebrow}</p>
            <h2 className="headline mt-2">{d.home.areasTitle}</h2>
          </div>
          <TrackedLink event="send_case_cta_clicked" className="link-cta" href={localeHref(locale, "care-areas")}>
            {d.common.explore}
            <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>

        <div className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
          <div className="group relative rounded-[14px] bg-white p-6 ring-1 ring-line sm:p-7">
            <LeadIcon size={22} strokeWidth={1.7} className="text-brand-600" aria-hidden="true" />
            <h3 className="title mt-4">{lead.title}</h3>
            <p className="mt-2 max-w-[46ch] text-[0.95rem] leading-7 text-ink-600">{lead.body}</p>
            <Link href={localeHref(locale, CARE_AREA_SLUGS[0])}
                  className="link-cta mt-5 text-[0.9rem] after:absolute after:inset-0">
              {d.home.areasAction}
              <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </div>

          <ul className="grid content-start">
            {rest.map((area, index) => {
              const Icon = ICONS[index + 1] ?? HeartPulse;
              return (
                <li key={area.title} className="group relative border-b border-line py-5 first:border-t first:pt-0 last:border-b-0 lg:first:border-t-0 lg:first:pt-5">
                  <div className="flex items-start gap-3.5">
                    <Icon size={20} strokeWidth={1.7} className="mt-1 flex-none text-brand-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="text-[1.05rem] font-semibold leading-6 text-brand-900">{area.title}</h3>
                      <p className="mt-1.5 text-[0.9rem] leading-6 text-ink-600">{area.body}</p>
                      <Link href={localeHref(locale, CARE_AREA_SLUGS[index + 1])}
                            className="link-cta mt-2.5 text-[0.88rem] after:absolute after:inset-0">
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
