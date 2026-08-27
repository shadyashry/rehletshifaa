import Image from "next/image";

type LogoVariant = "color" | "reversed" | "mono";

type LogoProps = {
  /** Latin wordmark, supplied by the dictionary so it stays translatable. */
  label: string;
  /** Trailing portion of `label` rendered in Fresh Aqua, matching the brand handoff (e.g. "Shifaa" in "RehletShifaa"). */
  accent?: string;
  /** Arabic wordmark. When present it is shown beneath the Latin wordmark. */
  arabicLabel?: string;
  /** Trailing portion of `arabicLabel` rendered in Fresh Aqua (e.g. "شفاء" in "رحلة شفاء"). */
  arabicAccent?: string;
  variant?: LogoVariant;
  /** Icon edge length in px. The wordmark scales from the same base. */
  size?: number;
  className?: string;
};

/**
 * Brand icon — a hand offering a heart: care extended and received, read
 * left-to-right and right-to-left alike. Sourced from the brand handoff as a
 * flattened image; the transparent PNG in /public/brand is the one canonical
 * asset, and the "reversed" (white, for dark surfaces) and "mono" (single
 * ink) variants are produced from it with CSS filters rather than shipping
 * separate exports.
 */
export function GuidedArc({
  variant = "color",
  size = 34,
  title,
}: {
  variant?: LogoVariant;
  size?: number;
  /** Accessible name; omit when the adjacent wordmark already labels the mark. */
  title?: string;
}) {
  const filter =
    variant === "reversed"
      ? "brightness(0) invert(1)"
      : variant === "mono"
        ? "brightness(0) saturate(0)"
        : undefined;

  return (
    <Image
      src="/brand/icon.png"
      alt={title ?? ""}
      width={size}
      height={size}
      className="shrink-0"
      style={{ width: size, height: size, filter }}
      priority
    />
  );
}

/** Splits a wordmark into its ink-colored lead and its Fresh-Aqua accent. */
function splitWordmark(label: string, accent?: string): [string, string] {
  if (accent && label.endsWith(accent)) {
    return [label.slice(0, label.length - accent.length), accent];
  }
  return [label, ""];
}

/** Icon + Latin wordmark lockup, with the Arabic wordmark stacked beneath it. */
export function Logo({
  label,
  accent,
  arabicLabel,
  arabicAccent,
  variant = "color",
  size = 34,
  className = "",
}: LogoProps) {
  const inkColor = variant === "reversed" ? "#ffffff" : "#29454d";
  // Fresh Aqua accent only reads on the light "color" variant; reversed/mono
  // stay a single flat color so the mark still holds up on a saturated or
  // single-ink surface.
  const accentColor = variant === "color" ? "#65bdb5" : inkColor;
  const wordmarkSize = `${size * 0.62}px`;
  const arabicSize = `${size * 0.42}px`;
  const arabicAccentColor = variant === "color" ? "#65bdb5" : variant === "reversed" ? "#a9ddd6" : inkColor;

  const [latinLead, latinAccent] = splitWordmark(label, accent);
  const [arabicLead, arabicAccentText] = arabicLabel ? splitWordmark(arabicLabel, arabicAccent) : ["", ""];

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <GuidedArc variant={variant} size={size} />
      <span className="inline-flex flex-col leading-none">
        <span className="font-brand" style={{ fontSize: wordmarkSize, color: inkColor }}>
          {latinLead}
          {latinAccent ? <span style={{ color: accentColor }}>{latinAccent}</span> : null}
        </span>
        {arabicLabel ? (
          <span
            lang="ar"
            dir="rtl"
            className="mt-1 font-semibold leading-none"
            style={{ fontSize: arabicSize, color: inkColor, fontFamily: "var(--font-arabic), sans-serif" }}
          >
            {arabicLead}
            {arabicAccentText ? <span style={{ color: arabicAccentColor }}>{arabicAccentText}</span> : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}
