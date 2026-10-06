"use client";

import { Search, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";
import type { ConsultantProfile } from "@/lib/consultants";
import type { Locale } from "@/lib/i18n";
import { ConsultantCard } from "./ConsultantCard";

export type PanelEntry = { profile: ConsultantProfile; system: CareSystem; icon: CareAreaIconName; href: string; viewOf: string };

const noSubscribe = () => () => {};

type Copy = {
  search: string;
  searchPlaceholder: string;
  systems: string;
  all: string;
  countOne: string;
  countMany: string;
  empty: string;
  emptyHint: string;
  reset: string;
  distinction: string;
  focus: string;
  view: string;
};

/**
 * The Consultant panel: one search field and body-system filter chips (the same systems and tints as the
 * Care Areas atlas); each card carries its system tint, so one continuous grid stays legible. Filtering is client-side over the full,
 * server-rendered list, ordered by body system, so the page is complete without JavaScript.
 */
export function ConsultantPanel({ entries, systems, locale, copy }: {
  entries: readonly PanelEntry[];
  systems: readonly { key: CareSystem; title: string }[];
  locale: Locale;
  copy: Copy;
}) {
  const [query, setQuery] = useState("");
  const [system, setSystem] = useState<CareSystem | "">("");
  // The chips only work once React has hydrated; until then they say so rather than silently dropping a click.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const needle = query.trim().normalize("NFKC").toLocaleLowerCase(locale);
  const matches = (entry: PanelEntry) => {
    const p = entry.profile;
    return [p.name, p.specialty, p.role, p.careAreaLabel, ...p.focusAreas, ...p.qualifications].join(" ").normalize("NFKC").toLocaleLowerCase(locale).includes(needle);
  };
  const searched = entries.filter(matches);
  const visible = searched.filter((entry) => !system || entry.system === system);
  const count = (n: number) => (n === 1 ? copy.countOne : copy.countMany.replace("{n}", String(n)));
  const order = (key: CareSystem) => systems.findIndex((s) => s.key === key);
  const ordered = [...visible].sort((a, b) => order(a.system) - order(b.system));

  const chip = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-[0.8125rem] font-medium sm:min-h-11 sm:px-4 sm:text-[0.875rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
      active ? "border-brand-700 bg-brand-700 text-white" : "border-border-card bg-surface-default text-ink-700 hover:border-brand-400 hover:text-brand-800"
    }`;

  return (
    <>
      <div className="mt-8 rounded-[18px] border border-border-card bg-surface-default p-4 shadow-[0_18px_40px_-34px_rgba(36,64,74,0.5)] sm:p-5">
        <label htmlFor="consultant-search" className="sr-only">{copy.search}</label>
        <div className="relative">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-brand-600" />
          <input
            id="consultant-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.search}
            className="h-12 w-full rounded-xl border border-border-card bg-surface-pearl pe-4 ps-11 text-base text-brand-900 placeholder:text-ink-400 focus-visible:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          />
        </div>
        <div role="group" aria-label={copy.systems} className="mt-4 flex flex-wrap gap-1.5 sm:gap-2">
          <button type="button" aria-pressed={system === ""} aria-disabled={!hydrated || undefined} onClick={() => setSystem("")} className={chip(system === "")}>
            {copy.all}
            <span className={`tabular-nums ${system === "" ? "text-white/75" : "text-ink-400"}`}>{searched.length}</span>
          </button>
          {systems.map((s) => {
            const n = searched.filter((entry) => entry.system === s.key).length;
            const active = system === s.key;
            return (
              <button key={s.key} type="button" aria-pressed={active} aria-disabled={!hydrated || undefined} onClick={() => setSystem(active ? "" : s.key)} disabled={n === 0 && !active} className={`${chip(active)} disabled:cursor-not-allowed disabled:opacity-45`}>
                <span aria-hidden className={`h-2 w-2 rounded-full ${active ? "bg-white" : SYSTEM_STYLES[s.key].dot}`} />
                {s.title}
                <span className={`tabular-nums ${active ? "text-white/75" : "text-ink-400"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex min-h-11 items-center justify-between gap-4">
        <p role="status" aria-live="polite" className="text-[0.875rem] font-semibold text-brand-800">{count(visible.length)}</p>
        {query || system ? (
          <button type="button" onClick={() => { setQuery(""); setSystem(""); }} className="inline-flex min-h-11 items-center gap-2 text-[0.875rem] font-semibold text-brand-700 hover:text-brand-800">
            <X size={16} aria-hidden="true" />
            {copy.reset}
          </button>
        ) : null}
      </div>

      {ordered.length > 0 ? (
        <ul className="mt-2 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((entry) => (
            <li key={entry.profile.slug}>
              <ConsultantCard
                profile={entry.profile}
                system={entry.system}
                icon={entry.icon}
                href={entry.href}
                labels={{ view: copy.view, viewOf: entry.viewOf, distinction: copy.distinction, focus: copy.focus }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 rounded-[18px] border border-dashed border-border-card bg-surface-default px-6 py-12 text-center">
          <p className="text-[1.0625rem] font-semibold text-brand-900">{copy.empty}</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[0.9375rem] leading-6 text-ink-600">{copy.emptyHint}</p>
        </div>
      )}
    </>
  );
}
