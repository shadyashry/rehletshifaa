/**
 * The RehletShifaa care-journey motif: one thin line that flows — never a straight ruler — between the
 * numbered moments of a journey. It carries meaning (continuity, one hand-off to the next) in the three
 * places the page describes a sequence, and appears nowhere else. Stretched to the space between two
 * markers, so the curve follows the content instead of the content following a fixed drawing.
 */
export function JourneyLine({ orientation = "vertical", tone = "clinical", className = "" }: {
  orientation?: "vertical" | "horizontal";
  tone?: "clinical" | "warm";
  className?: string;
}) {
  const stroke = tone === "warm" ? "journey-path-warm" : "journey-path";
  if (orientation === "horizontal") {
    return (
      <svg aria-hidden className={className} viewBox="0 0 100 24" preserveAspectRatio="none" focusable="false">
        <path className={stroke} d="M0 12 C 30 7.5, 70 16.5, 100 12" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  return (
    <svg aria-hidden className={className} viewBox="0 0 24 100" preserveAspectRatio="none" focusable="false">
      <path className={stroke} d="M12 0 C 7 30, 17 70, 12 100" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
