import type { Metadata } from "next";
import { ArrowRight, Award, BookOpen, ChevronRight, ExternalLink, FileText, Landmark, MapPin, Presentation } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { SpecialtyMotif } from "@/components/care-areas/SpecialtyMotif";
import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
import { CareerTimeline, FocusMap, type CareerEvent } from "@/components/consultants/ProfileVisuals";
import { careAreaMeta } from "@/lib/care-area-catalog";
import { CONSULTANT_SLUGS, consultantUi, getConsultant, getConsultants } from "@/lib/consultants";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return ["en", "ar"].flatMap(locale => CONSULTANT_SLUGS.map(slug => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const profile = getConsultant(locale, slug);
  return profile ? pageMetadata(locale, `consultants/${slug}`, profile.name, profile.summary) : {};
}

/** The kind of contribution a highlight describes, for its icon: research, leadership, teaching, or a distinction. */
function highlightIcon(text: string) {
  if (/research|publish|journal|presentation|paper|نشر|بحث|مجلة/i.test(text)) return BookOpen;
  if (/head|director|chair|lead|advis|consultant to|رئيس|مدير|مستشار/i.test(text)) return Landmark;
  if (/train|instructor|faculty|teach|supervis|lectur|مدرب|تدريب|محاضر|إشراف/i.test(text)) return Presentation;
  return Award;
}

/** Latest four-digit year in a qualification line; undefined when none is stated. */
const yearOf = (text: string) => text.match(/(?:19|20)\d{2}/g)?.at(-1);
/** The start year of an appointment ("since June 2023" / "منذ يونيو 2023"); undefined when none is stated. */
const sinceOf = (text: string) => text.match(/(?:since|منذ)[^0-9]{0,24}((?:19|20)\d{2})/i)?.[1];

/** A CV line split for setting: the title before the first comma (Latin or Arabic) and the institution/detail after it, with a trailing year removed. */
function splitLine(text: string) {
  const trailing = text.match(/[,،]\s*(?:19|20)\d{2}\.?\s*$/);
  const body = trailing ? text.slice(0, trailing.index).trim() : text;
  const comma = body.search(/[,،]\s/);
  return comma > 0 ? { head: body.slice(0, comma), rest: body.slice(comma + 1).trim() } : { head: body, rest: "" };
}

/** The institution alone: the detail before any further comma or a "(… CV)" note. */
const placeOf = (rest: string) => rest.split(/[,،]\s/)[0].replace(/\s*\([^)]*\)\s*$/, "").trim();

function Section({ id, title, tone = "white", children }: { id: string; title: string; tone?: "white" | "clinical"; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={`py-14 md:py-20 ${tone === "clinical" ? "canvas-clinical" : "bg-surface-default"}`}>
      <div className="container-site">
        <h2 id={`${id}-title`} className="text-[1.5rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 rtl:tracking-normal sm:text-[1.875rem]">{title}</h2>
        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </section>
  );
}

/** A CV entry: the title set firm, its institution and dates quieter beneath, between hairlines. */
function Entry({ text }: { text: string }) {
  const { head, rest } = splitLine(text);
  return (
    <li className="border-t border-border-subtle py-4 first:border-t-0 first:pt-0">
      <p className="text-[1rem] font-semibold leading-7 text-brand-900">{head}</p>
      {rest ? <p className="text-[0.9375rem] leading-6 text-ink-500">{rest}</p> : null}
    </li>
  );
}

/**
 * A Consultant's profile — visual, but with no sales furniture. A specialty-tinted hero carries the identity (portrait
 * mark, care area, name, role, location, summary) and three figures from the CV. Then the clinical focus as a map
 * around the specialty, highlights as icon tiles, the career as a dated path, appointments and memberships, and the
 * sources. The page has no buttons of its own: one quiet line at the end says the patient never has to choose, and
 * the header keeps the single "Start my case". Other Consultants in the same body system follow as a name list.
 */
