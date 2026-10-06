"use client";

import { ArrowRight, Compass } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import { CareAreaIcon } from "@/components/care-areas/CareAreaIcon";
import { TrackedLink } from "@/components/TrackedLink";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

export type SelectorArea = {
  slug: string;
  href: string;
  title: string;
  short: string;
  /** What the area covers, as separate terms (shown as tags where the theme asks for them). */
  facets: readonly string[];
  icon: CareAreaIconName;
  consultants: string;
  /** Initials of the Consultants who lead this area. */
  people: readonly string[];
};
export type SelectorSystem = {
  key: CareSystem;
  title: string;
  body: string;
  meta: string;
  monograms: readonly string[];
  more: number;
  consultants: string;
  /** The Consultants' names, already joined for reading ("Dr A, Dr B and 2 more"). */
  names: string;
  areas: readonly SelectorArea[];
};
export type SelectorCopy = {
  listLabel: string;
  ledBy: string;
  unsure: string;
  unsureAction: string;
  sendHref: string;
  /** Panel footer: "{system}" is replaced by the chosen system's name. */
  nextTitle: string;
  nextBody: string;
  nextAction: string;
};

/** Each system's tone, from the active theme's system tokens; themes without a deep shade fall back to the brand ink. */
const tone = (key: CareSystem) =>
  ({
    "--sys": `var(--color-system-${key}-line)`,
    "--sys-well": `var(--color-system-${key}-well)`,
    "--sys-ring": `var(--color-system-${key}-ring)`,
    "--sys-deep": `var(--sys-${key}-deep, var(--color-brand-800))`,
  }) as CSSProperties;

/**
 * The care areas as a selector, not an index: the six body systems as one calm numbered list, and beside it only the
 * chosen system — what it covers, the named Consultants behind it, and its care areas as clear rows. Six choices
 * instead of twenty-odd things at once; the colour follows the selection. "Not sure which one fits?" is always one
 * step away, because many patients do not know their specialty — the coordinator routes the case.
 * WAI-ARIA tabs with automatic activation: arrows (either axis), Home and End move between systems. On phones the
 * list becomes a row of chips that scrolls sideways above the panel. All panels are rendered (hidden when inactive),
 * so every care-area link stays in the document.
 */
