import { Check } from "lucide-react";
import type { CSSProperties } from "react";

const at = (seconds: number) => ({ "--at": `${seconds}s` }) as CSSProperties;

/**
 * The scans a Consultant reads, drawn as the three imaging types patients in every specialty send — an X-ray, a CT
 * slice, an ultrasound — so no specialty is implied. A scan line passes over the X-ray and a coral ring marks one area,
 * the CT slices flick past, the ultrasound beam sweeps; each image is ticked as read. Images are decorative: the
 * labels beneath carry the meaning. The drawings are not mirrored in Arabic (scans have no reading direction).
 */
export function StoryScans({ title, readLabel, labels }: { title: string; readLabel: string; labels: string[] }) {
  return (
    <div className="rounded-[0.625rem] border border-line p-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[0.75rem] font-bold uppercase tracking-[0.05em] text-ink-500 rtl:normal-case rtl:tracking-normal">
        <span>{title}</span>
        <span className="s-rise text-brand-600" style={at(3.2)}>{readLabel}</span>
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-1.5">
        <ScanTile label={labels[0]} tickAt={1.4}>
          <path d="M8 80C6 50 10 26 20 18l6-4h8l6 4c10 8 14 32 12 62Z" className="fill-ink-400" />
          <path d="M28 22c-8 0-15 12-15 28 0 12 4 18 11 18 4 0 4-8 4-18Z" className="fill-brand-900" />
          <path d="M32 22c8 0 15 12 15 28 0 12-4 18-11 18-4 0-4-8-4-18Z" className="fill-brand-900" />
          <g fill="none" className="stroke-brand-100" strokeWidth="1.1" opacity=".55">
            <path d="M14 34q8-6 15-1M13 42q9-6 16-1M13 50q9-6 16-1M14 58q8-6 15-1M46 34q-8-6-15-1M47 42q-9-6-16-1M47 50q-9-6-16-1M46 58q-8-6-15-1" />
          </g>
          <rect x="28.4" y="14" width="3.2" height="66" rx="1.4" className="fill-brand-100" opacity=".8" />
          <path d="M30 46c8-2 12 6 10 14-4 4-10 2-10 2Z" className="fill-ink-300" opacity=".75" />
          <circle style={at(1.5)} cx="20" cy="56" r="6.5" pathLength={1} fill="none" className="s-draw stroke-[var(--color-coral)]" strokeWidth="1.8" transform="rotate(-90 20 56)" />
          <ScanLine at={0.3} />
        </ScanTile>
        <ScanTile label={labels[1]} tickAt={2.4} counter={["040/120", "120/120"]} counterAt={1.2}>
          <g className="s-slice" style={at(1.2)}>
            <ellipse cx="30" cy="40" rx="26" ry="19" className="fill-ink-400" />
            <ellipse cx="30" cy="40" rx="23" ry="16.5" className="fill-ink-350" />
            <path d="M10 36c2-8 12-10 18-6 2 6-2 14-10 15-5 0-8-4-8-9Z" className="fill-brand-200" />
            <ellipse cx="40" cy="36" rx="6" ry="5" className="fill-ink-300" />
            <ellipse cx="21" cy="50" rx="3.5" ry="2.6" className="fill-brand-100" />
            <ellipse cx="39" cy="50" rx="3.5" ry="2.6" className="fill-brand-100" />
            <circle cx="30" cy="53" r="4" className="fill-brand-50" />
            <circle cx="30" cy="40" r="2.2" className="fill-brand-100" />
          </g>
        </ScanTile>
        <ScanTile label={labels[2]} tickAt={3.2} black>
          <defs>
            <radialGradient id="story-us" cx=".5" cy="0" r="1">
              <stop offset="0" className="[stop-color:var(--color-ink-350)]" />
              <stop offset=".7" className="[stop-color:var(--color-ink-500)]" />
              <stop offset="1" className="[stop-color:var(--color-ink-800)]" />
            </radialGradient>
          </defs>
          <path d="M30 8l26 54a34 34 0 0 1-52 0Z" fill="url(#story-us)" />
          <ellipse cx="30" cy="44" rx="9" ry="6.5" className="fill-brand-950" />
          <path d="M18 30q12-4 24 0" fill="none" className="stroke-brand-100" strokeWidth="1.2" opacity=".7" />
          <path d="M14 56q16-4 32 0" fill="none" className="stroke-ink-300" strokeWidth="1" opacity=".6" />
          <path style={at(2.4)} d="M30 8v66" className="s-beam stroke-brand-200" strokeWidth="1" opacity=".8" />
        </ScanTile>
      </ul>
      <span aria-hidden className="mt-2 block h-[3px] rounded-full bg-line">
        <span className="s-fill block h-[3px] rounded-full bg-brand-600" style={{ ...at(0.3), "--dur": "3s" } as CSSProperties} />
      </span>
    </div>
  );
}

function ScanTile({ label, tickAt, counter, counterAt = 0, black = false, children }: {
  label: string;
  tickAt: number;
  counter?: [string, string];
  counterAt?: number;
  black?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <div dir="ltr" className={`relative aspect-[3/4] overflow-hidden rounded-[0.375rem] ${black ? "bg-black" : "bg-brand-950"}`}>
        <svg viewBox="0 0 60 80" aria-hidden focusable="false" className="block h-full w-full">{children}</svg>
        {counter ? (
          <span aria-hidden className="absolute bottom-1 start-1.5 inline-grid text-[0.5625rem] font-bold tabular-nums text-brand-200">
            <span className="s-count-a [grid-area:1/1]" style={at(counterAt)}>{counter[0]}</span>
            <span className="s-count-b [grid-area:1/1]" style={at(counterAt)}>{counter[1]}</span>
          </span>
        ) : null}
        <span aria-hidden className="s-pop absolute end-1 top-1 grid h-[15px] w-[15px] place-items-center rounded-full bg-brand-600 text-white" style={at(tickAt)}>
          <Check size={9} strokeWidth={3.4} />
        </span>
      </div>
      <p className="mt-1 text-[0.6875rem] font-semibold leading-tight text-ink-500">{label}</p>
    </li>
  );
}

function ScanLine({ at: start }: { at: number }) {
  return <rect style={at(start)} x="0" y="0" width="60" height="1.4" className="s-scan-y fill-brand-400" />;
}
