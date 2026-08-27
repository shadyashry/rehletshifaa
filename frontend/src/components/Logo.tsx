type LogoProps = {
  /** Brand wordmark, supplied by the dictionary so it stays translatable. */
  label: string;
  tone?: "light" | "dark";
  className?: string;
};

/**
 * Brand lockup: a navy mark carrying a single ECG beat, next to the serif
 * wordmark used in the existing brand artwork.
 */
export function Logo({ label, tone = "dark", className = "" }: LogoProps) {
  const isDark = tone === "dark";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`grid h-9 w-9 place-items-center rounded-lg ${isDark ? "bg-brand-900" : "bg-white/10 ring-1 ring-white/25"}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M2.5 12.5h4l1.8-4.4 2.6 8.4 2.3-6 1.5 3.1h6.8"
            stroke={isDark ? "#5fd0c9" : "#ffffff"}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span
        className={`font-brand text-[1.35rem] leading-none ${isDark ? "text-brand-900" : "text-white"}`}
      >
        {label}
      </span>
    </span>
  );
}
