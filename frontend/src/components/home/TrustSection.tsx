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
    <section className="section section-soft">
      <div className="container-site">
        <SectionHeader eyebrow={d.home.trustEyebrow} title={d.home.trustTitle} intro={d.home.trustIntro} />

        <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {d.home.trust.map((item, index) => {
            const Icon = ICONS[index] ?? Stethoscope;
            return (
              <li key={item.title} className="border-t border-line-strong pt-6">
                <div className="flex items-center gap-3">
                  <Icon size={20} strokeWidth={1.8} className="text-accent-700" aria-hidden="true" />
                  <h3 className="title">{item.title}</h3>
                </div>
                <p className="mt-3 text-[0.95rem] leading-7 text-ink-500">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
