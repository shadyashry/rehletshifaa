import { ArrowRight, Award, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { ConsultantPortrait } from "@/components/ConsultantProfileCard";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";
import type { ConsultantProfile } from "@/lib/consultants";

/**
 * One Consultant on the panel: a body-system tinted header (identity mark, care area, credential signals),
 * then name, specialty, verified role, one professional distinction, three clinical-focus facets and the
 * location. The whole card opens the full profile; no ratings, rankings or superlatives.
 */
export function ConsultantCard({ profile, system, icon, href, labels }: {
  profile: ConsultantProfile;
  system: CareSystem;
  icon: CareAreaIconName;
  href: string;
  labels: { view: string; viewOf: string; distinction: string; focus: string };
}) {
  const style = SYSTEM_STYLES[system];
  // Short marks (MD · EBAC · FEBIC) read as badges; a long signal is shown alone so the header stays calm.
  const short = profile.signals.filter((signal) => signal.length <= 8);
  const signals = short.length > 0 ? short.slice(0, 3) : profile.signals.slice(0, 1);
  return (
    <article className="group relative isolate flex h-full flex-col overflow-hidden rounded-[18px] border border-border-card bg-surface-default shadow-[0_1px_2px_rgba(36,64,74,0.04)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_22px_44px_-28px_rgba(36,64,74,0.45)] has-[a:focus-visible]:border-brand-500 motion-reduce:transform-none">
      <div className={`relative flex items-start justify-between gap-4 px-6 pb-5 pt-6 sm:px-7 ${style.soft}`}>
        <CareAreaIcon name={icon} strokeWidth={0.8} className={`pointer-events-none absolute end-3 top-3 -z-10 h-24 w-24 opacity-[0.16] ${style.line}`} />
        <ConsultantPortrait profile={profile} />
        {signals.length > 0 ? (
          <p className="flex min-w-0 max-w-[65%] flex-wrap justify-end gap-1">
            {signals.map((signal) => (
              <bdi key={signal} title={signal} className="block max-w-[11rem] truncate sm:max-w-[13rem] rounded-md bg-surface-default/90 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-[0.04em] text-brand-800 ring-1 ring-border-card rtl:tracking-normal">
                {signal}
              </bdi>
            ))}
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-5 sm:px-7">
        <p className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold leading-5 text-brand-700">
          <CareAreaIcon name={icon} size={14} strokeWidth={1.8} />
          {profile.careAreaLabel}
        </p>
        <h4 className="mt-1.5 text-[1.1875rem] font-semibold leading-[1.3] tracking-[-0.01em] text-brand-900 [text-wrap:balance] rtl:tracking-normal">{profile.name}</h4>
        {profile.specialty !== profile.careAreaLabel ? <p className="mt-1 text-[0.9375rem] leading-6 text-ink-500">{profile.specialty}</p> : null}

        <p className="mt-4 flex gap-2.5 text-[0.9375rem] leading-6 text-ink-700">
          <GraduationCap size={18} aria-hidden="true" className="mt-0.5 flex-none text-brand-600" />
          {profile.role}
        </p>

        {profile.distinction ? (
          <div className="mt-4 border-s-2 border-brand-400 ps-3.5">
            <p className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-500 rtl:normal-case rtl:tracking-normal">
              <Award size={13} aria-hidden="true" />
              {labels.distinction}
            </p>
            <p className="mt-1 text-[0.9375rem] font-medium leading-6 text-brand-900">{profile.distinction}</p>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-500 rtl:normal-case rtl:tracking-normal">{labels.focus}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {profile.focusAreas.slice(0, 3).map((focus) => (
              <li key={focus} className="inline-flex items-start gap-1.5 rounded-lg border border-border-subtle bg-surface-pearl px-2.5 py-1 text-[0.8125rem] leading-5 text-ink-700">
                <span aria-hidden className={`mt-[0.45rem] h-1.5 w-1.5 flex-none rounded-full ${style.dot}`} />
                {focus}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border-subtle pt-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-ink-500">
              <MapPin size={14} aria-hidden="true" />
              {profile.location}
            </p>
            <Link href={href} aria-label={labels.viewOf} className="link-cta min-h-11 text-[0.9375rem] after:absolute after:inset-0">
              {labels.view}
              <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
