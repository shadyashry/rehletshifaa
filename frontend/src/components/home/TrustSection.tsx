import { FileLock2, Siren, Stethoscope, UserCheck } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import { SectionHeader } from "@/components/SectionHeader";

const ICONS = [Stethoscope, FileLock2, UserCheck, Siren] as const;

/**
 * Privacy and clinical-governance commitments. Every statement here describes
 * behaviour the platform actually implements — no certifications, statistics,
 * or endorsements are claimed.
 */
export function TrustSection({ d }: { d: Dictionary }) {
  return (
    <section className="section-tight bg-mist border-t border-line">
      <div className="container-site">
        <SectionHeader eyebrow={d.home.trustEyebrow} title={d.home.trustTitle} intro={d.home.trustIntro} />

        <ul className="mt-5 grid gap-x-12 gap-y-3 sm:mt-7 sm:grid-cols-2 sm:gap-y-5">
          {d.home.trust.map((item, index) => {
            const Icon = ICONS[index] ?? Stethoscope;
            return (
              <li key={item.title} className="border-t border-line pt-3 sm:pt-4">
                <div className="flex items-center gap-3">
                  <Icon size={18} strokeWidth={1.8} className="flex-none text-accent-700" aria-hidden="true" />
                  <h3 className="text-[0.98rem] font-semibold leading-6 text-brand-900 sm:text-[1rem]">{item.title}</h3>
                </div>
                <p className="mt-1 text-[0.88rem] leading-6 text-ink-500 sm:mt-1.5">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