export function CareSelector({ systems, copy }: { systems: readonly SelectorSystem[]; copy: SelectorCopy }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  const select = (index: number) => {
    const next = (index + systems.length) % systems.length;
    setActive(next);
    tabs.current[next]?.focus();
    // Phones: bring a chip scrolled off the row into view (a no-op where the list is already fully visible).
    tabs.current[next]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = document.documentElement.dir === "rtl";
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
    if (event.key in step) select(index + step[event.key]);
    else if (event.key === "Home") select(0);
    else if (event.key === "End") select(systems.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div className="care-selector mt-7 grid gap-5 sm:mt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
      <div className="min-w-0">
        <div
          role="tablist"
          aria-label={copy.listLabel}
          className="care-selector-list -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {systems.map((system, index) => {
            const selected = index === active;
            return (
              <button
                key={system.key}
                ref={(node) => { tabs.current[index] = node; }}
                id={`${id}-tab-${system.key}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`${id}-panel-${system.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                style={tone(system.key)}
                data-selected={selected}
                className="care-selector-tab group relative flex flex-none snap-start items-center gap-3 rounded-full border px-3.5 py-2 text-start transition-[background-color,border-color,box-shadow,color] duration-200 lg:rounded-[10px] lg:px-4 lg:py-3.5"
              >
                <span aria-hidden className="care-selector-index text-[0.8125rem] font-semibold tabular-nums lg:text-[0.9375rem]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="care-selector-title block whitespace-nowrap text-[0.9375rem] font-semibold leading-6 lg:whitespace-normal lg:text-[1.0625rem]">{system.title}</span>
                  <span className="hidden text-[0.8125rem] leading-5 text-ink-500 lg:block">{system.meta}</span>
                </span>
                <ArrowRight size={16} aria-hidden="true" className="care-selector-arrow hidden flex-none rtl:-scale-x-100 lg:block" />
              </button>
            );
          })}
        </div>

        <TrackedLink
          event="send_case_cta_clicked"
          href={copy.sendHref}
          className="care-selector-unsure group mt-3 hidden items-start gap-3 rounded-[10px] border border-dashed border-line-strong px-4 py-3.5 transition-colors hover:border-brand-600 lg:flex"
        >
          <Compass size={18} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 flex-none text-brand-600" />
          <span className="min-w-0 flex-1 text-[0.9375rem] leading-6 text-ink-700">
            <strong className="block font-semibold text-brand-900">{copy.unsure}</strong>
            {copy.unsureAction}
          </span>
        </TrackedLink>
      </div>

      {systems.map((system, index) => (
        <section
          key={system.key}
          id={`${id}-panel-${system.key}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${system.key}`}
          hidden={index !== active}
          style={tone(system.key)}
          className="care-selector-panel min-w-0 overflow-hidden rounded-[14px] border bg-surface-default"
        >
          <div className="care-selector-panel-head relative px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
            {/* The system's mark, drawn large and faint: each system gets its own identity (shown where the theme asks). */}
            <span aria-hidden className="care-selector-panel-art">
              <CareAreaIcon name={system.areas[0]?.icon ?? "heart"} size={160} strokeWidth={0.9} />
            </span>
            <p className="care-selector-panel-index text-[0.8125rem] font-semibold tabular-nums tracking-[0.08em]">
              {String(index + 1).padStart(2, "0")}
              <span className="care-selector-panel-total"> / {String(systems.length).padStart(2, "0")}</span>
            </p>
            <h3 className="mt-1 text-[1.375rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 sm:text-[1.5rem]">{system.title}</h3>
            <p className="mt-2 max-w-[52ch] text-[1rem] leading-7 text-ink-600">{system.body}</p>
            <div className="mt-4 flex items-center gap-3">
              <span aria-hidden className="flex -space-x-2 rtl:space-x-reverse">
                {system.monograms.map((initials) => (
                  <span key={initials} className="care-selector-monogram grid h-9 w-9 place-items-center rounded-full text-[0.75rem] font-semibold tracking-[0.03em] ring-2 ring-surface-default">
                    {initials}
                  </span>
                ))}
                {system.more > 0 ? (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-pearl text-[0.75rem] font-semibold text-ink-600 ring-2 ring-surface-default">+{system.more}</span>
                ) : null}
              </span>
              <p className="min-w-0 text-[0.875rem] leading-5 text-ink-600">
                <span className="text-ink-500">{copy.ledBy} </span>
                <span className="font-semibold text-brand-900">{system.consultants}</span>
                <span className="care-selector-names text-ink-600">{system.names}</span>
              </p>
            </div>
          </div>

          <ul className="care-selector-areas divide-y">
            {system.areas.map((area) => (
              <li key={area.slug}>
                <Link
                  href={area.href}
                  className="care-selector-area group flex items-center gap-4 px-5 py-4 transition-colors sm:px-7 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span aria-hidden className="care-selector-area-icon grid h-11 w-11 flex-none place-items-center rounded-[10px] transition-colors">
                    <CareAreaIcon name={area.icon} size={20} strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.0625rem] font-semibold leading-snug text-brand-900">{area.title}</span>
                    <span className="care-selector-area-short mt-0.5 block text-[0.875rem] leading-6 text-ink-600">{area.short}</span>
                    {area.facets.length > 0 ? (
                      <span className="care-selector-area-facets">
                        {area.facets.map((facet) => <span key={facet} className="care-selector-facet">{facet}</span>)}
                      </span>
                    ) : null}
                    {area.consultants ? <span className="care-selector-area-count mt-0.5 block text-[0.8125rem] font-semibold leading-5">{area.consultants}</span> : null}
                  </span>
                  {area.people.length > 0 ? (
                    <span aria-hidden className="care-selector-area-people">
                      {area.people.map((initials) => <span key={initials}>{initials}</span>)}
                    </span>
                  ) : null}
                  <span aria-hidden className="care-selector-area-go flex-none">
                    <ArrowRight size={18} className="care-selector-arrow rtl:-scale-x-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {/* The next step, in the words of the system just chosen (shown where the theme asks). */}
          <div className="care-selector-panel-foot">
            <p className="min-w-0 flex-1 text-[0.9375rem] leading-6 text-ink-700">
              <strong className="block font-semibold text-brand-900">{copy.nextTitle.replace("{system}", system.title.toLowerCase())}</strong>
              {copy.nextBody}
            </p>
            <TrackedLink event="send_case_cta_clicked" href={copy.sendHref} className="btn-primary flex-none">
              {copy.nextAction}
              <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
          </div>
        </section>
      ))}

      {/* Phones: the way out sits under the panel, where the thumb already is. */}
      <TrackedLink
        event="send_case_cta_clicked"
        href={copy.sendHref}
        className="care-selector-unsure flex items-start gap-3 rounded-[10px] border border-dashed border-line-strong px-4 py-3.5 lg:hidden"
      >
        <Compass size={18} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 flex-none text-brand-600" />
        <span className="min-w-0 flex-1 text-[0.9375rem] leading-6 text-ink-700">
          <strong className="block font-semibold text-brand-900">{copy.unsure}</strong>
          {copy.unsureAction}
        </span>
      </TrackedLink>
    </div>
  );
}
