import type { Metadata } from "next";
import { ArrowRight, Award, BadgeCheck, Building2, ChevronRight, ExternalLink, GraduationCap, MapPin, ShieldCheck, Stethoscope } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CaseRouter } from "@/components/care-areas/CaseRouter";
import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { ConsultantPortrait, ExpertiseMap } from "@/components/ConsultantProfileCard";
import { TrackedLink } from "@/components/TrackedLink";
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

/** Latest four-digit year in a qualification line, for the timeline; undefined when none is stated. */
const yearOf = (text: string) => text.match(/(?:19|20)\d{2}/g)?.at(-1);

function DetailCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="rounded-[18px] border border-border-card bg-surface-default p-6 shadow-[0_1px_2px_rgba(36,64,74,0.04)] sm:p-7">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-surface-clinical text-brand-700 ring-1 ring-border-clinical">{icon}</span>
        <h2 className="text-[1.25rem] font-semibold leading-snug text-brand-900">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

/**
 * A Consultant's profile, as evidence rather than a sales page: an identity hero (monogram, verified mark,
 * care area, credential signals, role, location, summary, the two actions) beside the expertise map and
 * the one professional distinction; numbered professional highlights; clinical focus and standing; the
 * qualifications as a dated timeline; appointments; the profile's sources; other Consultants in the same
 * body system; and the closing router — the patient still never has to choose.
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

  const timeline = profile.qualifications
    .map((text, index) => ({ text, year: yearOf(text), index }))
    .sort((a, b) => (b.year ?? "0").localeCompare(a.year ?? "0") || a.index - b.index);

  const all = getConsultants(locale).filter((p) => p.slug !== profile.slug);
  const sameSystem = all.filter((p) => careAreaMeta(p.careAreaHref)?.system === meta.system);
  const related = (sameSystem.length ? sameSystem : all).slice(0, 3);

  return (
    <>
      <section className="border-b border-border-subtle bg-surface-pearl bg-[radial-gradient(70%_120%_at_88%_-10%,var(--color-surface-clinical),var(--color-surface-pearl)_72%)]">
        <div className="container-site pb-12 pt-8 md:pt-10 lg:pb-14">
          <nav aria-label={ui.back} className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
            <Link href={localeHref(locale, "consultants")} className="rounded px-0.5 hover:text-brand-700">{ui.back}</Link>
            <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
              {systemTitle}
            </span>
          </nav>

          <div className="mt-7 grid gap-9 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-16">
            <div>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <span className={`relative inline-block w-fit flex-none rounded-full p-1.5 ${style.well}`}>
                  <ConsultantPortrait profile={profile} size="lg" />
                  <span className="absolute -bottom-0.5 -end-0.5 grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-white ring-4 ring-surface-pearl" title={t.verified}>
                    <BadgeCheck size={18} strokeWidth={2} aria-hidden="true" />
                    <span className="sr-only">{t.verified}</span>
                  </span>
                </span>
                <div className="min-w-0">
                  <Link href={localeHref(locale, profile.careAreaHref)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.8125rem] font-semibold text-brand-800 ring-1 transition-colors hover:text-brand-600 ${style.soft} ${style.ring}`}>
                    <CareAreaIcon name={meta.icon} size={14} strokeWidth={1.9} />
                    {profile.careAreaLabel}
                  </Link>
                  <h1 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.022em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.5rem]">{profile.name}</h1>
                  <p className="mt-1.5 text-[1.0625rem] leading-7 text-ink-600">{profile.specialty}</p>
                </div>
              </div>

              <p className="mt-6 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-3 py-1 text-[0.8125rem] font-semibold text-white">
                  <BadgeCheck size={14} aria-hidden="true" />
                  {t.verified}
                </span>
                {profile.achievementBadges.map((badge) => (
                  <span key={badge} className="inline-flex items-center gap-1.5 rounded-full bg-surface-default px-3 py-1 text-[0.8125rem] font-semibold text-brand-800 ring-1 ring-border-card">
                    <Award size={14} aria-hidden="true" className="text-brand-600" />
                    <bdi>{badge}</bdi>
                  </span>
                ))}
              </p>

              <div className="mt-5 grid gap-2 text-[1rem] leading-7 text-ink-700">
                <p className="flex gap-2.5"><GraduationCap size={19} aria-hidden="true" className="mt-1 flex-none text-brand-600" />{profile.role}</p>
                <p className="flex items-center gap-2.5 text-[0.9375rem] text-ink-500"><MapPin size={17} aria-hidden="true" className="flex-none text-brand-600" />{profile.location}</p>
              </div>
              <p className="lead mt-5 max-w-[62ch]">{profile.summary}</p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <TrackedLink event="send_case_cta_clicked" className="btn-primary w-full sm:w-auto" href={localeHref(locale, "send-my-case")}>
                  {t.requestReview}
                  <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
                </TrackedLink>
                <Link className="btn-secondary w-full sm:w-auto" href={localeHref(locale, profile.careAreaHref)}>{ui.careArea}</Link>
              </div>
            </div>

            <aside className="rounded-[20px] border border-border-card bg-surface-default p-5 shadow-[0_30px_60px_-44px_rgba(36,64,74,0.6)] sm:p-6">
              {profile.distinction ? (
                <div className="flex gap-3 rounded-[14px] bg-surface-clinical p-4 ring-1 ring-border-clinical">
                  <Award size={20} aria-hidden="true" className="mt-0.5 flex-none text-brand-700" />
                  <div>
                    <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:text-[0.8125rem] rtl:normal-case rtl:tracking-normal">{ui.verifiedRole}</p>
                    <p className="mt-1 text-[1rem] font-semibold leading-6 text-brand-900">{profile.distinction}</p>
                  </div>
                </div>
              ) : null}
              <div className="mt-2">
                <ExpertiseMap expertise={profile.expertise} label={ui.clinicalExpertise} />
              </div>
            </aside>
          </div>
        </div>
      </section>

      {profile.achievements?.length ? (
        <section aria-labelledby="highlights-title" className="canvas-clinical py-14 md:py-16">
          <div className="container-site">
            <p className="eyebrow">{t.highlightsEyebrow}</p>
            <h2 id="highlights-title" className="mt-3 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-900 rtl:tracking-normal sm:text-[2rem]">{t.highlights}</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {profile.achievements.map((achievement, index) => (
                <li key={achievement} className="relative rounded-[18px] border border-border-clinical bg-surface-default p-6">
                  <div className="flex items-center justify-between">
                    <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-brand-700 text-white"><Award size={18} strokeWidth={1.8} /></span>
                    <span aria-hidden className="text-[0.8125rem] font-semibold tabular-nums tracking-[0.08em] text-brand-600/60">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <p className="mt-4 text-[1rem] leading-7 text-brand-900">{achievement}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      <section className="bg-surface-pearl py-14 md:py-16">
        <div className="container-site grid gap-5 lg:grid-cols-2">
          <div className="grid content-start gap-5">
            <DetailCard icon={<Stethoscope size={19} strokeWidth={1.8} />} title={ui.focus}>
              <ul className="grid gap-2.5">
                {profile.focusAreas.map((item) => (
                  <li key={item} className="flex gap-3 text-[1rem] leading-7 text-ink-700">
                    <span aria-hidden className={`mt-2.5 h-2 w-2 flex-none rounded-full ${style.dot}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </DetailCard>
            <DetailCard icon={<ShieldCheck size={19} strokeWidth={1.8} />} title={ui.standing}>
              <ul className="flex flex-wrap gap-2">
                {profile.professionalStanding.map((item) => (
                  <li key={item} className="rounded-xl bg-surface-pearl px-3 py-2 text-[0.9375rem] leading-6 text-ink-700 ring-1 ring-border-subtle">{item}</li>
                ))}
              </ul>
            </DetailCard>
          </div>
          <div className="grid content-start gap-5">
            <DetailCard icon={<GraduationCap size={19} strokeWidth={1.8} />} title={ui.qualifications}>
              <ol aria-label={t.timeline} className="relative">
                {timeline.map((item, index) => (
                  <li key={item.text} className="relative flex gap-4 pb-5 last:pb-0">
                    {index < timeline.length - 1 ? <span aria-hidden className="absolute start-[1.6875rem] top-9 h-[calc(100%-2rem)] w-px bg-brand-300" /> : null}
                    <span className={`relative grid h-9 w-[3.375rem] flex-none place-items-center rounded-full text-[0.75rem] font-semibold tabular-nums ${item.year ? "bg-brand-700 text-white" : "bg-surface-clinical text-brand-700 ring-1 ring-border-clinical"}`}>
                      {item.year ?? "—"}
                    </span>
                    <p className="pt-1 text-[1rem] leading-7 text-ink-700">{item.text}</p>
                  </li>
                ))}
              </ol>
            </DetailCard>
            <DetailCard icon={<Building2 size={19} strokeWidth={1.8} />} title={profile.sourceFile ? t.cvAppointments : ui.appointments}>
              <ul className="grid gap-2.5">
                {profile.appointments.map((item) => (
                  <li key={item} className="flex gap-3 text-[1rem] leading-7 text-ink-700">
                    <span aria-hidden className="mt-2.5 h-2 w-2 flex-none rounded-full bg-brand-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </DetailCard>
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border border-border-clinical bg-surface-clinical p-5 sm:flex-row sm:items-start sm:gap-4 sm:p-6 lg:col-span-2">
            <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-surface-default text-brand-700 ring-1 ring-border-clinical"><BadgeCheck size={19} strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <p className="text-[1rem] font-semibold text-brand-900">{t.sourcesTitle}</p>
              <p className="mt-1 text-[0.9375rem] leading-6 text-ink-600">{profile.verification}</p>
              {profile.externalLinks?.length ? (
                <div className="mt-3 flex flex-wrap gap-4">
                  {profile.externalLinks.map((link) => (
                    <a key={link.href} className="inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-brand-700 hover:text-brand-800" href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                      <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {related.length ? (
        <section aria-labelledby="related-consultants-title" className="border-t border-border-subtle bg-surface-default py-14 md:py-16">
          <div className="container-site">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{t.relatedEyebrow}</p>
                <h2 id="related-consultants-title" className="mt-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 rtl:tracking-normal sm:text-[1.75rem]">
                  {sameSystem.length ? t.relatedTitle.replace("{system}", systemTitle) : t.relatedFallback}
                </h2>
              </div>
              <Link href={localeHref(locale, "consultants")} className="link-cta text-[0.9375rem]">
                {t.allConsultants}
                <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>
            <ul className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {related.map((p) => {
                const m = careAreaMeta(p.careAreaHref) ?? meta;
                return (
                  <li key={p.slug}>
                    <ConsultantCard
                      profile={p}
                      system={m.system}
                      icon={m.icon}
                      href={localeHref(locale, `consultants/${p.slug}`)}
                      labels={{ view: ui.viewProfile, viewOf: ui.viewProfileOf(p.name), distinction: ui.verifiedRole, focus: ui.focus }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      <CaseRouter locale={locale} copy={d.consultantsPage.router} button={d.common.send} />
    </>
  );
}
