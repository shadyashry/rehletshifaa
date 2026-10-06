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
