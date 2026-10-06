import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { SpecialtyMotif } from "@/components/care-areas/SpecialtyMotif";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

/**
 * The clinical focus as a map: the Consultant's specialty as a hub — its icon on a solid disc inside a slowly
 * turning dashed orbit — with the focus areas set either side and joined to it by short connectors, over the body
 * system's tint and a faint motif. Sized by its own column (container query), so it fits the profile's CV column;
 * narrow columns stack the hub over the list. Qualitative only: scope, never rank or volume.
 */
export function FocusMap({ anchor, areas, icon, system }: { anchor: string; areas: readonly string[]; icon: CareAreaIconName; system: CareSystem }) {
  const style = SYSTEM_STYLES[system];
  const half = Math.ceil(areas.length / 2);
  const item = "relative flex gap-3 rounded-[14px] bg-surface-default/95 px-4 py-3.5 text-[0.9375rem] font-medium leading-6 text-brand-900 shadow-[0_14px_30px_-24px_rgba(36,64,74,0.55)] ring-1 ring-border-card @2xl:after:absolute @2xl:after:top-1/2 @2xl:after:h-px @2xl:after:w-6 @2xl:after:bg-brand-300";
  const dot = <span aria-hidden className={`mt-2 h-2 w-2 flex-none rounded-full ${style.dot}`} />;

  return (
    <div className={`@container relative isolate overflow-hidden rounded-[20px] px-4 py-7 ring-1 sm:px-6 ${style.soft} ${style.ring}`}>
      <SpecialtyMotif system={system} className="absolute inset-0 -z-10 h-full w-full opacity-20 rtl:-scale-x-100" />
      <div className="grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_10.5rem_minmax(0,1fr)] @2xl:items-center @2xl:gap-6">
        <div className="mb-2 flex flex-col items-center text-center @2xl:col-start-2 @2xl:row-start-1 @2xl:mb-0">
          <span aria-hidden className="relative grid h-28 w-28 place-items-center">
            <span className="absolute inset-0 animate-[spin_48s_linear_infinite] rounded-full border border-dashed border-brand-400 motion-reduce:animate-none" />
            <span className={`absolute inset-3 rounded-full bg-surface-default/85 ring-1 ${style.ring}`} />
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-brand-700 text-white shadow-[0_14px_30px_-12px_rgba(31,107,115,0.8)]">
              <CareAreaIcon name={icon} size={24} strokeWidth={1.7} />
            </span>
          </span>
          <p className="mt-2.5 max-w-[10.5rem] text-[0.875rem] font-semibold leading-5 text-brand-900 [text-wrap:balance]">{anchor}</p>
        </div>
        <ul className="grid gap-3 @2xl:col-start-1 @2xl:row-start-1">
          {areas.slice(0, half).map((area) => <li key={area} className={`${item} @2xl:after:-end-6`}>{dot}{area}</li>)}
        </ul>
        <ul className="grid gap-3 @2xl:col-start-3 @2xl:row-start-1">
          {areas.slice(half).map((area) => <li key={area} className={`${item} @2xl:after:-start-6`}>{dot}{area}</li>)}
        </ul>
      </div>
    </div>
  );
}
