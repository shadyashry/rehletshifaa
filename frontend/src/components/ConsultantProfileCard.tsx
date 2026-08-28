import { ArrowRight, BadgeCheck, MapPin, UserRound } from "lucide-react";
import Link from "next/link";

import type { ConsultantProfile } from "@/lib/consultants";
import { consultantUi } from "@/lib/consultants";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

export function ConsultantPortrait({ profile, locale, compact = false }: { profile: ConsultantProfile; locale: Locale; compact?: boolean }) {
  const ui = consultantUi[locale];
  return (
    <div className={`relative grid place-items-center overflow-hidden bg-gradient-to-br from-brand-50 via-wash-aqua to-wash-lavender ${compact ? "min-h-52" : "aspect-[4/3]"}`} role="img" aria-label={`${profile.name} — ${ui.noPhoto}`}>
      <span className="grid h-24 w-24 place-items-center rounded-full border border-white/80 bg-white/75 text-3xl font-bold text-brand-800 shadow-sm backdrop-blur">
        {profile.initials}
      </span>
      <span className="absolute bottom-4 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-ink-500 backdrop-blur">
        {ui.noPhoto}
      </span>
    </div>
  );
}

export function ConsultantProfileCard({ profile, locale }: { profile: ConsultantProfile; locale: Locale }) {
  const ui = consultantUi[locale];
  return (
    <article className="card flex h-full flex-col overflow-hidden">
      <ConsultantPortrait profile={profile} locale={locale} />
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <p className="eyebrow">{profile.careAreaLabel}</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight text-brand-900">{profile.name}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-accent-800">{profile.credentials}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.achievementBadges.map((badge) => (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-wash-aqua px-3 py-1.5 text-xs font-bold text-brand-800" key={badge}>
              <BadgeCheck size={14} className="text-accent-700" aria-hidden="true" />
              {badge}
            </span>
          ))}
        </div>
        <p className="mt-4 leading-7 text-ink-600">{profile.summary}</p>
        <div className="mt-5 flex items-start gap-2 text-sm leading-6 text-ink-500">
          <MapPin size={16} className="mt-1 shrink-0 text-accent-700" aria-hidden="true" />
          {profile.location}
        </div>
        <Link className="mt-auto inline-flex items-center gap-2 pt-7 font-bold text-brand-700 hover:text-brand-900" href={localeHref(locale, `consultants/${profile.slug}`)}>
          <BadgeCheck size={18} aria-hidden="true" />
          {ui.viewProfile}
          <ArrowRight size={17} className="rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function ConsultantSpotlight({ profile, locale }: { profile: ConsultantProfile; locale: Locale }) {
  const ui = consultantUi[locale];
  return (
    <article className="card overflow-hidden">
      <div className="grid md:grid-cols-[0.72fr_1.28fr]">
        <ConsultantPortrait profile={profile} locale={locale} compact />
        <div className="p-6 sm:p-8">
          <p className="eyebrow">{ui.meetConsultant}</p>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">{profile.name}</h2>
          <p className="mt-2 font-semibold leading-6 text-accent-800">{profile.specialty}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.achievementBadges.slice(0, 3).map((badge) => (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-wash-aqua px-3 py-1.5 text-xs font-bold text-brand-800" key={badge}>
                <BadgeCheck size={14} className="text-accent-700" aria-hidden="true" />
                {badge}
              </span>
            ))}
          </div>
          <p className="mt-4 leading-7 text-ink-600">{profile.summary}</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {profile.focusAreas.slice(0, 4).map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-6 text-ink-700">
                <UserRound size={15} className="mt-1 shrink-0 text-accent-700" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <Link className="mt-6 inline-flex items-center gap-2 font-bold text-brand-700 hover:text-brand-900" href={localeHref(locale, `consultants/${profile.slug}`)}>
            <BadgeCheck size={18} aria-hidden="true" />
            {ui.viewProfile}
          </Link>
        </div>
      </div>
    </article>
  );
}
