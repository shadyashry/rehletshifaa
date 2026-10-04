import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { careAreaAtlas } from "@/lib/care-area-catalog";
import { getConsultants, universityFacultySlugs } from "@/lib/consultants";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

const SHOWN_MONOGRAMS = 5;

/**
 * The claim the whole platform rests on — a named Consultant owns the clinical decision — set as an
 * editorial statement on the clinical mist: the statement in the 5-column, and in the 7-column three
 * principles announced by large, quiet numerals and set as small-capital headings. No rows, no cards,
 * no icons; the numerals, the alignment and the whitespace carry it. Beneath, the evidence: the panel of
 * verified Consultants as monograms with three derived facts and one way to meet them.
 */
export function PromiseSection({ d, locale }: { d: Dictionary; locale: Locale }) {
  const p = d.home.consultantsPromise;
  const panel = d.home.panel;
  const profiles = getConsultants(locale);
  const faculty = universityFacultySlugs();
  const facts = [
    { value: profiles.length, label: panel.consultants },
    { value: profiles.filter((profile) => faculty.has(profile.slug)).length, label: panel.faculty },
    { value: careAreaAtlas(locale, d).length, label: panel.areas },
  ];
  const principles = locale === "ar"
    ? [
        ["الاختصاص المناسب", "يُختار حسب الحاجة السريرية."],
        ["مسؤولية واضحة", "استشاري واحد يملك التوصية."],
        ["منسّق إلى جانبك", "شخص واحد يبقى معك طوال المسار."],
      ]
    : [
        ["Right specialty", "Matched to the clinical need."],
        ["Clear responsibility", "One Consultant owns the recommendation."],
        ["Coordinator alongside", "One person stays with you through the process."],
      ];

  return (
    <section className="canvas-clinical py-[clamp(2.5rem,1.9rem+1.8vw,3.75rem)]">
      <div className="container-site grid gap-8 sm:gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:pt-1">
          <p className="eyebrow">{p.eyebrow}</p>
          <h2 className="headline mt-2 max-w-[14ch] font-bold rtl:max-w-[22ch] [text-wrap:balance]">{p.title}</h2>
          <p className="mt-4 max-w-[44ch] text-[1.0625rem] leading-7 text-ink-700 [text-wrap:pretty] sm:mt-5 sm:leading-[1.7]">{p.body}</p>
        </div>

        <ol className="grid gap-6 sm:gap-7 lg:mt-1 lg:gap-9">
          {principles.map(([term, detail], index) => (
            <li key={term} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-4 sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[5rem_minmax(0,1fr)]">
              <span aria-hidden className="select-none text-[2.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-brand-600/[0.45] sm:text-[3.25rem] lg:text-[3.75rem]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-[1rem] font-bold uppercase leading-[1.3] tracking-[0.08em] text-brand-900 rtl:text-[1.2rem] rtl:normal-case rtl:tracking-normal sm:text-[1.0625rem]">{term}</h3>
                <p className="mt-1.5 max-w-[44ch] text-[1rem] leading-7 text-ink-600 sm:text-[1.0625rem]">{detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-[18px] border border-border-clinical bg-surface-default/85 p-5 shadow-[0_24px_48px_-40px_rgba(36,64,74,0.5)] backdrop-blur-sm sm:p-6 lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8 lg:px-8 lg:py-7">
          <div className="flex items-center gap-4">
            <span aria-hidden className="flex flex-none -space-x-2 rtl:space-x-reverse">
              {profiles.slice(0, SHOWN_MONOGRAMS).map((profile, index) => (
                <span key={profile.slug} className={`grid h-11 w-11 place-items-center rounded-full text-[0.72rem] font-semibold tracking-[0.03em] ring-2 ring-surface-default ${index === 0 ? "bg-brand-700 text-white" : "bg-surface-clinical text-brand-800"}`}>
                  {profile.initials}
                </span>
              ))}
              {profiles.length > SHOWN_MONOGRAMS ? (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-pearl text-[0.72rem] font-semibold text-ink-600 ring-2 ring-surface-default">+{profiles.length - SHOWN_MONOGRAMS}</span>
              ) : null}
            </span>
            <div className="hidden min-w-0 sm:block">
              <p className="text-[1.0625rem] font-semibold leading-6 text-brand-900">{panel.title}</p>
              <p className="mt-0.5 text-[0.875rem] leading-5 text-ink-600 lg:hidden xl:block">{panel.body}</p>
            </div>
          </div>
          <div className="mt-4 sm:hidden">
            <p className="text-[1.0625rem] font-semibold leading-6 text-brand-900">{panel.title}</p>
            <p className="mt-0.5 text-[0.875rem] leading-5 text-ink-600">{panel.body}</p>
          </div>
          <div className="mt-5 flex flex-col gap-4 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between lg:mt-0 lg:border-t-0 lg:pt-0">
            <dl className="grid grid-cols-3 divide-x divide-border-subtle rtl:divide-x-reverse">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-1.5 px-3 first:ps-0 sm:px-5 lg:px-4">
                  <dt className="order-last text-[0.75rem] leading-4 text-ink-500 sm:text-[0.8125rem]">{fact.label}</dt>
                  <dd className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-brand-900 tabular-nums sm:text-[1.75rem]">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <Link href={localeHref(locale, "consultants")} className="link-cta flex-none text-[0.95rem]">
              {panel.link}
              <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
