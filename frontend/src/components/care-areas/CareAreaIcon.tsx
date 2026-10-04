import { Bone, Brain, Droplets, HeartPulse, PersonStanding, ScanFace, Slice, Venus, type LucideProps } from "lucide-react";

import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

/** Lucide has no digestive organ; this one is drawn on the same 24-unit grid and stroke language. */
function Digestive({ size = 24, strokeWidth = 2, className, ...rest }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M9 2v4c0 1.7-1.1 2.6-2.4 3.6C5.2 10.7 4.5 12.2 4.5 14c0 4.4 3.6 8 8 8 2.5 0 4.1-1.1 5.5-2.5 1.7-1.7 3-3.9 3-6.6 0-2.9-2-4.9-4.6-4.9-1.6 0-2.6.9-3.6.9S11 8.1 11 6.5V2" />
      <path d="M4.5 14.5c-1.2.1-2 .7-2.5 1.5" />
    </svg>
  );
}

const ICONS = {
  heart: HeartPulse,
  vessel: Droplets,
  brain: Brain,
  rehab: PersonStanding,
  bone: Bone,
  digestive: Digestive,
  surgery: Slice,
  plastic: ScanFace,
  women: Venus,
} as const satisfies Record<CareAreaIconName, (props: LucideProps) => React.ReactNode>;

export function CareAreaIcon({ name, ...props }: LucideProps & { name: CareAreaIconName }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden focusable="false" {...props} />;
}

/** Static class names per body system, so Tailwind sees every token it has to generate. */
export const SYSTEM_STYLES: Record<CareSystem, { well: string; ring: string; line: string; dot: string; stroke: string }> = {
  heart: { well: "bg-system-heart-well", ring: "ring-system-heart-ring", line: "text-system-heart-line", dot: "bg-system-heart-line", stroke: "stroke-system-heart-line" },
  neuro: { well: "bg-system-neuro-well", ring: "ring-system-neuro-ring", line: "text-system-neuro-line", dot: "bg-system-neuro-line", stroke: "stroke-system-neuro-line" },
  movement: { well: "bg-system-movement-well", ring: "ring-system-movement-ring", line: "text-system-movement-line", dot: "bg-system-movement-line", stroke: "stroke-system-movement-line" },
  digestive: { well: "bg-system-digestive-well", ring: "ring-system-digestive-ring", line: "text-system-digestive-line", dot: "bg-system-digestive-line", stroke: "stroke-system-digestive-line" },
  surgery: { well: "bg-system-surgery-well", ring: "ring-system-surgery-ring", line: "text-system-surgery-line", dot: "bg-system-surgery-line", stroke: "stroke-system-surgery-line" },
  women: { well: "bg-system-women-well", ring: "ring-system-women-ring", line: "text-system-women-line", dot: "bg-system-women-line", stroke: "stroke-system-women-line" },
};
