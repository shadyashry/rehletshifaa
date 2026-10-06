import type { Metadata } from "next";
import { ArrowRight, Award, BadgeCheck, BookOpen, Building2, Check, ChevronRight, ExternalLink, FileText, GraduationCap, Landmark, MapPin, Presentation, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CaseRouter } from "@/components/care-areas/CaseRouter";
import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { SpecialtyMotif } from "@/components/care-areas/SpecialtyMotif";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { ProfileSectionNav } from "@/components/consultants/ProfileSectionNav";
import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
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

/** The kind of contribution a highlight describes, for its icon: research, leadership, teaching, or a distinction. */
function highlightIcon(text: string) {
  if (/research|publish|journal|presentation|paper|نشر|بحث|مجلة/i.test(text)) return BookOpen;
  if (/head|director|chair|lead|advis|consultant to|رئيس|مدير|مستشار/i.test(text)) return Landmark;
  if (/train|instructor|faculty|teach|supervis|lectur|مدرب|تدريب|محاضر|إشراف/i.test(text)) return Presentation;
  return Award;
}

/** Latest four-digit year in a qualification line, for the timeline; undefined when none is stated. */
const yearOf = (text: string) => text.match(/(?:19|20)\d{2}/g)?.at(-1);

/** A CV line split for setting: the title before the first comma (Latin or Arabic) and the institution/detail after it, with a trailing year removed. */
function splitLine(text: string) {
  const trailing = text.match(/[,،]\s*(?:19|20)\d{2}\.?\s*$/);
  const body = trailing ? text.slice(0, trailing.index).trim() : text;
  const comma = body.search(/[,،]\s/);
  return comma > 0 ? { head: body.slice(0, comma), rest: body.slice(comma + 1).trim() } : { head: body, rest: "" };
}

