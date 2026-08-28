import type { Metadata } from "next";
import { ArrowDown, Check, CircleDot, HeartPulse, Stethoscope } from "lucide-react";
import { notFound } from "next/navigation";

import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";
import { CategoryTabs } from "@/components/CategoryTabs";
import { ConsultantVideo } from "@/components/ConsultantVideo";
import { careAreaTabs } from "@/lib/care-areas";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "cardiology", d.cardiology.title, d.cardiology.intro);
}

function ItemList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li className="flex gap-3 leading-7 text-ink-700" key={item}>
          <Check className="mt-1.5 shrink-0 text-accent-700" size={17} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function Cardiology({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const sections = [
    {
      icon: Stethoscope,
      title: d.cardiology.coronaryTitle,
      items: d.cardiology.coronaryItems,
      examples: d.cardiology.coronaryExamples,
    },
    {
      icon: HeartPulse,
      title: d.cardiology.structuralTitle,
      items: d.cardiology.structuralItems,
    },
    {
      icon: CircleDot,
      title: d.cardiology.rhythmTitle,
      items: d.cardiology.rhythmItems,
      examples: d.cardiology.rhythmExamples,
    },
  ];

  return (
    <>
      <PageHero eyebrow={d.cardiology.eyebrow} title={d.cardiology.title} intro={d.cardiology.intro}>
        <a className="btn-secondary" href="#care-areas">
          {d.cardiology.exploreAction}
          <ArrowDown size={17} aria-hidden="true" />
        </a>
      </PageHero>

      <CategoryTabs tabs={careAreaTabs(locale, d)} label={d.careAreasPage.tabsLabel} />

      <section className="section">
        <div className="container-site grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <ConsultantVideo
            label={d.careAreasPage.video.label}
            title={d.careAreasPage.video.title}
            note={d.careAreasPage.video.note}
          />
          <div>
            <p className="eyebrow">{d.cardiology.eyebrow}</p>
            <p className="lead mt-3">{d.cardiology.intro}</p>
          </div>
        </div>
      </section>

      <div id="care-areas" className="container-site scroll-mt-24 pb-14 md:pb-20">
        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <section
              className={`grid gap-9 py-12 md:grid-cols-[0.72fr_1.28fr] md:py-16 ${index ? "border-t border-line" : ""}`}
              key={section.title}
            >
              <div>
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-accent-700">
                  <Icon size={26} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h2 className="mt-6 text-3xl font-bold leading-tight tracking-[-0.025em] text-brand-900 rtl:tracking-normal rtl:leading-snug">
                  {section.title}
                </h2>
              </div>
              <div>
                <ItemList items={section.items} />
                {section.examples ? (
                  <div className="mt-9 rounded-2xl bg-brand-50 p-6 sm:p-7">
                    <h3 className="font-bold text-brand-900">{d.cardiology.examples}</h3>
                    <ul className="mt-4 grid gap-2 text-sm leading-6 text-ink-600">
                      {section.examples.map((example) => (
                        <li className="flex gap-2" key={example}>
                          <span aria-hidden="true">—</span>
                          {example}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {index === 1 ? (
                  <p className="mt-8 border-s-4 border-accent-700 bg-wash-aqua p-5 font-bold leading-7 text-accent-800">
                    {d.cardiology.suitability}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <CtaPanel
        locale={locale}
        title={d.cardiology.finalTitle}
        body={d.cardiology.finalBody}
        button={d.common.send}
      />
    </>
  );
}
