import { Check } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { careAreaTabs } from "@/lib/care-areas";
import { CategoryTabs } from "@/components/CategoryTabs";
import { ConsultantVideo } from "@/components/ConsultantVideo";
import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";

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
 * Shared layout for the Rheumatology and Orthopedics care-area pages: hero,
 * the care-area tab strip, a consultant-introduction video placeholder, the
 * scope of care, a consultant-led safety note, and the closing call to action.
 * Cardiology keeps its own richer layout but reuses the same tabs and video.
 */
export function CategoryDetail({ locale, d, content }: { locale: Locale; d: Dictionary; content: CategoryContent }) {
  const tabs = careAreaTabs(locale, d);
  const video = d.careAreasPage.video;

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
        <div className="container-site grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <ConsultantVideo label={video.label} title={content.videoTitle} note={video.note} />

          <div className="grid gap-6">
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
