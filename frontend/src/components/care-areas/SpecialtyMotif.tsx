import type { CareSystem } from "@/lib/care-area-catalog";
import { SYSTEM_STYLES } from "./CareAreaIcon";

/**
 * A quiet line drawing that gives each body system its own visual identity behind a hero — an ECG trace
 * for the heart, a neural network for brain and nerves, articulated joints for bones, flowing curves for
 * digestion, a sutured incision for surgery and concentric rings for women's health. Decorative only,
 * drawn in the system's line tint at low opacity; mirrored as a whole in RTL by the caller's className.
 */
const PATHS: Record<CareSystem, React.ReactNode> = {
  heart: (
    <>
      <path d="M0 150 H110 l14 -46 l16 92 l14 -70 l10 24 H250 l12 -34 l12 58 l10 -24 H400" />
      <path d="M0 214 H70 l10 -26 l12 52 l10 -40 l8 14 H190 l10 -20 l10 34 l8 -14 H400" opacity="0.5" />
      <path d="M0 86 H160 l8 -18 l9 36 l8 -26 l6 8 H400" opacity="0.35" />
    </>
  ),
  neuro: (
    <>
      <path d="M40 60 L120 110 L210 70 L300 120 L370 60 M120 110 L150 200 L240 230 L300 120 M210 70 L240 230 M150 200 L60 240 M300 120 L360 220 L240 230" />
      {[[40, 60], [120, 110], [210, 70], [300, 120], [370, 60], [150, 200], [240, 230], [60, 240], [360, 220]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6" />
      ))}
    </>
  ),
  movement: (
    <>
      <path d="M40 60 Q120 90 170 150 M170 150 Q230 210 340 230" strokeWidth="10" opacity="0.35" strokeLinecap="round" />
      <circle cx="170" cy="150" r="22" />
      <circle cx="40" cy="60" r="12" />
      <circle cx="340" cy="230" r="12" />
      <path d="M250 50 Q300 80 330 130" strokeWidth="8" opacity="0.25" strokeLinecap="round" />
      <circle cx="330" cy="130" r="14" opacity="0.5" />
    </>
  ),
  digestive: (
    <>
      <path d="M0 90 C70 40 130 140 200 90 S330 40 400 90" />
      <path d="M0 150 C70 100 130 200 200 150 S330 100 400 150" opacity="0.6" />
      <path d="M0 210 C70 160 130 260 200 210 S330 160 400 210" opacity="0.35" />
    </>
  ),
  surgery: (
    <>
      <path d="M30 220 C120 120 260 140 370 60" />
      {Array.from({ length: 11 }, (_, i) => {
        const t = i / 10;
        const x = 30 + 340 * t;
        const y = 220 - 160 * t + Math.sin(t * Math.PI) * -18;
        return <path key={i} d={`M${x - 9} ${y - 11} L${x + 9} ${y + 11}`} opacity="0.7" />;
      })}
      <path d="M40 260 C140 180 260 200 380 120" strokeDasharray="4 10" opacity="0.4" />
    </>
  ),
  women: (
    <>
      <circle cx="200" cy="150" r="40" />
      <circle cx="200" cy="150" r="80" opacity="0.6" />
      <circle cx="200" cy="150" r="120" opacity="0.35" />
      <circle cx="280" cy="150" r="80" opacity="0.4" />
      <circle cx="120" cy="150" r="80" opacity="0.4" />
    </>
  ),
};

export function SpecialtyMotif({ system, className = "" }: { system: CareSystem; className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 400 300"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pointer-events-none ${SYSTEM_STYLES[system].line} ${className}`}
    >
      {PATHS[system]}
    </svg>
  );
}