export default async function ConsultantProfilePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const profile = getConsultant(locale, slug);
  if (!profile) notFound();
  const ui = consultantUi[locale];
  const d = getDictionary(locale);
  const t = d.consultantProfile;
  const meta = careAreaMeta(profile.careAreaHref) ?? { system: "heart" as const, icon: "heart" as const };
  const style = SYSTEM_STYLES[meta.system];
  const systemTitle = d.careAreasPage.systems[meta.system].title;

  const events: CareerEvent[] = [
    ...profile.qualifications.map((text) => ({ text, year: yearOf(text), kind: "qualification" as const })),
    ...profile.appointments.map((text) => ({ text, year: sinceOf(text), kind: "appointment" as const })),
  ]
    .filter((e): e is typeof e & { year: string } => e.year !== undefined)
    .map(({ text, year, kind }, index) => ({ ...splitLine(text), year, kind, index }))
    .sort((a, b) => a.year.localeCompare(b.year) || (a.kind === b.kind ? a.index - b.index : a.kind === "qualification" ? -1 : 1))
    .map(({ head, rest, year, kind }) => ({ year, kind, title: head, place: placeOf(rest) }));
  const undated = profile.qualifications.filter((text) => !yearOf(text));
  const showPath = events.length >= 2;

  const firstYear = profile.qualifications.map(yearOf).filter((y) => y !== undefined).sort()[0];
  const stats = [
    firstYear ? { value: String(new Date().getFullYear() - Number(firstYear)), label: t.statYears } : null,
    { value: String(profile.qualifications.length), label: t.statQualifications },
    { value: String(profile.focusAreas.length), label: t.statFocus },
  ].filter((s) => s !== null);

  const all = getConsultants(locale).filter((p) => p.slug !== profile.slug);
  const sameSystem = all.filter((p) => careAreaMeta(p.careAreaHref)?.system === meta.system);
  const related = (sameSystem.length ? sameSystem : all).slice(0, 3);

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border-subtle bg-surface-pearl">
        <div aria-hidden className={`absolute inset-0 -z-20 ${style.soft}`} />
        <SpecialtyMotif system={meta.system} className="absolute -end-24 -top-16 -z-10 h-[34rem] w-[56rem] opacity-55 [mask-image:linear-gradient(to_left,black_35%,transparent_80%)] rtl:-scale-x-100" />
        <div className="container-site pb-12 pt-8 md:pb-16 md:pt-10">
          <nav aria-label={ui.back} className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
            <Link href={localeHref(locale, "consultants")} className="rounded px-0.5 hover:text-brand-700">{ui.back}</Link>
            <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
              {systemTitle}
            </span>
          </nav>

          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-14">
            <div className="min-w-0">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <span className="relative inline-block w-fit flex-none rounded-full bg-surface-default/70 p-2 shadow-[0_20px_40px_-28px_rgba(36,64,74,0.6)] ring-1 ring-border-card">
                  <ConsultantPortrait profile={profile} size="lg" />
                  <span aria-hidden className="absolute -bottom-0.5 -end-0.5 grid h-10 w-10 place-items-center rounded-full bg-brand-700 text-white ring-4 ring-surface-pearl">
                    <CareAreaIcon name={meta.icon} size={18} strokeWidth={2} />
                  </span>
                </span>
                <div className="min-w-0">
                  <p className={`inline-flex items-center gap-1.5 rounded-full bg-surface-default/80 px-3 py-1 text-[0.8125rem] font-semibold text-brand-800 ring-1 ${style.ring}`}>
                    <CareAreaIcon name={meta.icon} size={14} strokeWidth={1.9} />
                    {profile.careAreaLabel}
                  </p>
                  <h1 className="mt-3 text-[2rem] font-semibold leading-[1.08] tracking-[-0.025em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.75rem]">{profile.name}</h1>
                  <p className="mt-2 text-[1.0625rem] leading-7 text-ink-700">{profile.role}</p>
                </div>
              </div>

              <p className="mt-7 max-w-[64ch] text-[1.0625rem] leading-8 text-ink-700">{profile.summary}</p>

              <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.875rem] leading-6 text-ink-600">
                <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" className="text-brand-600" />{profile.location}</span>
                <span title={t.reviewNote} className="inline-flex items-center gap-1.5"><FileText size={15} aria-hidden="true" className="text-brand-600" />{t.verified}</span>
                <Link href={localeHref(locale, profile.careAreaHref)} className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800">
                  {ui.careArea}
                  <ArrowRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </p>
            </div>

            <dl className={`grid divide-x divide-border-subtle overflow-hidden rounded-[20px] bg-surface-default/85 shadow-[0_30px_60px_-44px_rgba(36,64,74,0.6)] ring-1 ring-border-card backdrop-blur rtl:divide-x-reverse ${stats.length === 3 ? "grid-cols-3 lg:w-[26rem]" : "grid-cols-2 lg:w-[18rem]"}`}>
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col px-4 py-5 sm:px-6 sm:py-6">
                  <dt className="order-2 mt-2 text-[0.8125rem] leading-5 text-ink-500">{s.label}</dt>
                  <dd className="order-1 text-[2.25rem] font-semibold tabular-nums leading-none tracking-[-0.03em] text-brand-800 sm:text-[2.75rem]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <Section id="focus" title={ui.focus}>
        <FocusMap anchor={profile.expertise.anchor} areas={profile.focusAreas} icon={meta.icon} system={meta.system} />
      </Section>

      {profile.achievements?.length ? (
        <Section id="highlights" title={t.highlights} tone="clinical">
          <ul className="grid gap-5 md:grid-cols-3">
            {profile.achievements.map((achievement) => {
              const Icon = highlightIcon(achievement);
              return (
                <li key={achievement} className="rounded-[20px] bg-surface-default p-6 shadow-[0_20px_40px_-34px_rgba(36,64,74,0.5)] ring-1 ring-border-card sm:p-7">
                  <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-700 text-white shadow-[0_12px_24px_-14px_rgba(31,107,115,0.9)]"><Icon size={21} strokeWidth={1.8} /></span>
                  <p className="mt-5 text-[1rem] leading-7 text-brand-900">{achievement}</p>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section id="career" title={showPath ? t.careerPath : ui.qualifications} tone={profile.achievements?.length ? "white" : "clinical"}>
        {showPath ? (
          <>
            <CareerTimeline events={events} labels={{ qualification: t.kindQualification, appointment: t.kindAppointment }} />
            {undated.length ? (
              <div className="mt-10 border-t border-border-subtle pt-6">
                <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{t.furtherQualifications}</h3>
                <ul className="mt-4 grid gap-x-10 md:grid-cols-2">{undated.map((item) => <Entry key={item} text={item} />)}</ul>
              </div>
            ) : null}
          </>
        ) : (
          <ul className="grid max-w-[48rem]">{profile.qualifications.map((item) => <Entry key={item} text={item} />)}</ul>
        )}
      </Section>

      <section aria-labelledby="appointments-title" className="border-t border-border-subtle bg-surface-pearl py-14 md:py-20">
        <div className="container-site">
          <h2 id="appointments-title" className="text-[1.5rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 rtl:tracking-normal sm:text-[1.875rem]">{t.appointmentsTitle}</h2>
          <div className="mt-8 grid gap-10 md:mt-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{ui.appointments}</h3>
              <ul className="mt-4 grid">{profile.appointments.map((item) => <Entry key={item} text={item} />)}</ul>
            </div>
            {profile.professionalStanding.length ? (
              <div>
                <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{ui.standing}</h3>
                <ul className="mt-4 grid">{profile.professionalStanding.map((item) => <Entry key={item} text={item} />)}</ul>
              </div>
            ) : null}
          </div>

          <div className="mt-12 grid gap-6 border-t border-border-subtle pt-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{t.sourcesTitle}</h3>
              <p className="mt-2 text-[0.875rem] leading-6 text-ink-500">{profile.verification}</p>
              {profile.externalLinks?.length ? (
                <div className="mt-3 flex flex-wrap gap-4">
                  {profile.externalLinks.map((link) => (
                    <a key={link.href} className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-brand-700 hover:text-brand-800" href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="text-[0.9375rem] leading-7 text-ink-600 lg:pt-6">
              {t.matchNote}{" "}
              <Link href={localeHref(locale, "send-my-case")} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700">{t.matchLink}</Link>
            </p>
          </div>
        </div>
      </section>

      {related.length ? (
        <section aria-labelledby="related-consultants-title" className="border-t border-border-subtle bg-surface-default py-12 md:py-14">
          <div className="container-site">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 id="related-consultants-title" className="text-[1.25rem] font-semibold leading-snug text-brand-900">
                {sameSystem.length ? t.relatedTitle.replace("{system}", systemTitle) : t.relatedFallback}
              </h2>
              <Link href={localeHref(locale, "consultants")} className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-brand-700 hover:text-brand-800">
                {t.allConsultants}
                <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {related.map((p) => {
                const s = SYSTEM_STYLES[careAreaMeta(p.careAreaHref)?.system ?? meta.system];
                return (
                  <li key={p.slug}>
                    <Link href={localeHref(locale, `consultants/${p.slug}`)} className="group flex items-center gap-4 rounded-[18px] bg-surface-default p-4 ring-1 ring-border-card transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-30px_rgba(36,64,74,0.55)] motion-reduce:transform-none">
                      <span className={`rounded-full p-1 ${s.well}`}><ConsultantPortrait profile={p} size="sm" /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-6 text-brand-900 group-hover:text-brand-700">{p.name}</span>
                        <span className="line-clamp-1 text-[0.875rem] leading-6 text-ink-500">{p.specialty}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
