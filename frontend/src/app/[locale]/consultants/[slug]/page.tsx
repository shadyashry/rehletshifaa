import type { Metadata } from "next";
import { ArrowRight, ChevronRight, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CareAreaIcon } from "@/components/care-areas/CareAreaIcon";
import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
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

/** Latest four-digit year in a CV line; undefined when none is stated. */
const yearOf = (text: string) => text.match(/(?:19|20)\d{2}/g)?.at(-1);

/** A CV line split for setting: the title before the first comma (Latin or Arabic) and the institution/detail after it, with a trailing year removed. */
function splitLine(text: string) {
  const trailing = text.match(/[,،]\s*(?:19|20)\d{2}\.?\s*$/);
  const body = trailing ? text.slice(0, trailing.index).trim() : text;
  const comma = body.search(/[,،]\s/);
  return comma > 0 ? { head: body.slice(0, comma), rest: body.slice(comma + 1).trim() } : { head: body, rest: "" };
}

/** One CV section: a plain typographic heading over its content, separated from the next by a hairline. */
function CvSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-border-subtle py-9 first:border-t-0 first:pt-0 md:py-10">
      <h2 id={`${id}-title`} className="text-[1.25rem] font-semibold leading-snug tracking-[-0.01em] text-brand-900 rtl:tracking-normal">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A CV entry: the title set firm, its institution and dates quieter beneath. */
function Entry({ text }: { text: string }) {
  const { head, rest } = splitLine(text);
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <p className="text-[1rem] font-medium leading-7 text-brand-900">{head}</p>
      {rest ? <p className="text-[0.9375rem] leading-6 text-ink-500">{rest}</p> : null}
    </li>
  );
}

