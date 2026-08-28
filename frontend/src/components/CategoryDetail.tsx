import { Check } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { careAreaTabs } from "@/lib/care-areas";
import { CategoryTabs } from "@/components/CategoryTabs";
import { ConsultantSpotlight } from "@/components/ConsultantProfileCard";
import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";
import { getConsultant, type ConsultantSlug } from "@/lib/consultants";

export type CategoryContent = {
  eyebrow: string;
  title: string;
  intro: string;
  videoTitle: string;
  highlight?: string;
  sections: readonly { title: string; items: readonly string[] }[];
  note: string;
  finalTitle: string;
  finalBody: string;
};

/**
 * Shared layout for the Rehabilitation/Dysphagia and Orthopedics pages: hero,
 * care-area tabs, the relevant consultant profile, scope of care, a clinical
 * safety note, and the closing call to action.
 */
export function CategoryDetail({ locale, d, content, consultantSlug }: { locale: Locale; d: Dictionary; content: CategoryContent; consultantSlug: ConsultantSlug }) {
  const tabs = careAreaTabs(locale, d);
  const consultant = getConsultant(locale, consultantSlug);

  return (
    <>
      <PageHero eyebrow={content.eyebrow} title={content.title} intro={content.intro} />
      <CategoryTabs tabs={tabs} label={d.careAreasPage.tabsLabel} />

      {content.highlight ? (
        <div className="border-b border-line bg-wash-aqua">
          <p className="container-site py-3.5 text-center text-sm font-bold text-accent-800">{content.highlight}</p>
        </div>
      ) : null}

      <section className="section">
        <div className="container-site">
          {consultant ? <ConsultantSpotlight profile={consultant} locale={locale} /> : null}
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {content.sections.map((section) => (
              <div key={section.title} className="card p-6 sm:p-7">
                <h2 className="text-xl font-bold tracking-[-0.01em] text-brand-900 rtl:tracking-normal">
                  {section.title}
                </h2>
                <ul className="mt-4 grid gap-2.5">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-3 leading-7 text-ink-700">
                      <Check className="mt-1.5 shrink-0 text-accent-700" size={17} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="border-s-4 border-accent-700 bg-wash-aqua p-5 font-bold leading-7 text-accent-800">
              {content.note}
            </p>
          </div>
        </div>
      </section>

      <CtaPanel locale={locale} title={content.finalTitle} body={content.finalBody} button={d.common.send} />
    </>
  );
}
