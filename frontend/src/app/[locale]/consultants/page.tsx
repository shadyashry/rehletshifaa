import type { Metadata } from "next";
import { BadgeCheck, FileText, Languages, Route, Stethoscope, UserRoundCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { ConsultantProfileCard } from "@/components/ConsultantProfileCard";
import { CtaPanel } from "@/components/CtaPanel";
import { PageHero } from "@/components/PageHero";
import { consultantUi, getConsultants } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const ui = consultantUi[locale];
  return pageMetadata(locale, "consultants", ui.pageTitle, ui.pageIntro);
}

const RAIL_ICONS = [BadgeCheck, Stethoscope, Languages] as const;
const MATCH_ICONS = [FileText, Route, UserRoundCheck] as const;

/**
 * Not a directory and not a marketplace: the page exists to build trust in the Consultants a case can be
 * matched to. A patient-centred hero with the matching model in one line, one reassurance rail, a demoted
 * verification note, three summary cards on one calm family, and the one message that matters — you do
 * not need to choose.
 */
export default async function Consultants({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  const ui = consultantUi[locale];
  const consultants = getConsultants(locale);

  const matching = (
    <ol className="relative grid grid-cols-3 gap-2 before:absolute before:inset-x-[16.6%] before:top-[19px] before:h-px before:bg-brand-400 sm:max-w-[28rem] lg:max-w-none">
      {ui.matching.map((label, i) => {
        const Icon = MATCH_ICONS[i] ?? FileText;
        return (
          <li key={label} className="relative flex flex-col items-center gap-2 text-center">
            <span className={`grid h-[38px] w-[38px] place-items-center rounded-full border ${i === 2 ? "border-brand-600 bg-brand-600 text-white" : "border-brand-400 bg-surface-elevated text-brand-700"}`}>
              <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="text-[0.78rem] font-semibold leading-4 text-ink-700 sm:text-[0.875rem] sm:leading-5">{label}</span>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      <PageHero tone="pearl" eyebrow={ui.eyebrow} title={ui.pageTitle} intro={ui.pageIntro} aside={matching} />

      {/* The reassurance rail: three quiet facts, hairline-divided, on the clinical mist. */}
      <div className="border-b border-border-clinical bg-surface-clinical">
        <ul className="container-site grid gap-y-3 py-[1.125rem] sm:grid-cols-3 sm:divide-x sm:divide-border-clinical sm:py-0 rtl:sm:divide-x-reverse">
          {ui.rail.map((label, i) => {
            const Icon = RAIL_ICONS[i] ?? BadgeCheck;
            return (
              <li key={label} className="flex items-center gap-2.5 text-[0.875rem] font-semibold leading-5 text-ink-700 sm:justify-center sm:py-[1.125rem]">
                <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-elevated text-brand-600 ring-1 ring-border-clinical">
                  <Icon size={15} strokeWidth={1.9} />
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>

      <section className="bg-surface-pearl pt-10 md:pt-12">
        <div className="container-site">
          {/* Below xl: profile panels (one column, two from lg with the third laid wide). From xl: one shared
              editorial surface with hairline dividers — a clinical panel, not three floating cards. */}
          <ul className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3 xl:gap-0 xl:divide-x xl:divide-border-subtle xl:rounded-[12px] xl:border xl:border-border-card xl:bg-surface-elevated rtl:xl:divide-x-reverse">
            {consultants.map((profile, i) => (
              <li
                key={profile.slug}
                className={`min-w-0 rounded-[12px] border border-border-card bg-surface-elevated transition-colors hover:bg-surface-clinical/40 has-[a:focus-visible]:border-brand-500 xl:rounded-none xl:border-0 xl:bg-transparent ${i === consultants.length - 1 ? "lg:col-span-2 xl:col-span-1" : ""}`}
              >
                <ConsultantProfileCard profile={profile} locale={locale} wide={i === consultants.length - 1} />
              </li>
            ))}
          </ul>

          {/* Transparency, said quietly: one line, one supporting note. */}
          <div className="mt-8 flex max-w-[62ch] items-start gap-3 md:mt-10">
            <span aria-hidden className="mt-3 h-px w-6 flex-none bg-brand-400" />
            <div>
              <p className="eyebrow">{ui.verificationEyebrow}</p>
              <p className="mt-1 text-[1rem] font-semibold leading-6 text-brand-900">{ui.verificationTitle}</p>
              <p className="mt-1 text-[0.9rem] leading-5 text-ink-500">{ui.notice}</p>
            </div>
          </div>
        </div>
      </section>

      <CtaPanel locale={locale} title={d.consultants.finalTitle} body={d.consultants.finalBody} button={d.common.send} />
    </>
  );
}
