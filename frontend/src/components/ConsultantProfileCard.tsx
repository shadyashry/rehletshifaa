import Image from "next/image";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";
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

/** Satellite chip positions around the hub, in reading order: top-start, top-end, bottom-end, bottom-start. */
const CORNERS = [
  { cell: "col-start-1 row-start-1 justify-self-start", spoke: "M50 50 C44 40, 34 24, 24 16" },
  { cell: "col-start-2 row-start-1 justify-self-end", spoke: "M50 50 C56 40, 66 24, 76 16" },
  { cell: "col-start-2 row-start-3 justify-self-end", spoke: "M50 50 C56 60, 66 76, 76 84" },
  { cell: "col-start-1 row-start-3 justify-self-start", spoke: "M50 50 C44 60, 34 76, 24 84" },
] as const;

/**
 * The specialty map: the Consultant's clinical anchor as a hub — the specialty icon on a solid disc inside
 * soft concentric rings in the body system's tint, the anchor named in a caption below — and up to four
 * related focus areas as chips at the corners, joined to the hub by curved spokes. Qualitative only: scope
 * and relationship, never rank, score or volume. Phones keep the hub and set the chips in a 2×2 grid.
 * The drawing is decorative; one sr-only sentence carries the same facts.
 */
export function ExpertiseMap({ expertise, label, icon, system }: {
  expertise: ConsultantProfile["expertise"];
  label: string;
  icon: CareAreaIconName;
  system: CareSystem;
}) {
  const style = SYSTEM_STYLES[system];
  const areas = expertise.areas.slice(0, 4);
  const chip = `rounded-xl bg-surface-default px-3 py-2 text-[0.8125rem] font-medium leading-[1.15rem] text-brand-900 shadow-[0_6px_16px_-12px_rgba(36,64,74,0.5)] ring-1 ${style.ring}`;
  const hub = (
    <div className="flex flex-col items-center">
      <span className="relative grid h-[5.5rem] w-[5.5rem] place-items-center">
        <span className={`absolute inset-0 rounded-full opacity-60 ${style.well}`} />
        <span className={`absolute inset-[0.6rem] rounded-full ring-1 ${style.ring} bg-surface-default/70`} />
        <span className="relative grid h-12 w-12 place-items-center rounded-full bg-brand-700 text-white shadow-[0_10px_24px_-10px_rgba(31,107,115,0.8)]">
          <CareAreaIcon name={icon} size={22} strokeWidth={1.8} />
        </span>
      </span>
      <span className="relative mt-2 max-w-[11rem] rounded-lg bg-surface-default/95 px-2.5 py-1 text-center text-[0.8125rem] font-semibold leading-[1.15rem] text-brand-800 shadow-[0_4px_12px_-8px_rgba(36,64,74,0.4)] [text-wrap:balance]">{expertise.anchor}</span>
    </div>
  );

  return (
    <div className="mt-4 min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="sr-only" data-expertise>
        {expertise.anchor}: {expertise.areas.join(", ")}.
      </p>

      {/* Phones: the hub, then the focus areas as a 2×2 grid of chips. */}
      <div aria-hidden className={`mt-3 select-none rounded-[16px] px-4 py-5 sm:hidden ${style.soft}`}>
        {hub}
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {areas.map((area) => (
            <li key={area} className={`${chip} flex items-start gap-2`}>
              <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${style.dot}`} />
              {area}
            </li>
          ))}
        </ul>
      </div>

      {/* From sm: the hub in the centre, focus areas at the corners, curved spokes between them. */}
      <div aria-hidden className={`relative mt-3 hidden select-none overflow-hidden rounded-[16px] px-3 py-5 sm:block ${style.soft}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full rtl:-scale-x-100">
          {areas.map((area, i) => (
            <path key={area} d={CORNERS[i].spoke} fill="none" className="stroke-brand-400" strokeWidth="1.25" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="relative grid grid-cols-2 grid-rows-[auto_auto_auto] gap-x-4 gap-y-3">
          {areas.map((area, i) => (
            <span key={area} className={`${chip} inline-flex max-w-[12.5rem] items-start gap-2 text-start ${CORNERS[i].cell}`}>
              <span className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${style.dot}`} />
              <span>{area}</span>
            </span>
          ))}
          <div className="col-span-2 row-start-2 flex items-center justify-center py-1">{hub}</div>
        </div>
      </div>
    </div>
  );
}
