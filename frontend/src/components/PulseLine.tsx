const BEAT = "h44l7-13 9 26 9-22 6 9h45";
const TRACE = [0, 120, 240].map((offset) => `M${offset} 20${BEAT}`).join("");

/**
 * Repeating ECG trace used as the brand's graphic device. Purely decorative and
 * hidden from assistive technology; inherits `currentColor` so it can sit on any
 * surface without a second asset.
 */
export function PulseLine({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d={TRACE}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
