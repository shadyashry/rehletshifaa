import type { ReactNode } from "react";
import { Stethoscope } from "lucide-react";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { careAreaMeta } from "@/lib/care-area-catalog";

/**
 * The staff work ledger — the one list treatment shared by My work and My cases (and Team queue).
 *
 * <p>A white sheet on the paper desk with the petrol tab on its top edge, like a page pulled from the case file. A paper
 * header strip carries the count and the order the rows follow; rows are hairline-separated and share one anatomy:
 * care-area mark, identity and the work, then when and the action at the end edge.
 */
export const LEDGER_SHEET = "overflow-hidden rounded-lg border border-line border-t-2 border-t-brand-600 bg-white shadow-[var(--card-shadow)]";

/** Row grid: mark · body · aside. On phones the aside drops under the body, opened by a hairline. */
export const LEDGER_ROW = "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-brand-50/50 has-[[data-roving-primary]:focus-visible]:bg-brand-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:px-5";

/** The aside: date line then the action; full width under the body on phones. */
export const LEDGER_ASIDE = "col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 sm:col-span-1 sm:flex-col sm:flex-nowrap sm:items-end sm:justify-center sm:gap-1.5 sm:border-t-0 sm:pt-0 sm:text-end";

/** The case number as a file tag: tabular, isolated left-to-right inside Arabic. */
export function CaseTag({ number }: { number: string }) {
  return <bdi dir="ltr" className="rounded-md border border-line bg-mist px-1.5 py-px text-[0.8125rem] font-semibold tabular-nums text-brand-700">{number}</bdi>;
}

/** Paper strip at the top of the sheet: what is in it, and in what order. */
export function LedgerHeader({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-mist px-4 py-2 text-[0.8125rem] text-ink-500 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
      {end}
    </div>
  );
}

/**
 * The care area's mark: its body-system well and icon, so a column of cases reads by clinical area at a glance. The
 * label stays in the row as words; the colour only supports the icon (DESIGN.md, care-area systems).
 */
export function CareAreaMark({ careCategory }: { careCategory?: string | null }) {
  const meta = careCategory ? careAreaMeta(careCategory) : undefined;
  if (!meta) {
    return <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-mist-deep text-brand-700"><Stethoscope size={18}/></span>;
  }
  const system = SYSTEM_STYLES[meta.system];
  return (
    <span aria-hidden className={`grid h-10 w-10 flex-none place-items-center rounded-lg ring-1 ring-inset ${system.well} ${system.ring} ${system.line}`}>
      <CareAreaIcon name={meta.icon} size={18} strokeWidth={1.75}/>
    </span>
  );
}

/** First-load stand-in with the sheet's shape, so the page does not jump when the work arrives. */
export function LedgerSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className={LEDGER_SHEET}>
      <div className="h-11 border-b border-line bg-mist"/>
      <ul className="divide-y divide-line">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-4 py-5 motion-safe:animate-pulse sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-5">
            <div className="h-10 w-10 rounded-lg bg-mist-deep"/>
            <div className="space-y-2.5">
              <div className="h-4 w-40 rounded bg-mist-deep"/>
              <div className="h-5 w-3/4 max-w-md rounded bg-mist-deep"/>
              <div className="h-3.5 w-1/2 max-w-xs rounded bg-mist-deep"/>
            </div>
            <div className="hidden h-4 w-24 rounded bg-mist-deep sm:block"/>
          </li>
        ))}
      </ul>
    </div>
  );
}
