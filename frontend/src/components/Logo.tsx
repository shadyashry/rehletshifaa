import type { CSSProperties } from "react";
import Image from "next/image";

type LogoVariant = "color" | "reversed" | "mono";

type LogoProps = {
  /** Latin wordmark, supplied by the dictionary so it stays translatable. */
  label: string;
  /** Arabic wordmark. When present it is shown beneath the Latin wordmark. */
  arabicLabel?: string;
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

/** Icon + Latin wordmark lockup, with the Arabic wordmark stacked beneath it. */
export function Logo({ label, arabicLabel, variant = "color", size = 34, className = "" }: LogoProps) {
  const wordmarkColor = variant === "reversed" ? "#ffffff" : "#29454d";
  const arabicColor = variant === "reversed" ? "#a9ddd6" : "#247c86";
  const wordmarkStyle: CSSProperties = { fontSize: `${size * 0.62}px`, color: wordmarkColor };

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <GuidedArc variant={variant} size={size} />
      <span className="inline-flex flex-col leading-none">
        <span className="font-brand" style={wordmarkStyle}>
          {label}
        </span>
        {arabicLabel ? (
          <span
            lang="ar"
            dir="rtl"
            className="mt-1 font-semibold leading-none"
            style={{ fontSize: `${size * 0.42}px`, color: arabicColor, fontFamily: "var(--font-arabic), sans-serif" }}
          >
            {arabicLabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}
