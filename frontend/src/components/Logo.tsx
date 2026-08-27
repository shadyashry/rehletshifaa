import type { CSSProperties } from "react";

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
 * "The Guided Arc" — an open ring for an ongoing journey, one pulse notch for
 * vitality, and a warm arrival dot where care is reached. The path data is the
 * final artwork from the brand handoff and must not be altered.
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
  const ink = variant === "reversed" ? "#ffffff" : "#29454d";
  const teal = variant === "mono" ? ink : variant === "reversed" ? "#65bdb5" : "#247c86";
  const coral = variant === "mono" ? ink : "#e98d78";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M61.63 81.95 A34 34 0 1 1 81.95 61.63"
        fill="none"
        stroke={ink}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M81.95 61.63 L81.69 81.69 L61.63 81.95"
        fill="none"
        stroke={teal}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="81.95" cy="61.63" r="5" fill={ink} />
      <circle cx="61.63" cy="81.95" r="9" fill={coral} />
    </svg>
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
