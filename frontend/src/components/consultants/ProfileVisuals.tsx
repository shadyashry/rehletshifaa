import { CareAreaIcon } from "@/components/care-areas/CareAreaIcon";
import type { CareAreaIconName } from "@/lib/care-area-catalog";

/**
 * The profile's colour, from the theme's own tokens and flat, as the dossier is (review 2026-10-30): paper for panels and
 * wells, Deep Petrol for solid marks, a hairline for the portrait frame. No washes, gradients or coral fills.
 * (The body-system tints stay on the care-area pages; here the profile speaks the brand palette.)
 */
export const PROFILE_TONES = {
  /** The focus map's panel inside the white reading column. */
  panel: "bg-surface-pearl",
  /** Solid marks (the specialty badge, highlight discs, the hub, the latest qualification). */
  disc: "bg-brand-700 text-white",
  /** Small icon tiles and the hub's well. */
  tile: "bg-surface-pearl",
  /** The portrait's frame: a strong hairline, like the hero photo's. */
  edge: "bg-border-clinical",
} as const;

/**
 * The clinical focus as a map: the Consultant's specialty as a hub — its icon on a solid disc inside a still dashed
 * ring — with the focus areas set either side and joined to it by short connectors, on paper. Sized by its own column
 * (container query), so it fits the profile's CV column;
 * narrow columns stack the hub over the list. Qualitative only: scope, never rank or volume.
 */
export function FocusMap({ anchor, areas, icon }: { anchor: string; areas: readonly string[]; icon: CareAreaIconName }) {
  const half = Math.ceil(areas.length / 2);
  const item = "relative flex gap-3 rounded-lg bg-surface-default px-4 py-3.5 text-[0.9375rem] font-medium leading-6 text-brand-900 ring-1 ring-line @2xl:after:absolute @2xl:after:top-1/2 @2xl:after:h-px @2xl:after:w-6 @2xl:after:bg-brand-300";
  const dot = <span aria-hidden className="mt-2 h-2 w-2 flex-none rounded-full bg-brand-400" />;

  return (
    <div className={`@container relative isolate overflow-hidden rounded-lg px-4 py-7 ring-1 ring-line sm:px-6 ${PROFILE_TONES.panel}`}>
      <div className="grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_10.5rem_minmax(0,1fr)] @2xl:items-center @2xl:gap-6">
        <div className="mb-2 flex flex-col items-center text-center @2xl:col-start-2 @2xl:row-start-1 @2xl:mb-0">
          <span aria-hidden className="relative grid h-28 w-28 place-items-center">
            <span className="absolute inset-0 rounded-full border border-dashed border-coral/70" />
            <span className={`absolute inset-3 rounded-full ring-1 ring-line ${PROFILE_TONES.tile}`} />
            <span className={`relative grid h-14 w-14 place-items-center rounded-full ${PROFILE_TONES.disc}`}>
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
