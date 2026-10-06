import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { CareAreaIcon } from "@/components/care-areas/CareAreaIcon";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

export type GridArea = { slug: string; href: string; title: string };
export type GridPerson = { slug: string; initials: string; portrait?: { src: string; alt: string } };
export type GridSystem = {
  key: CareSystem;
  icon: CareAreaIconName;
  title: string;
  body: string;
  areas: readonly GridArea[];
  people: readonly GridPerson[];
  /** "Dr A and Dr B", "Dr A, Dr B and 2 more" — already phrased for the locale. */
  ledBy: string;
};

const SHOWN_FACES = 3;

/** Each system's tone, from the active theme's system tokens; themes without a deep shade fall back to the brand ink. */
const tone = (key: CareSystem) =>
  ({
    "--sys": `var(--color-system-${key}-line)`,
    "--sys-well": `var(--color-system-${key}-well)`,
    "--sys-ring": `var(--color-system-${key}-ring)`,
    "--sys-deep": `var(--sys-${key}-deep, var(--color-brand-800))`,
  }) as CSSProperties;

/**
 * The six body systems, all visible at once — nothing hidden behind a click. Each is one calm white card in the same
 * shape: the system's icon and name, a line on what it covers, its care areas as links, and at the foot the named
 * Consultants who lead it. The system's tone appears only in the icon, the faces' initials and the hover state; the
 * cards share one height per row and the Consultants always sit on the same baseline.
 */
export function CareSystemsGrid({ systems, ledByLabel }: { systems: readonly GridSystem[]; ledByLabel: string }) {
  return (
    <ul className="care-grid mt-7 grid gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
      {systems.map((system) => (
        <li key={system.key} style={tone(system.key)} className="care-grid-card flex flex-col rounded-[12px] border bg-surface-default p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="care-grid-icon grid h-10 w-10 flex-none place-items-center rounded-full">
              <CareAreaIcon name={system.icon} size={19} strokeWidth={1.7} />
            </span>
            <h3 className="text-[1.125rem] font-semibold leading-snug text-brand-900">{system.title}</h3>
          </div>
          <p className="mt-3 text-[0.9375rem] leading-6 text-ink-600 line-clamp-2">{system.body}</p>

          <ul className="mt-4 border-t border-border-subtle">
            {system.areas.map((area) => (
              <li key={area.slug} className="border-b border-border-subtle">
                <Link
                  href={area.href}
                  className="care-grid-area group flex items-center justify-between gap-3 py-2.5 text-[0.9375rem] font-semibold leading-6 text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span className="min-w-0">{area.title}</span>
                  <ArrowRight size={16} aria-hidden="true" className="care-grid-arrow flex-none rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>

          {system.people.length > 0 ? (
            <div className="mt-auto flex items-center gap-3 pt-5">
              <span aria-hidden className="flex flex-none gap-1">
                {system.people.slice(0, SHOWN_FACES).map((person) =>
                  person.portrait ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small, fixed-size approved portrait
                    <img key={person.slug} src={person.portrait.src} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <span key={person.slug} className="care-grid-face grid h-9 w-9 place-items-center rounded-full text-[0.6875rem] font-semibold tracking-[0.03em]">
                      {person.initials}
                    </span>
                  ),
                )}
                {system.people.length > SHOWN_FACES ? (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-pearl text-[0.6875rem] font-semibold text-ink-600">
                    +{system.people.length - SHOWN_FACES}
                  </span>
                ) : null}
              </span>
              <p className="min-w-0 text-[0.8125rem] leading-5 text-ink-500">
                {ledByLabel} <span className="font-semibold text-ink-700">{system.ledBy}</span>
              </p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
