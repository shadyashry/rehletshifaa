import { FileHeart } from "lucide-react";

import type { AtlasArea, CareSystem } from "@/lib/care-area-catalog";
import { CareAreaIcon, SYSTEM_STYLES } from "./CareAreaIcon";

const NODE_RADIUS = 35;
const ARC_RADIUS = 46.5;
const ARC_GAP = 3;

function point(radius: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

const fmt = (n: number) => n.toFixed(2);

/**
 * The Care Areas hero visual: the patient's case at the centre, every care area on one orbit around it,
 * grouped into body-system arcs on the outer ring. It says what the platform does — one case, routed to
 * the right specialty — and doubles as an index: each node jumps to its card in the atlas below.
 * Drawn in percentages so it scales to its column; mirrored as a whole in RTL.
 */
export function CareNetwork({ areas, rtl, label, center, jump }: {
  areas: readonly AtlasArea[];
  rtl: boolean;
  label: string;
  center: string;
  jump: string;
}) {
  const step = 360 / areas.length;
  const angle = (index: number) => -90 + index * step;

  const runs: { system: CareSystem; from: number; to: number }[] = [];
  areas.forEach((area, index) => {
    const last = runs.at(-1);
    if (last && last.system === area.system) last.to = index;
    else runs.push({ system: area.system, from: index, to: index });
  });

  const highlight = areas
    .map((_, i) => `.care-net:has([data-node="${i}"]:hover,[data-node="${i}"]:focus-visible) [data-spoke="${i}"]{stroke:var(--color-brand-600);stroke-width:.55;stroke-dasharray:none}`)
    .join("");

  return (
    <nav aria-label={label} className="care-net relative mx-auto aspect-square w-full max-w-[21rem] sm:max-w-[27rem] lg:max-w-[30rem]">
      <style>{highlight}</style>
      <svg aria-hidden focusable="false" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible rtl:-scale-x-100">
        <circle cx="50" cy="50" r={ARC_RADIUS} fill="none" className="stroke-border-subtle" strokeWidth=".25" />
        <circle cx="50" cy="50" r={NODE_RADIUS} fill="none" className="stroke-brand-300" strokeWidth=".25" strokeDasharray=".5 1.4" />
        <circle cx="50" cy="50" r="21" fill="none" className="stroke-border-clinical" strokeWidth=".25" />
        {runs.map((run) => {
          const start = point(ARC_RADIUS, angle(run.from) - step / 2 + ARC_GAP);
          const end = point(ARC_RADIUS, angle(run.to) + step / 2 - ARC_GAP);
          const large = (run.to - run.from + 1) * step - 2 * ARC_GAP > 180 ? 1 : 0;
          return (
            <path
              key={run.system}
              d={`M${fmt(start.x)} ${fmt(start.y)} A${ARC_RADIUS} ${ARC_RADIUS} 0 ${large} 1 ${fmt(end.x)} ${fmt(end.y)}`}
              fill="none"
              strokeWidth="1.1"
              strokeLinecap="round"
              className={SYSTEM_STYLES[run.system].stroke}
            />
          );
        })}
        {areas.map((area, i) => {
          const a = angle(i);
          const from = point(15.5, a);
          const via = point(23, a + 8);
          const to = point(NODE_RADIUS - 5.5, a);
          return (
            <path
              key={area.slug}
              data-spoke={i}
              d={`M${fmt(from.x)} ${fmt(from.y)} Q${fmt(via.x)} ${fmt(via.y)} ${fmt(to.x)} ${fmt(to.y)}`}
              pathLength={1}
              fill="none"
              strokeWidth=".35"
              strokeLinecap="round"
              className="stroke-brand-400 transition-[stroke,stroke-width] duration-200 [stroke-dasharray:1] motion-safe:animate-[care-spoke-draw_0.9s_ease-out_both]"
              style={{ animationDelay: `${150 + i * 70}ms` }}
            />
          );
        })}
      </svg>

      <div className="absolute left-1/2 top-1/2 grid aspect-square w-[27%] -translate-x-1/2 -translate-y-1/2 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-brand-400 motion-safe:animate-[care-pulse_3.6s_ease-out_infinite]" />
        <span className="relative grid h-full w-full place-content-center justify-items-center gap-1 rounded-full bg-brand-700 text-center text-white shadow-[0_14px_30px_-14px_rgba(31,107,115,0.7)] ring-4 ring-surface-pearl">
          <FileHeart aria-hidden className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.6} />
          <span className="px-2 text-[0.8125rem] font-semibold leading-tight sm:text-[0.8125rem]">{center}</span>
        </span>
      </div>

      {areas.map((area, i) => {
        const p = point(NODE_RADIUS, angle(i));
        const system = SYSTEM_STYLES[area.system];
        return (
          <a
            key={area.slug}
            href={`#area-${area.slug}`}
            data-node={i}
            aria-label={jump.replace("{area}", area.title)}
            className={`group/node absolute grid h-11 w-11 place-items-center rounded-full bg-surface-default text-brand-800 shadow-[0_8px_20px_-12px_rgba(36,64,74,0.5)] ring-1 transition-[box-shadow,color] duration-200 hover:text-brand-600 hover:ring-2 hover:ring-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none motion-safe:animate-[care-node-in_0.5s_ease-out_both] sm:h-[3.25rem] sm:w-[3.25rem] ${system.ring}`}
            style={{ left: `${fmt(rtl ? 100 - p.x : p.x)}%`, top: `${fmt(p.y)}%`, transform: "translate(-50%, -50%)", animationDelay: `${300 + i * 70}ms` }}
          >
            <span aria-hidden className={`absolute inset-[3px] rounded-full opacity-70 ${system.well}`} />
            <CareAreaIcon name={area.icon} className="relative h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.7} />
            <span aria-hidden className="absolute left-1/2 top-full mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-pearl/85 px-1.5 text-[0.8125rem] font-medium leading-5 text-ink-600 transition-colors group-hover/node:text-brand-800 sm:block">
              {area.short}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