function ProfileSection({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 border-t border-border-subtle py-10 first:border-t-0 first:pt-0 last:pb-0 md:py-12">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-surface-clinical text-brand-700 ring-1 ring-border-clinical">{icon}</span>
        <h2 id={`${id}-title`} className="text-[1.25rem] font-semibold leading-snug tracking-[-0.01em] text-brand-900 rtl:tracking-normal sm:text-[1.5rem]">{title}</h2>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A CV entry as a hairline row: the title set firm, its institution and dates quieter beneath. */
function EntryRow({ icon, text }: { icon: ReactNode; text: string }) {
  const { head, rest } = splitLine(text);
  return (
    <li className="flex gap-4 border-t border-border-subtle py-4 first:border-t-0 first:pt-0 last:pb-0">
      <span aria-hidden className="mt-0.5 flex-none text-brand-600">{icon}</span>
      <p className="min-w-0 text-[1rem] leading-7">
        <span className="font-semibold text-brand-900">{head}</span>
        {rest ? <span className="block text-[0.9375rem] leading-6 text-ink-500">{rest}</span> : null}
      </p>
    </li>
  );
}

/**
 * A Consultant's profile, set as a clinical CV rather than a sales page. The hero carries identity (portrait mark with
 * the specialty icon, care area, name, role, credential chips, summary, the two actions) beside a "profile at a glance"
 * sheet under the specialty's own motif (distinction, latest qualification, place of practice). The body reads as one
 * document — clinical focus, highlights, a dated qualifications timeline, appointments and memberships, sources —
 * separated by hairlines, with a sticky desktop rail holding "On this page" and the case-review action. Then other
 * Consultants in the same body system and the closing router: the patient still never has to choose.
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

  // The glance sheet already states these facts; a badge that repeats one of them is dropped.
  const glanceText = [profile.distinction, timeline[0]?.text].filter(Boolean).join(" ").toLocaleLowerCase();
  const badges = profile.achievementBadges.filter((badge) => !glanceText.includes(badge.toLocaleLowerCase()));
  // Short expertise labels add a layer above the focus list; when they only repeat it, the list stands alone.
  const expertiseTags = profile.expertise.areas.every((area) => profile.focusAreas.some((f) => same(f, area))) ? [] : profile.expertise.areas;

  const sections = [
    { id: "focus", title: ui.focus },
    ...(profile.achievements?.length ? [{ id: "highlights", title: t.highlights }] : []),
    { id: "qualifications", title: ui.qualifications },
    { id: "appointments", title: t.appointmentsTitle },
  ];

  const all = getConsultants(locale).filter((p) => p.slug !== profile.slug);
  const sameSystem = all.filter((p) => careAreaMeta(p.careAreaHref)?.system === meta.system);
  const related = (sameSystem.length ? sameSystem : all).slice(0, 3);

  return (
    <>
      <section className="page-hero border-b border-border-subtle bg-surface-pearl bg-[radial-gradient(70%_120%_at_88%_-10%,var(--color-surface-clinical),var(--color-surface-pearl)_72%)]">
        <div className="container-site pb-12 pt-8 md:pt-10 lg:pb-14">
          <nav aria-label={ui.back} className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] font-medium text-ink-500">
            <Link href={localeHref(locale, "consultants")} className="rounded px-0.5 hover:text-brand-700">{ui.back}</Link>
            <ChevronRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
              {systemTitle}
            </span>
          </nav>

          <div className="mt-7 grid gap-9 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-16 xl:grid-cols-[minmax(0,1fr)_25rem]">
            <div className="min-w-0">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                <span className={`relative inline-block w-fit flex-none rounded-full p-1.5 ${style.well}`}>
                  <ConsultantPortrait profile={profile} size="lg" />
                  <span className="hero-island absolute -bottom-0.5 -end-0.5 grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-white ring-4 ring-surface-pearl" title={profile.careAreaLabel}>
                    <CareAreaIcon name={meta.icon} size={17} strokeWidth={2} />
                  </span>
                </span>
                <div className="min-w-0">
                  <Link href={localeHref(locale, profile.careAreaHref)} className={`hero-island inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.8125rem] font-semibold text-brand-800 ring-1 transition-colors hover:text-brand-600 ${style.soft} ${style.ring}`}>
                    <CareAreaIcon name={meta.icon} size={14} strokeWidth={1.9} />
                    {profile.careAreaLabel}
                  </Link>
                  <h1 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.022em] text-brand-900 [text-wrap:balance] rtl:leading-snug rtl:tracking-normal sm:text-[2.5rem]">{profile.name}</h1>
                  {same(profile.specialty, profile.careAreaLabel) ? null : <p className="mt-1.5 text-[1.0625rem] leading-7 text-ink-600">{profile.specialty}</p>}
                </div>
              </div>

              <p className="mt-6 flex gap-2.5 text-[1.0625rem] font-medium leading-7 text-ink-700">
                <GraduationCap size={20} aria-hidden="true" className="mt-1 flex-none text-brand-600" />
                {profile.role}
              </p>

              <p className="mt-4 flex flex-wrap gap-1.5">
                <span title={t.reviewNote} className="hero-island inline-flex items-center gap-1.5 rounded-full bg-surface-default px-3 py-1 text-[0.8125rem] font-semibold text-brand-800 ring-1 ring-border-clinical">
                  <FileText size={14} aria-hidden="true" className="text-brand-600" />
                  {t.verified}
                </span>
                {badges.map((badge) => (
                  <span key={badge} className="hero-island inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-default px-3 py-1 text-[0.8125rem] font-semibold text-brand-800 ring-1 ring-border-card">
                    <Award size={14} aria-hidden="true" className="flex-none text-brand-600" />
                    <bdi className="min-w-0">{badge}</bdi>
                  </span>
                ))}
              </p>

              <p className="lead mt-6 max-w-[62ch]">{profile.summary}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <TrackedLink event="send_case_cta_clicked" className="btn-primary w-full sm:w-auto" href={localeHref(locale, "send-my-case")}>
                  {t.requestReview}
                  <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
                </TrackedLink>
                <Link className="btn-secondary w-full sm:w-auto" href={localeHref(locale, profile.careAreaHref)}>{ui.careArea}</Link>
              </div>
            </div>

            <aside aria-label={t.atAGlance} className="hero-island overflow-hidden rounded-[20px] border border-border-card bg-surface-default shadow-[0_30px_60px_-44px_rgba(36,64,74,0.6)]">
              {/* The specialty banner: the body system's own motif, tint and icon — each Consultant's page reads as their specialty. */}
              <div className={`relative isolate flex h-28 items-end overflow-hidden px-5 pb-4 sm:px-6 ${style.soft}`}>
                <SpecialtyMotif system={meta.system} className="absolute -end-10 -top-12 -z-10 h-56 w-[26rem] opacity-60 [mask-image:linear-gradient(to_left,black_30%,transparent_80%)] rtl:-scale-x-100" />
                <span className="flex items-center gap-3">
                  <span aria-hidden className={`grid h-11 w-11 place-items-center rounded-xl bg-surface-default text-brand-800 shadow-[0_8px_20px_-12px_rgba(36,64,74,0.6)] ring-1 ${style.ring}`}>
                    <CareAreaIcon name={meta.icon} size={21} strokeWidth={1.7} />
                  </span>
                  <span>
                    <span className="block text-[1rem] font-semibold leading-6 text-brand-900">{profile.careAreaLabel}</span>
                    {same(systemTitle, profile.careAreaLabel) ? null : <span className="block text-[0.8125rem] leading-5 text-ink-500">{systemTitle}</span>}
                  </span>
                </span>
              </div>
              <dl className="px-5 py-2 sm:px-6">
                {[
                  profile.distinction ? { icon: Award, label: ui.verifiedRole, value: profile.distinction, sub: "" } : null,
                  latest ? { icon: GraduationCap, label: t.latestQualification, value: latest.head, sub: [latest.rest, latest.year].filter(Boolean).join(" · ") } : null,
                  { icon: MapPin, label: t.basedIn, value: profile.location, sub: "" },
                ].filter((row) => row !== null).map(({ icon: Icon, label, value, sub }) => (
                  <div key={label} className="flex gap-3.5 border-t border-border-subtle py-4 first:border-t-0">
                    <Icon size={18} aria-hidden="true" className="mt-0.5 flex-none text-brand-600" />
                    <div className="min-w-0">
                      <dt className="text-[0.8125rem] font-medium leading-5 text-ink-500">{label}</dt>
                      <dd className="mt-0.5 text-[1rem] font-semibold leading-6 text-brand-900">{value}</dd>
                      {sub ? <dd className="text-[0.875rem] leading-6 text-ink-500">{sub}</dd> : null}
                    </div>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </div>
      </section>

      <div className="bg-surface-default py-14 md:py-16">
        <div className="container-site grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-20">
          <div className="min-w-0 max-w-[50rem]">
            <ProfileSection id="focus" icon={<CareAreaIcon name={meta.icon} size={18} strokeWidth={1.8} />} title={ui.focus}>
              {expertiseTags.length ? (
                <ul aria-label={ui.clinicalExpertise} className="mb-6 flex flex-wrap gap-2">
                  {expertiseTags.map((tag) => (
                    <li key={tag} className={`rounded-full px-3 py-1 text-[0.875rem] font-semibold text-brand-800 ring-1 ${style.soft} ${style.ring}`}>{tag}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {profile.focusAreas.map((item) => (
                  <li key={item} className="flex gap-3 border-t border-border-subtle py-4 text-[1rem] leading-7 text-ink-700">
                    <span aria-hidden className={`mt-2.5 h-2 w-2 flex-none rounded-full ${style.dot}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </ProfileSection>

            {profile.achievements?.length ? (
              <ProfileSection id="highlights" icon={<Award size={18} strokeWidth={1.8} />} title={t.highlights}>
                <ul className="grid">
                  {profile.achievements.map((achievement) => {
                    const Icon = highlightIcon(achievement);
                    return (
                      <li key={achievement} className="flex gap-4 border-t border-border-subtle py-5 first:border-t-0 first:pt-0 last:pb-0">
                        <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand-700 text-white"><Icon size={18} strokeWidth={1.8} /></span>
                        <p className="pt-1.5 text-[1rem] leading-7 text-brand-900">{achievement}</p>
                      </li>
                    );
                  })}
                </ul>
              </ProfileSection>
            ) : null}

            <ProfileSection id="qualifications" icon={<GraduationCap size={18} strokeWidth={1.8} />} title={ui.qualifications}>
              <ol aria-label={t.timeline}>
                {timeline.map((item, index) => {
                  const { head, rest } = splitLine(item.text);
                  return (
                    <li key={item.text} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                      <span className={`pt-0.5 text-[0.9375rem] font-semibold tabular-nums leading-6 ${item.year ? "text-brand-700" : "text-ink-500"}`}>{item.year ?? "—"}</span>
                      <div className={`relative ps-7 ${index < timeline.length - 1 ? "pb-7" : ""}`}>
                        <span aria-hidden className={`absolute start-0 top-[0.4375rem] h-2.5 w-2.5 rounded-full ring-4 ring-surface-default ${index === 0 ? "bg-brand-700" : "bg-brand-300"}`} />
                        {index < timeline.length - 1 ? <span aria-hidden className="absolute start-[0.28125rem] top-5 bottom-0 w-px bg-border-clinical" /> : null}
                        <p className="text-[1rem] font-semibold leading-6 text-brand-900">{head}</p>
                        {rest ? <p className="mt-0.5 text-[0.9375rem] leading-6 text-ink-500">{rest}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </ProfileSection>

            <ProfileSection id="appointments" icon={<Building2 size={18} strokeWidth={1.8} />} title={t.appointmentsTitle}>
              <div className="grid gap-9">
                <div>
                  <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{ui.appointments}</h3>
                  <ul className="mt-4 grid">
                    {profile.appointments.map((item) => <EntryRow key={item} icon={<Building2 size={18} strokeWidth={1.8} />} text={item} />)}
                  </ul>
                </div>
                {profile.professionalStanding.length ? (
                  <div>
                    <h3 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:normal-case rtl:tracking-normal">{ui.standing}</h3>
                    <ul className="mt-4 grid">
                      {profile.professionalStanding.map((item) => <EntryRow key={item} icon={<ShieldCheck size={18} strokeWidth={1.8} />} text={item} />)}
                    </ul>
                  </div>
                ) : null}
              </div>
            </ProfileSection>

            <div className="mt-12 flex gap-3.5 rounded-[14px] bg-surface-pearl p-5 ring-1 ring-border-subtle sm:p-6">
              <BadgeCheck size={20} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 flex-none text-brand-600" />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-semibold text-brand-900">{t.sourcesTitle}</p>
                <p className="mt-1 text-[0.875rem] leading-6 text-ink-600">{profile.verification}</p>
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
            </div>
          </div>

          {/* Desktop rail: where you are on the page, and the one action — phones have the bottom case bar instead. */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 grid gap-8">
              <ProfileSectionNav label={t.onThisPage} sections={sections} />
              <div className="rounded-[18px] border border-border-card bg-surface-pearl p-6">
                <p className="text-[1.125rem] font-semibold leading-snug text-brand-900">{t.reviewTitle}</p>
                <p className="mt-2 text-[0.9375rem] leading-6 text-ink-600">{t.reviewBody}</p>
                <TrackedLink event="send_case_cta_clicked" className="btn-primary mt-5 w-full" href={localeHref(locale, "send-my-case")}>
                  {t.requestReview}
                  <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
                </TrackedLink>
                <ul className="mt-5 grid gap-2.5 border-t border-border-subtle pt-5">
                  {t.reviewPoints.map((point) => (
                    <li key={point} className="flex gap-2.5 text-[0.875rem] leading-6 text-ink-600">
                      <Check size={16} strokeWidth={2.2} aria-hidden="true" className="mt-1 flex-none text-brand-600" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {related.length ? (
        <section aria-labelledby="related-consultants-title" className="border-t border-border-subtle bg-surface-pearl py-14 md:py-16">
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
            <ul className={`mt-7 grid gap-5 ${related.length === 1 ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
              {related.map((p) => {
                const m = careAreaMeta(p.careAreaHref) ?? meta;
                return (
                  <li key={p.slug}>
                    <ConsultantCard
                      featured={related.length === 1}
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
