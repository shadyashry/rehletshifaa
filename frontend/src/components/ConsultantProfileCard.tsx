import Image from "next/image";

import type { ConsultantProfile } from "@/lib/consultants";

/**
 * A Consultant's identity mark. With an approved portrait: a consistent chest-up crop on the pale clinical
 * ground. Without one: a deliberately designed monogram on the same ground — never an empty image slot,
 * and never an internal approval state shown to patients. Decorative beside the visible name.
 */
export function ConsultantPortrait({ profile, size = "md" }: { profile: ConsultantProfile; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-28 w-28 text-[1.75rem]" : size === "md" ? "h-14 w-14 text-[1.1rem]" : "h-12 w-12 text-[0.9375rem]";
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
  const anchor = "max-w-[8.5rem] rounded-full [hyphens:auto] [overflow-wrap:break-word] bg-brand-600 px-3 py-1.5 text-center text-[0.8125rem] font-semibold leading-4 text-white transition-colors group-hover:bg-brand-700";
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
