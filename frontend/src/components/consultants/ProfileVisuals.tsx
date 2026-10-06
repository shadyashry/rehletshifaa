import { Building2, GraduationCap } from "lucide-react";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { SpecialtyMotif } from "@/components/care-areas/SpecialtyMotif";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

/**
 * The clinical focus as a map: the Consultant's specialty as a hub — its icon on a solid disc inside a slowly
 * turning dashed orbit — with the focus areas set either side and joined to it by short connectors, over the body
 * system's tint and motif. Qualitative only: scope, never rank or volume. Phones stack the hub over the list.
 */
export function FocusMap({ anchor, areas, icon, system }: { anchor: string; areas: readonly string[]; icon: CareAreaIconName; system: CareSystem }) {
  const style = SYSTEM_STYLES[system];
  const half = Math.ceil(areas.length / 2);
  const item = "relative flex gap-3 rounded-[16px] bg-surface-default/95 p-4 text-[1rem] font-medium leading-6 text-brand-900 shadow-[0_14px_30px_-24px_rgba(36,64,74,0.55)] ring-1 ring-border-card sm:p-5 lg:after:absolute lg:after:top-1/2 lg:after:h-px lg:after:w-8 lg:after:bg-brand-300";
  const dot = <span aria-hidden className={`mt-2 h-2 w-2 flex-none rounded-full ${style.dot}`} />;

  return (
    <div className={`relative isolate overflow-hidden rounded-[24px] px-4 py-8 ring-1 sm:px-8 lg:px-10 lg:py-12 ${style.soft} ${style.ring}`}>
      <SpecialtyMotif system={system} className="absolute inset-0 -z-10 h-full w-full opacity-20 rtl:-scale-x-100" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)] lg:items-center lg:gap-8">
        <div className="flex flex-col items-center text-center lg:col-start-2 lg:row-start-1">
          <span aria-hidden className="relative grid h-36 w-36 place-items-center">
            <span className="absolute inset-0 animate-[spin_48s_linear_infinite] rounded-full border border-dashed border-brand-400 motion-reduce:animate-none" />
            <span className={`absolute inset-4 rounded-full bg-surface-default/85 ring-1 ${style.ring}`} />
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-brand-700 text-white shadow-[0_14px_30px_-12px_rgba(31,107,115,0.8)]">
              <CareAreaIcon name={icon} size={28} strokeWidth={1.7} />
            </span>
          </span>
          <p className="mt-3 max-w-[13rem] text-[0.9375rem] font-semibold leading-6 text-brand-900 [text-wrap:balance]">{anchor}</p>
        </div>
        <ul className="grid gap-4 lg:col-start-1 lg:row-start-1">
          {areas.slice(0, half).map((area) => <li key={area} className={`${item} lg:after:-end-8`}>{dot}{area}</li>)}
        </ul>
        <ul className="grid gap-4 lg:col-start-3 lg:row-start-1">
          {areas.slice(half).map((area) => <li key={area} className={`${item} lg:after:-start-8`}>{dot}{area}</li>)}
        </ul>
      </div>
    </div>
  );
}

export type CareerEvent = { year: string; title: string; place: string; kind: "qualification" | "appointment" };

/**
 * The career as a dated path, oldest first: years over a single line (drawn from pale to deep, so the eye moves
 * toward the present), a marker per step — filled for a qualification, ringed for an appointment — and the step's
 * title and institution beneath. Horizontal from md; on phones the same steps run down a vertical line.
 */
export function CareerTimeline({ events, labels }: { events: readonly CareerEvent[]; labels: { qualification: string; appointment: string } }) {
  return (
    <ol className="relative grid gap-7 before:absolute before:bottom-2 before:start-[0.4375rem] before:top-2 before:w-px before:bg-border-clinical md:grid-flow-col md:auto-cols-fr md:gap-5 md:before:inset-x-0 md:before:bottom-auto md:before:top-[3.25rem] md:before:h-0.5 md:before:w-auto md:before:-translate-y-1/2 md:before:rounded-full md:before:bg-[linear-gradient(to_right,var(--color-brand-200),var(--color-brand-600))] md:rtl:before:bg-[linear-gradient(to_left,var(--color-brand-200),var(--color-brand-600))]">
      {events.map((event, index) => {
        const Icon = event.kind === "qualification" ? GraduationCap : Building2;
        return (
          <li key={`${event.year}-${index}`} className="relative ps-9 md:ps-0">
            <p className="text-[1.5rem] font-semibold tabular-nums leading-8 tracking-[-0.01em] text-brand-800">{event.year}</p>
            <span aria-hidden className={`absolute start-0 top-2 h-4 w-4 rounded-full ring-4 ring-surface-default md:relative md:top-0 md:mt-3 md:block ${event.kind === "qualification" ? "bg-brand-700" : "border-2 border-brand-700 bg-surface-default"}`} />
            <p className="mt-2 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-500 md:mt-4 rtl:normal-case rtl:tracking-normal">
              <Icon size={14} aria-hidden="true" className="text-brand-600" />
              {labels[event.kind]}
            </p>
            <p className="mt-1 text-[1rem] font-semibold leading-6 text-brand-900">{event.title}</p>
            {event.place ? <p className="mt-0.5 text-[0.875rem] leading-6 text-ink-500">{event.place}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
