import { FileLock2, Siren, Stethoscope, UserCheck } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";

const ICONS = [Stethoscope, FileLock2, UserCheck, Siren] as const;

/**
 * Privacy and clinical governance, said quietly on the pearl canvas: the heading and one short statement
 * in the narrow column, centred against the four commitments set as an editorial 2×2 matrix in the wide
 * one — hairline-topped entries, a small icon, a short heading and one sentence; no cards, no legal
 * register. Phone: the same entries as one compact column. Every statement describes behaviour the
 * platform actually implements; no certifications, statistics or endorsements are claimed.
 */
export function TrustSection({ d }: { d: Dictionary }) {
  return (
    <section className="bg-surface-pearl py-[clamp(2.5rem,1.9rem+1.8vw,3.75rem)]">
      <div className="container-site grid gap-7 sm:gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow">{d.home.trustEyebrow}</p>
          <h2 className="headline mt-2 max-w-[16ch] rtl:max-w-[24ch] [text-wrap:balance]">{d.home.trustTitle}</h2>
          <p className="statement mt-4 max-w-[22ch] rtl:max-w-[28ch] sm:mt-5">{d.home.trustIntro}</p>
        </div>

        <ul className="grid gap-y-5 sm:grid-cols-2 sm:gap-x-9 sm:gap-y-0 lg:gap-x-10">
          {d.home.trust.map((item, index) => {
            const Icon = ICONS[index] ?? Stethoscope;
            return (
              <li key={item.title} className="border-t border-border-subtle pt-4 sm:row-span-2 sm:grid sm:grid-rows-subgrid sm:pt-5 sm:[&:nth-child(n+3)]:mt-7">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-elevated text-brand-700 ring-1 ring-border-subtle">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <h3 className="text-[1.0625rem] font-semibold leading-6 text-brand-900 lg:text-[1.125rem]">{item.title}</h3>
                </div>
                <p className="mt-2 max-w-[38ch] text-[0.95rem] leading-6 text-ink-600 sm:mt-2.5 sm:text-[1rem] sm:leading-7">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
