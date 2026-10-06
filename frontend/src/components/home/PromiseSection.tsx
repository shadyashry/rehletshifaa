import { ArrowRight, BadgeCheck, Crosshair, UserRoundCheck } from "lucide-react";
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
 * principles, each with one meaningful icon (numerals are kept for real sequences only). Beneath, the evidence: the panel of
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
  const icons = [Crosshair, UserRoundCheck, BadgeCheck] as const;
  const principles = locale === "ar"
    ? [
        ["الاختصاص المناسب", "يُختار حسب الحاجة السريرية."],
        ["مسؤولية واضحة", "استشاري واحد يملك التوصية."],
        ["مؤهلات موثّقة", "يجري التحقق منها قبل توجيه أي حالة."],
      ]
    : [
        ["Right specialty", "Matched to the clinical need."],
        ["Clear responsibility", "One Consultant owns the recommendation."],
        ["Verified credentials", "Checked before any case is matched."],
      ];

  return (
    <section className="promise-section canvas-clinical py-[clamp(2.5rem,1.9rem+1.8vw,3.75rem)]">
      <div className="container-site grid gap-8 sm:gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div className="lg:pt-1">
          <p className="eyebrow">{p.eyebrow}</p>
          <h2 className="headline mt-2 max-w-[14ch] font-bold rtl:max-w-[30ch] [text-wrap:balance]">{p.title}</h2>
          <p className="mt-4 max-w-[44ch] text-[1.0625rem] leading-7 text-ink-700 [text-wrap:pretty] sm:mt-5 sm:leading-[1.7]">{p.body}</p>
        </div>

        <ol className="grid gap-6 sm:gap-7 lg:mt-1 lg:gap-9">
          {principles.map(([term, detail], index) => {
            const Icon = icons[index] ?? BadgeCheck;
            return (
            <li key={term} className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-4 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-5">
              <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-default text-brand-700 shadow-[0_10px_24px_-16px_rgba(36,64,74,0.5)] ring-1 ring-border-clinical sm:h-14 sm:w-14">
                <Icon size={22} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 pt-1 sm:pt-2">
                <h3 className="text-[1.125rem] font-semibold leading-snug text-brand-900 sm:text-[1.25rem]">{term}</h3>
                <p className="mt-1 max-w-[44ch] text-[1rem] leading-7 text-ink-600 sm:text-[1.0625rem]">{detail}</p>
              </div>
            </li>
            );
          })}
        </ol>

        <div className="promise-panel rounded-[18px] border border-border-clinical bg-surface-default/85 p-5 shadow-[0_24px_48px_-40px_rgba(36,64,74,0.5)] backdrop-blur-sm sm:p-6 lg:col-span-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8 lg:px-8 lg:py-7">
          <div className="flex items-center gap-4">
            <span aria-hidden className="flex flex-none -space-x-2 rtl:space-x-reverse">
              {profiles.slice(0, SHOWN_MONOGRAMS).map((profile, index) => (
                <span key={profile.slug} className={`grid h-11 w-11 place-items-center rounded-full text-[0.8125rem] font-semibold tracking-[0.03em] ring-2 ring-surface-default ${index === 0 ? "bg-brand-700 text-white" : "bg-surface-clinical text-brand-800"}`}>
                  {profile.initials}
                </span>
              ))}
              {profiles.length > SHOWN_MONOGRAMS ? (
                <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-pearl text-[0.8125rem] font-semibold text-ink-600 ring-2 ring-surface-default">+{profiles.length - SHOWN_MONOGRAMS}</span>
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
            <dl className="grid grid-cols-3 divide-x divide-border-subtle">
              {facts.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-1.5 px-3 first:ps-0 sm:px-5 lg:px-4">
                  <dt className="order-last max-w-[8.5rem] text-[0.8125rem] leading-5 text-ink-500">{fact.label}</dt>
                  <dd className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-brand-900 tabular-nums sm:text-[1.75rem]">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <Link href={localeHref(locale, "consultants")} className="link-cta flex-none text-[0.9375rem]">
              {panel.link}
              <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