/**
 * A Consultant's profile, set as a clinical dossier — no sales furniture. On desktop a fixed identity column (portrait
 * mark, name, role, the facts a patient checks first) sits beside the CV itself: overview, clinical focus, highlights,
 * dated qualifications, appointments, standing and sources, separated only by hairlines and type. The page carries
 * no buttons of its own: one quiet line at the end says the patient never has to choose, and the header keeps the
 * single "Start my case". Other Consultants in the same body system follow as a plain list of names.
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
  const systemTitle = d.careAreasPage.systems[meta.system].title;

  const timeline = profile.qualifications
    .map((text, index) => ({ text, year: yearOf(text), index }))
    .sort((a, b) => (b.year ?? "0").localeCompare(a.year ?? "0") || a.index - b.index);
  const latest = timeline[0] ? { ...splitLine(timeline[0].text), year: timeline[0].year } : undefined;

  const facts = [
    { label: t.specialty, value: profile.specialty },
    profile.distinction ? { label: ui.verifiedRole, value: profile.distinction } : null,
    latest ? { label: t.latestQualification, value: [latest.head, latest.year].filter(Boolean).join(locale === "ar" ? "، " : ", ") } : null,
    { label: t.basedIn, value: profile.location },
  ].filter((fact) => fact !== null);

  const all = getConsultants(locale).filter((p) => p.slug !== profile.slug);
  const sameSystem = all.filter((p) => careAreaMeta(p.careAreaHref)?.system === meta.system);
  const related = (sameSystem.length ? sameSystem : all).slice(0, 3);

  return (
    <div className="bg-surface-default">
      <div className="container-site pb-16 pt-8 md:pb-20 md:pt-10">
        <nav aria-label={ui.back} className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
          <Link href={localeHref(locale, "consultants")} className="rounded px-0.5 hover:text-brand-700">{ui.back}</Link>
          <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
          <span>{systemTitle}</span>
        </nav>

        <div className="mt-8 grid gap-10 md:mt-10 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-16 xl:grid-cols-[19rem_minmax(0,1fr)] xl:gap-24">
          <header className="lg:sticky lg:top-28 lg:self-start">
            <ConsultantPortrait profile={profile} size="lg" />
            <h1 className="mt-6 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal">{profile.name}</h1>
            <p className="mt-2 text-[1rem] leading-7 text-ink-600">{profile.role}</p>

            <dl className="mt-6 border-t border-border-subtle">
              {facts.map(({ label, value }) => (
                <div key={label} className="border-b border-border-subtle py-3.5">
                  <dt className="text-[0.8125rem] leading-5 text-ink-500">{label}</dt>
                  <dd className="mt-0.5 text-[0.9375rem] font-medium leading-6 text-brand-900">{value}</dd>
                </div>
              ))}
            </dl>

            <p title={t.reviewNote} className="mt-4 flex items-center gap-2 text-[0.8125rem] leading-5 text-ink-500">
              <FileText size={14} aria-hidden="true" className="flex-none" />
              {t.verified}
            </p>
            <Link href={localeHref(locale, profile.careAreaHref)} className="mt-3 inline-flex items-center gap-2 text-[0.875rem] font-semibold text-brand-700 hover:text-brand-800">
              <CareAreaIcon name={meta.icon} size={15} strokeWidth={1.9} />
              {ui.careArea}
            </Link>
          </header>

          <div className="min-w-0 max-w-[46rem]">
            <CvSection id="overview" title={t.overview}>
              <p className="text-[1.0625rem] leading-8 text-ink-700">{profile.summary}</p>
            </CvSection>

            <CvSection id="focus" title={ui.focus}>
              <ul className="grid gap-x-10 gap-y-2.5 sm:grid-cols-2">
                {profile.focusAreas.map((item) => (
                  <li key={item} className="flex gap-3 text-[1rem] leading-7 text-ink-700">
                    <span aria-hidden className="mt-[0.8125rem] h-px w-3 flex-none bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </CvSection>

            {profile.achievements?.length ? (
              <CvSection id="highlights" title={t.highlights}>
                <ul className="grid gap-3">
                  {profile.achievements.map((achievement) => (
                    <li key={achievement} className="flex gap-3 text-[1rem] leading-7 text-ink-700">
                      <span aria-hidden className="mt-[0.8125rem] h-px w-3 flex-none bg-brand-500" />
                      {achievement}
                    </li>
                  ))}
                </ul>
              </CvSection>
            ) : null}

            <CvSection id="qualifications" title={ui.qualifications}>
              <ol aria-label={t.timeline} className="grid gap-4">
                {timeline.map((item) => {
                  const { head, rest } = splitLine(item.text);
                  return (
                    <li key={item.text} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-4 sm:grid-cols-[4rem_minmax(0,1fr)]">
                      <span className="text-[0.9375rem] font-medium tabular-nums leading-7 text-ink-500">{item.year ?? "—"}</span>
                      <p className="min-w-0">
                        <span className="block text-[1rem] font-medium leading-7 text-brand-900">{head}</span>
                        {rest ? <span className="block text-[0.9375rem] leading-6 text-ink-500">{rest}</span> : null}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CvSection>

            <CvSection id="appointments" title={ui.appointments}>
              <ul className="grid">{profile.appointments.map((item) => <Entry key={item} text={item} />)}</ul>
            </CvSection>

            {profile.professionalStanding.length ? (
              <CvSection id="standing" title={ui.standing}>
                <ul className="grid">{profile.professionalStanding.map((item) => <Entry key={item} text={item} />)}</ul>
              </CvSection>
            ) : null}

            <section aria-labelledby="sources-title" className="border-t border-border-subtle pt-9 md:pt-10">
              <h2 id="sources-title" className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{t.sourcesTitle}</h2>
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
            </section>

            <p className="mt-10 border-t border-border-subtle pt-6 text-[0.9375rem] leading-7 text-ink-600">
              {t.matchNote}{" "}
              <Link href={localeHref(locale, "send-my-case")} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700">{t.matchLink}</Link>
            </p>
          </div>
        </div>
      </div>

      {related.length ? (
        <section aria-labelledby="related-consultants-title" className="border-t border-border-subtle py-12 md:py-14">
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
            <ul className="mt-6 grid border-t border-border-subtle md:grid-cols-3 md:gap-x-10">
              {related.map((p) => (
                <li key={p.slug} className="border-b border-border-subtle md:border-b-0">
                  <Link href={localeHref(locale, `consultants/${p.slug}`)} className="group flex items-center gap-4 py-5">
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
    </div>
  );
}
