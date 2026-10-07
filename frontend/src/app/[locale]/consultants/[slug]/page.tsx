import type { Metadata } from "next";
import { ArrowRight, Award, BookOpen, Building2, ChevronRight, ExternalLink, FileText, Landmark, Presentation, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
import { HeroStats } from "@/components/HeroStats";
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

/** Latest four-digit year in a CV line; undefined when none is stated. */
const yearOf = (text: string) => text.match(/(?:19|20)\d{2}/g)?.at(-1);

/** A CV line split for setting: the title before the first comma (Latin or Arabic) and the institution/detail after it, with a trailing year removed. */
function splitLine(text: string) {
  const trailing = text.match(/[,،]\s*(?:19|20)\d{2}\.?\s*$/);
  const body = trailing ? text.slice(0, trailing.index).trim() : text;
  const comma = body.search(/[,،]\s/);
  return comma > 0 ? { head: body.slice(0, comma), rest: body.slice(comma + 1).trim() } : { head: body, rest: "" };
}

/** A flat icon tile — white, one hairline, 8px corners — the theme's single icon treatment. */
function Tile({ children }: { children: ReactNode }) {
  return <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line bg-surface-default text-brand-700">{children}</span>;
}

/** One CV section: a brand-type heading over its content, separated from the next by a hairline. */
function CvSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-line py-10 first:border-t-0 first:pt-0 md:py-12">
      <h2 id={`${id}-title`} className="headline text-[1.375rem] sm:text-[1.5rem]">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A CV entry: an icon tile, the title set firm, its institution and dates quieter beneath, between hairlines. */
function Entry({ text, icon }: { text: string; icon: ReactNode }) {
  const { head, rest } = splitLine(text);
  return (
    <li className="flex gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <Tile>{icon}</Tile>
      <p className="min-w-0">
        <span className="block text-[1rem] font-medium leading-7 text-brand-900">{head}</span>
        {rest ? <span className="block text-[0.9375rem] leading-6 text-ink-500">{rest}</span> : null}
      </p>
    </li>
  );
}

/**
 * A Consultant's profile, built from the site's own page system so the theme carries it like every other page: a flat
 * paper hero with one hairline (breadcrumb; portrait mark with the specialty badge; the care area as the coral-ruled
 * label; the name in the brand display face; the role; three figures between hairlines). Below, on white, the dossier:
 * a fixed facts column beside the CV — overview, clinical focus as a hairline grid, highlights, a dated qualifications
 * timeline with coral-ringed markers, appointments, standing and sources. No buttons of its own: one quiet line at the
 * end says the patient never has to choose; the header keeps the single "Start my case".
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
  const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

  const timeline = profile.qualifications
    .map((text, index) => ({ text, year: yearOf(text), index }))
    .sort((a, b) => (b.year ?? "0").localeCompare(a.year ?? "0") || a.index - b.index);
  const latest = timeline[0] ? { ...splitLine(timeline[0].text), year: timeline[0].year } : undefined;

  const facts = [
    same(profile.specialty, profile.careAreaLabel) ? null : { label: t.specialty, value: profile.specialty },
    profile.distinction ? { label: ui.verifiedRole, value: profile.distinction } : null,
    latest ? { label: t.latestQualification, value: [latest.head, latest.year].filter(Boolean).join(locale === "ar" ? "، " : ", ") } : null,
    { label: t.basedIn, value: profile.location },
  ].filter((fact) => fact !== null);

  const firstYear = profile.qualifications.map(yearOf).filter((y) => y !== undefined).sort()[0];
  const stats = [
    firstYear ? { value: new Date().getFullYear() - Number(firstYear), label: t.statYears } : null,
    { value: profile.qualifications.length, label: t.statQualifications },
    { value: profile.focusAreas.length, label: t.statFocus },
  ].filter((stat) => stat !== null);

  const all = getConsultants(locale).filter((p) => p.slug !== profile.slug);
  const sameSystem = all.filter((p) => careAreaMeta(p.careAreaHref)?.system === meta.system);
  const related = (sameSystem.length ? sameSystem : all).slice(0, 3);

  return (
    <>
      <section className="page-hero border-b border-line bg-surface-pearl">
        <div className="container-site pb-10 pt-8 md:pb-12 md:pt-10">
          <nav aria-label={ui.back} className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
            <Link href={localeHref(locale, "consultants")} className="rounded px-0.5 hover:text-brand-700">{ui.back}</Link>
            <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
              {systemTitle}
            </span>
          </nav>

          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            <span className="relative inline-block w-fit flex-none rounded-full border border-line bg-surface-default p-1.5">
              <ConsultantPortrait profile={profile} size="lg" />
              <span aria-hidden className="absolute -bottom-0.5 -end-0.5 grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-white ring-4 ring-surface-pearl">
                <CareAreaIcon name={meta.icon} size={17} strokeWidth={2} />
              </span>
            </span>
            <div className="min-w-0">
              <p className="eyebrow">{profile.careAreaLabel}</p>
              <h1 className="display mt-3 max-w-[24ch] rtl:max-w-[30ch]">{profile.name}</h1>
              <p className="lead mt-3 max-w-[60ch]">{profile.role}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <HeroStats stats={stats} />
            <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.875rem] leading-6 text-ink-600">
              <span title={t.reviewNote} className="inline-flex items-center gap-1.5"><FileText size={15} aria-hidden="true" className="text-brand-600" />{t.verified}</span>
              <Link href={localeHref(locale, profile.careAreaHref)} className="link-cta inline-flex items-center gap-1.5">
                {ui.careArea}
                <ArrowRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </p>
          </div>
        </div>
      </section>

      <div className="bg-surface-default">
        <div className="container-site grid gap-10 py-14 md:py-16 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16 xl:grid-cols-[19rem_minmax(0,1fr)] xl:gap-24">
          <aside aria-label={t.atAGlance} className="lg:sticky lg:top-28 lg:self-start">
            <dl className="border-t border-line">
              {facts.map(({ label, value }) => (
                <div key={label} className="border-b border-line py-4">
                  <dt className="text-[0.8125rem] leading-5 text-ink-500">{label}</dt>
                  <dd className="mt-1 text-[0.9375rem] font-medium leading-6 text-brand-900">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>

          <div className="min-w-0 max-w-[46rem]">
            <CvSection id="overview" title={t.overview}>
              <p className="text-[1.0625rem] leading-8 text-ink-700">{profile.summary}</p>
            </CvSection>

            <CvSection id="focus" title={ui.focus}>
              {/* A hairline grid: one white sheet divided into cells, each with the specialty tile. */}
              <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
                {profile.focusAreas.map((item) => (
                  <li key={item} className="flex gap-4 bg-surface-default p-5">
                    <Tile><CareAreaIcon name={meta.icon} size={17} strokeWidth={1.8} /></Tile>
                    <p className="pt-1 text-[1rem] font-medium leading-7 text-brand-900">{item}</p>
                  </li>
                ))}
              </ul>
            </CvSection>

            {profile.achievements?.length ? (
              <CvSection id="highlights" title={t.highlights}>
                <ul className="grid">
                  {profile.achievements.map((achievement) => {
                    const Icon = highlightIcon(achievement);
                    return (
                      <li key={achievement} className="flex gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
                        <Tile><Icon size={17} strokeWidth={1.8} /></Tile>
                        <p className="pt-1 text-[1rem] leading-7 text-ink-700">{achievement}</p>
                      </li>
                    );
                  })}
                </ul>
              </CvSection>
            ) : null}

            <CvSection id="qualifications" title={ui.qualifications}>
              <ol aria-label={t.timeline}>
                {timeline.map((item, index) => {
                  const { head, rest } = splitLine(item.text);
                  const last = index === timeline.length - 1;
                  return (
                    <li key={item.text} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-4 sm:grid-cols-[4rem_minmax(0,1fr)]">
                      <span className="text-[0.9375rem] font-semibold tabular-nums leading-7 text-brand-700">{item.year ?? "—"}</span>
                      <p className={`relative min-w-0 ps-8 ${last ? "" : "pb-7"}`}>
                        {/* The theme's journey marker in miniature: white, ringed in coral. */}
                        <span aria-hidden className="absolute start-0 top-[0.4375rem] h-3.5 w-3.5 rounded-full border-2 border-coral bg-surface-default" />
                        {last ? null : <span aria-hidden className="absolute bottom-0 start-[0.40625rem] top-6 w-px bg-line" />}
                        <span className="block text-[1rem] font-medium leading-7 text-brand-900">{head}</span>
                        {rest ? <span className="block text-[0.9375rem] leading-6 text-ink-500">{rest}</span> : null}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CvSection>

            <CvSection id="appointments" title={ui.appointments}>
              <ul className="grid">{profile.appointments.map((item) => <Entry key={item} text={item} icon={<Building2 size={17} strokeWidth={1.8} />} />)}</ul>
            </CvSection>

            {profile.professionalStanding.length ? (
              <CvSection id="standing" title={ui.standing}>
                <ul className="grid">{profile.professionalStanding.map((item) => <Entry key={item} text={item} icon={<ShieldCheck size={17} strokeWidth={1.8} />} />)}</ul>
              </CvSection>
            ) : null}

            <section aria-labelledby="sources-title" className="border-t border-line pt-10 md:pt-12">
              <h2 id="sources-title" className="eyebrow">{t.sourcesTitle}</h2>
              <p className="mt-3 text-[0.875rem] leading-6 text-ink-500">{profile.verification}</p>
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
            </section>

            <p className="mt-10 border-t border-line pt-6 text-[0.9375rem] leading-7 text-ink-600">
              {t.matchNote}{" "}
              <Link href={localeHref(locale, "send-my-case")} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700">{t.matchLink}</Link>
            </p>
          </div>
        </div>
      </div>

      {related.length ? (
        <section aria-labelledby="related-consultants-title" className="border-t border-line bg-surface-pearl py-12 md:py-16">
          <div className="container-site">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{t.relatedEyebrow}</p>
                <h2 id="related-consultants-title" className="headline mt-3 text-[1.5rem] sm:text-[1.75rem]">
                  {sameSystem.length ? t.relatedTitle.replace("{system}", systemTitle) : t.relatedFallback}
                </h2>
              </div>
              <Link href={localeHref(locale, "consultants")} className="link-cta inline-flex items-center gap-1.5 text-[0.9375rem]">
                {t.allConsultants}
                <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>
            <ul className="mt-7 grid gap-4 md:grid-cols-3">
              {related.map((p) => (
                <li key={p.slug}>
                  <Link href={localeHref(locale, `consultants/${p.slug}`)} className="group flex h-full items-center gap-4 rounded-lg border border-line bg-surface-default p-4 transition-colors hover:border-brand-300">
                    <ConsultantPortrait profile={p} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold leading-6 text-brand-900 group-hover:text-brand-700">{p.name}</span>
                      <span className="line-clamp-1 text-[0.875rem] leading-6 text-ink-500">{p.specialty}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
