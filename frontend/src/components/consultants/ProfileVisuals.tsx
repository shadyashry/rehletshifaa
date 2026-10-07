import { CareAreaIcon } from "@/components/care-areas/CareAreaIcon";
import { SpecialtyMotif } from "@/components/care-areas/SpecialtyMotif";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

/**
 * The profile's colour, drawn only from the theme's own tokens so it sits inside the brand palette: brand tint blending
 * into the paper ground with one warm coral note, deep brand gradients for solid marks, and the line drawing in a
 * soft brand tone. (The body-system tints stay on the care-area pages; here the profile speaks the brand palette.)
 */
export const PROFILE_TONES = {
  /** Brand tint at the start, paper in the middle, a coral blush at the end. */
  wash: "bg-[linear-gradient(120deg,color-mix(in_oklab,var(--color-brand-100)_80%,var(--color-surface-pearl))_0%,var(--color-surface-pearl)_55%,color-mix(in_oklab,var(--color-coral)_16%,var(--color-surface-pearl))_100%)]",
  /** A lighter version of the wash for panels inside the white reading column. */
  panel: "bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-brand-50)_90%,white)_0%,white_50%,color-mix(in_oklab,var(--color-coral)_8%,white)_100%)]",
  /** Solid marks (badges, highlight discs, the hub): deep brand, lit from the top-start. */
  disc: "bg-[linear-gradient(135deg,var(--color-brand-600),var(--color-brand-800))] text-white",
  /** Small icon tiles and portrait wells: brand tint into paper. */
  tile: "bg-[linear-gradient(135deg,var(--color-brand-50),var(--color-surface-pearl))]",
  /** A frame that mixes the brand and the coral — the portrait ring and the figures card's top rule. */
  edge: "bg-[linear-gradient(120deg,var(--color-brand-300),var(--color-brand-600)_55%,var(--color-coral))]",
  /** The line drawing, recoloured to a soft brand tone (overrides the body-system stroke). */
  motif: "text-brand-300!",
} as const;

/**
 * The clinical focus as a map: the Consultant's specialty as a hub — its icon on a solid disc inside a slowly
 * turning dashed orbit — with the focus areas set either side and joined to it by short connectors, over the brand
 * wash and a faint motif. Sized by its own column (container query), so it fits the profile's CV column;
 * narrow columns stack the hub over the list. Qualitative only: scope, never rank or volume.
 */
export function FocusMap({ anchor, areas, icon, system }: { anchor: string; areas: readonly string[]; icon: CareAreaIconName; system: CareSystem }) {
  const half = Math.ceil(areas.length / 2);
  const item = "relative flex gap-3 rounded-[14px] bg-surface-default/95 px-4 py-3.5 text-[0.9375rem] font-medium leading-6 text-brand-900 shadow-[0_14px_30px_-24px_rgba(14,79,85,0.45)] ring-1 ring-line @2xl:after:absolute @2xl:after:top-1/2 @2xl:after:h-px @2xl:after:w-6 @2xl:after:bg-brand-300";
  const dot = <span aria-hidden className="mt-2 h-2 w-2 flex-none rounded-full bg-coral" />;

  return (
    <div className={`@container relative isolate overflow-hidden rounded-[20px] px-4 py-7 ring-1 ring-line sm:px-6 ${PROFILE_TONES.panel}`}>
      <SpecialtyMotif system={system} className={`absolute inset-0 -z-10 h-full w-full opacity-30 rtl:-scale-x-100 ${PROFILE_TONES.motif}`} />
      <div className="grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_10.5rem_minmax(0,1fr)] @2xl:items-center @2xl:gap-6">
        <div className="mb-2 flex flex-col items-center text-center @2xl:col-start-2 @2xl:row-start-1 @2xl:mb-0">
          <span aria-hidden className="relative grid h-28 w-28 place-items-center">
            <span className="absolute inset-0 animate-[spin_48s_linear_infinite] rounded-full border border-dashed border-coral/70 motion-reduce:animate-none" />
            <span className={`absolute inset-3 rounded-full ring-1 ring-line ${PROFILE_TONES.tile}`} />
            <span className={`relative grid h-14 w-14 place-items-center rounded-full shadow-[0_14px_30px_-12px_rgba(14,79,85,0.75)] ${PROFILE_TONES.disc}`}>
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
