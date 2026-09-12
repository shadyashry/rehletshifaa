import { ArrowRight, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import type { ConsultantProfile } from "@/lib/consultants";
import { consultantUi } from "@/lib/consultants";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

/**
 * A Consultant's identity mark. With an approved portrait: a consistent chest-up crop on the pale clinical
 * ground. Without one: a deliberately designed monogram on the same ground — never an empty image slot,
 * and never an internal approval state shown to patients. Decorative beside the visible name.
 */
export function ConsultantPortrait({ profile, size = "md" }: { profile: ConsultantProfile; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-28 w-28 text-[1.75rem]" : size === "md" ? "h-14 w-14 text-[1.1rem]" : "h-12 w-12 text-[0.95rem]";
  if (profile.portrait) {
    return (
      <span className={`relative block flex-none overflow-hidden rounded-full bg-surface-clinical ring-1 ring-border-clinical ${box}`}>
        <Image src={profile.portrait.src} alt="" fill sizes="128px" className="object-cover object-top" />
      </span>
    );
  }
  return (
    <span aria-hidden className={`grid flex-none place-items-center rounded-full bg-surface-clinical font-semibold tracking-[0.04em] text-brand-800 ring-1 ring-border-clinical ${box}`}>
      {profile.initials}
    </span>
  );
}

/** A dot-separated inline list for the quiet metadata line: MD · EBAC · FEBIC. */
function DotList({ items, className = "" }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={className}>
      {items.map((item, i) => (
        <li key={item} className="inline">
          {item}
          {i < items.length - 1 && <span aria-hidden className="mx-2 inline-block h-1 w-1 translate-y-[-0.2em] rounded-full bg-brand-400" />}
        </li>
      ))}
    </ul>
  );
}

const Stem = () => <span className="block h-3.5 w-px bg-brand-400 transition-colors group-hover:bg-brand-500" />;
const Tie = () => <span className="mx-1 h-px w-3 flex-none bg-brand-400 transition-colors group-hover:bg-brand-500 sm:w-4 xl:w-3" />;
const Dot = () => <span className="h-2 w-2 flex-none rounded-full border border-brand-500 bg-surface-elevated" />;

/**
 * The expertise map: one verified clinical anchor with its verified related areas around it — top, start,
 * end and (when there is a fourth) bottom. Qualitative only: scope and relationship, never rank, score or
 * volume. The same facts are given to assistive technology as one sentence; the drawing is decorative.
 */
export function ExpertiseMap({ expertise, label }: { expertise: ConsultantProfile["expertise"]; label: string }) {
  const [top, start, end, bottom] = expertise.areas;
  const text = "text-[0.875rem] font-medium leading-[1.15rem] text-brand-900 xl:text-[0.8125rem]";
  const anchor = "max-w-[6.5rem] rounded-full bg-brand-600 px-3 py-1.5 text-center text-[0.8rem] font-semibold leading-4 text-white transition-colors group-hover:bg-brand-700";
  return (
    <div className="mt-4 min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="sr-only" data-expertise>
        {expertise.anchor}: {expertise.areas.join(", ")}.
      </p>
      {/* Phones: the anchor above and the areas beneath one bracket. */}
      <div aria-hidden className="mt-2.5 select-none rounded-[10px] bg-surface-clinical/60 px-3 py-3 sm:hidden">
        <div className="flex flex-col items-center">
          <span className={anchor}>{expertise.anchor}</span>
          <Stem />
        </div>
        <div className="mx-[25%] h-px bg-brand-400" />
        <ul className="grid grid-cols-2 gap-x-3">
          {expertise.areas.map((area) => (
            <li key={area} className="flex flex-col items-center">
              <span className="block h-2.5 w-px bg-brand-400" />
              <Dot />
              <span className={`mt-1 text-center ${text}`}>{area}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* From sm: the cross — anchor in the centre, areas around it. */}
      <div aria-hidden className="mt-2.5 hidden select-none flex-col justify-center rounded-[10px] bg-surface-clinical/60 px-2 py-3 sm:flex sm:min-h-[12rem] xl:px-1.5">
        {top && (
          <div className="flex flex-col items-center gap-1">
            <span className={`max-w-[10rem] text-center ${text}`}>{top}</span>
            <Dot />
            <Stem />
          </div>
        )}
        <div className="flex items-center">
          <span className={`min-w-0 flex-1 text-end ${text}`}>{start}</span>
          <span className="ms-1.5 flex items-center"><Dot /><Tie /></span>
          <span className={anchor}>{expertise.anchor}</span>
          <span className="me-1.5 flex items-center"><Tie /><Dot /></span>
          <span className={`min-w-0 flex-1 text-start ${text}`}>{end}</span>
        </div>
        {bottom && (
          <div className="flex flex-col items-center gap-1">
            <Stem />
            <Dot />
            <span className={`max-w-[10rem] text-center ${text}`}>{bottom}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** One verified appointment or role, set editorially on a thin accent — never a badge. */
function VerifiedRole({ text, label }: { text: string; label: string }) {
  return (
    <div className="mt-4 border-s-2 border-brand-500 ps-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-[0.95rem] font-medium leading-6 text-brand-900">{text}</p>
    </div>
  );
}

/**
 * The profile panel: identity, clinical pathway, the expertise map, one verified role, a line of evidence,
 * the strongest signals, location, and one way to read more. `wide` lays the two halves side by side (the
 * third panel on a two-column row); from xl the panels sit in one shared editorial section.
 */
export function ConsultantProfileCard({ profile, locale, wide = false }: { profile: ConsultantProfile; locale: Locale; wide?: boolean }) {
  const ui = consultantUi[locale];
  const identity: ReactNode = (
    <div className="flex items-center gap-3.5">
      <ConsultantPortrait profile={profile} />
      <div className="min-w-0">
        <p className="eyebrow">{profile.careAreaLabel}</p>
        <h2 className="mt-1 text-[1.3rem] font-semibold leading-[1.25] tracking-[-0.01em] text-brand-900 xl:text-[1.375rem]">{profile.name}</h2>
        <p className="mt-0.5 text-[1rem] leading-6 text-ink-700">{profile.specialty}</p>
      </div>
    </div>
  );
  return (
    <article className={`group relative flex h-full min-w-0 flex-col p-6 sm:p-7 xl:p-6 ${wide ? "lg:grid lg:grid-cols-2 lg:gap-x-10 xl:flex" : ""}`}>
      <div className="min-w-0">
        {identity}
        <ExpertiseMap expertise={profile.expertise} label={ui.clinicalExpertise} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {profile.distinction && <VerifiedRole text={profile.distinction} label={ui.verifiedRole} />}
        <p className="mt-4 text-[0.95rem] leading-6 text-ink-600">{profile.cardSummary}</p>
        {/* Signals, location and the action stand together on one bottom baseline across the row. */}
        <div className="mt-auto pt-4">
          <DotList items={profile.signals} className="text-[0.9rem] font-semibold leading-5 text-brand-800" />
          <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] leading-5 text-ink-500">
            <MapPin size={15} strokeWidth={1.8} className="flex-none text-brand-600" aria-hidden="true" />
            {profile.location}
          </p>
          <Link
            href={localeHref(locale, `consultants/${profile.slug}`)}
            aria-label={ui.viewProfileOf(profile.name)}
            className="link-cta mt-3 min-h-11 text-[0.95rem] after:absolute after:inset-0"
          >
            {ui.viewProfile}
            <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The care-area pages' single Consultant introduction, on the same language. */
export function ConsultantSpotlight({ profile, locale }: { profile: ConsultantProfile; locale: Locale }) {
  const ui = consultantUi[locale];
  return (
    <article className="rounded-[12px] border border-border-card bg-surface-elevated p-6 sm:p-8">
      <div className="md:grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-x-10">
        <div>
          <div className="flex items-start gap-5">
            <ConsultantPortrait profile={profile} size="lg" />
            <div className="min-w-0">
              <p className="eyebrow">{ui.meetConsultant}</p>
              <h2 className="mt-1.5 text-[1.5rem] font-semibold leading-[1.2] tracking-[-0.012em] text-brand-900 sm:text-[1.75rem]">{profile.name}</h2>
              <p className="mt-1 text-[1rem] leading-6 text-ink-700">{profile.specialty}</p>
              <div className="mt-3"><DotList items={profile.signals} className="text-[0.9rem] font-semibold leading-5 text-brand-800" /></div>
            </div>
          </div>
          {profile.distinction && <VerifiedRole text={profile.distinction} label={ui.verifiedRole} />}
          <p className="mt-4 max-w-[64ch] text-[1rem] leading-7 text-ink-600">{profile.summary}</p>
          <Link className="link-cta mt-4 text-[0.95rem]" href={localeHref(locale, `consultants/${profile.slug}`)} aria-label={ui.viewProfileOf(profile.name)}>
            {ui.viewProfile}
            <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
          </Link>
        </div>
        <div className="group mt-2 md:mt-0"><ExpertiseMap expertise={profile.expertise} label={ui.clinicalExpertise} /></div>
      </div>
    </article>
  );
}
