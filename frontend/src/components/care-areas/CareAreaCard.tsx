import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { AtlasArea } from "@/lib/care-area-catalog";
import { CareAreaIcon, SYSTEM_STYLES } from "./CareAreaIcon";

const MAX_MONOGRAMS = 3;

/**
 * One care area in the atlas: system-tinted icon well, title, body, three sub-area facets and the named
 * Consultants who lead it (monograms — never portraits we have not approved). The whole card is the link;
 * it is also the target of the care-network node above, so it lights up when reached from there.
 */
export function CareAreaCard({ area, href, action, consultantsLabel, wide }: {
  area: AtlasArea;
  href: string;
  action: string;
  consultantsLabel: string;
  wide: boolean;
}) {
  const system = SYSTEM_STYLES[area.system];
  const shown = area.consultants.slice(0, MAX_MONOGRAMS);
  const more = area.consultants.length - shown.length;

  return (
    <li
      id={`area-${area.slug}`}
      className={`group relative isolate flex scroll-mt-28 flex-col overflow-hidden rounded-[16px] border border-border-card bg-surface-default p-6 shadow-[0_1px_2px_rgba(36,64,74,0.04)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_22px_44px_-28px_rgba(36,64,74,0.45)] has-[a:focus-visible]:border-brand-500 target:border-brand-400 target:ring-4 target:ring-brand-100 motion-reduce:transform-none sm:p-7 ${wide ? "sm:col-span-2" : ""}`}
    >
      <CareAreaIcon
        name={area.icon}
        strokeWidth={0.75}
        className={`pointer-events-none absolute -end-2 -top-3 -z-10 h-32 w-32 opacity-[0.13] transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none ${system.line}`}
      />
      <span aria-hidden className={`grid h-12 w-12 place-items-center rounded-2xl text-brand-800 ring-1 ${system.well} ${system.ring}`}>
        <CareAreaIcon name={area.icon} size={22} strokeWidth={1.7} />
      </span>

      <h4 className="mt-5 text-[1.1875rem] font-semibold leading-[1.3] tracking-[-0.01em] text-brand-900 [text-wrap:balance] rtl:tracking-normal sm:text-[1.25rem]">{area.title}</h4>
      <p className={`mt-2 text-[0.95rem] leading-6 text-ink-600 sm:text-[1rem] sm:leading-7 ${wide ? "max-w-[62ch]" : ""}`}>{area.body}</p>

      <p className="mt-4 flex flex-wrap gap-1.5">
        {area.facets.map((facet) => (
          <span key={facet} className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-pearl px-2.5 py-1 text-[0.8125rem] leading-5 text-ink-700">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${system.dot}`} />
            {facet}
          </span>
        ))}
      </p>

      <div className="mt-auto pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-4">
          {area.consultants.length > 0 ? (
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex -space-x-2 rtl:space-x-reverse">
                {shown.map((profile) => (
                  <span key={profile.slug} className={`grid h-8 w-8 place-items-center rounded-full text-[0.68rem] font-semibold tracking-[0.03em] text-brand-800 ring-2 ring-surface-default ${system.well}`}>
                    {profile.initials}
                  </span>
                ))}
                {more > 0 ? (
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-pearl text-[0.68rem] font-semibold text-ink-600 ring-2 ring-surface-default">+{more}</span>
                ) : null}
              </span>
              <span className="text-[0.8125rem] font-medium leading-5 text-ink-500">{consultantsLabel}</span>
            </div>
          ) : <span />}
          <Link href={href} className="link-cta min-h-11 text-[0.95rem] after:absolute after:inset-0">
            {action}
            <span className="sr-only"> — {area.title}</span>
            <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}
