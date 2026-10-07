import Image from "next/image";

type LogoVariant = "color" | "reversed" | "mono";

type LogoProps = {
  /** Latin wordmark, supplied by the dictionary so it stays translatable. */
  label: string;
  /** Trailing portion of `label` rendered in the brand accent (e.g. "Shifaa" in "RehletShifaa"). */
  accent?: string;
  /** Arabic wordmark. When present it is shown beneath the Latin wordmark. */
  arabicLabel?: string;
  /** Trailing portion of `arabicLabel` rendered in the brand accent (e.g. "شفاء" in "رحلة شفاء"). */
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
      className="logo-mark-img shrink-0"
      style={{ width: size, height: size, filter }}
      priority
    />
  );
}

/** Splits a wordmark into its ink-colored lead and its accent. */
function splitWordmark(label: string, accent?: string): [string, string] {
  if (accent && label.endsWith(accent)) {
    return [label.slice(0, label.length - accent.length), accent];
  }
  return [label, ""];
}

/**
 * The signature detail: the tittle of the first "i" becomes a small round dot in the theme's dot colour, rhyming with
 * the head of the figure in the mark. Drawn as a dotless ı plus a CSS dot (`.logo-i` in globals.css); the wordmark is
 * hidden from assistive technology and the plain label is exposed instead.
 */
function withSignatureDot(text: string) {
  const at = text.indexOf("i");
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="logo-i">ı</span>
      {text.slice(at + 1)}
    </>
  );
}

/**
 * Icon + wordmark lockup. The wordmark is set in Alexandria, one Egyptian-designed family for both scripts, so the
 * Latin and Arabic names carry equal weight: the lead in medium, the accent ("Shifaa" / "شفاء") in bold and colour.
 */
export function Logo({
  label,
  accent,
  arabicLabel,
  arabicAccent,
  variant = "color",
  size = 34,
  className = "",
}: LogoProps) {
  const inkColor = variant === "reversed" ? "#ffffff" : "var(--logo-ink, #29454d)";
  // The accent reads on the light "color" variant; reversed uses a light tint and mono stays one flat ink.
  const accentColor = variant === "color" ? "var(--logo-accent, #247c86)" : variant === "reversed" ? "#a9ddd6" : inkColor;
  const dotColor = variant === "color" ? "var(--logo-dot, #e98d78)" : variant === "reversed" ? "#f3b3a3" : inkColor;
  const wordmarkSize = `${size * 0.62}px`;
  const arabicSize = `${size * 0.44}px`;

  const [latinLead, latinAccent] = splitWordmark(label, accent);
  const [arabicLead, arabicAccentText] = arabicLabel ? splitWordmark(arabicLabel, arabicAccent) : ["", ""];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <GuidedArc variant={variant} size={size} />
      <span className="inline-flex flex-col leading-none">
        <span className="sr-only">{arabicLabel ? `${label} — ${arabicLabel}` : label}</span>
        <span aria-hidden className="logo-wordmark" style={{ fontSize: wordmarkSize, color: inkColor, ["--logo-i-dot" as string]: dotColor }}>
          {latinLead}
          {latinAccent ? <span className="logo-wordmark-accent" style={{ color: accentColor }}>{withSignatureDot(latinAccent)}</span> : null}
        </span>
        {arabicLabel ? (
          <span aria-hidden lang="ar" dir="rtl" className="logo-wordmark-ar mt-1" style={{ fontSize: arabicSize, color: inkColor }}>
            {arabicLead}
            {arabicAccentText ? <span className="logo-wordmark-accent" style={{ color: accentColor }}>{arabicAccentText}</span> : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}
