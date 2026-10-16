import { intlLocale, type Locale } from "@/lib/i18n";

/**
 * The dossier's one mark: a date stamp pressed where something real happened — a case received, a file reviewed, an
 * estimate ready. The frame is the logo's coral; the words are the stamp-ink red the alert palette already carries
 * (coral on paper is a mark, never text: it does not reach AA). The slight rotation and the double rule are the stamp's
 * whole vocabulary. Logical properties only, so it sits at the end edge in Arabic and English alike. Screen readers hear
 * its words and date once, as one phrase; the drawn letters are hidden from them.
 *
 * `date` is the ISO instant of the event the backend recorded, formatted here per locale (day and month; the year
 * too when it is not this year). Without a readable date nothing is rendered.
 *
 * `variant="line"` is the same stamp on one line (words, then the date after a rule), for the earlier pages of the file
 * where it sits at the end of a sheet's one line rather than in a page's corner.
 */
export function CaseStamp({ label, date, locale, variant = "block", className = "" }: { label: string; date?: string | null; locale: Locale; variant?: "block" | "line"; className?: string }) {
  const printed = date ? stampDate(date, locale) : null;
  // No date the backend recorded, no stamp.
  if (!printed) return null;
  const line = variant === "line";
  return (
    <span data-variant={line ? "line" : undefined}
          className={`case-stamp inline-flex rounded-[0.375rem] border-2 border-[var(--color-coral,var(--color-alert-600))] text-alert-700 ${line ? "flex-none items-center gap-2 whitespace-nowrap px-2.5 py-0.5" : "flex-col items-center px-2.5 py-1"} ${className}`}>
      <span aria-hidden className={`text-[0.75rem] font-bold uppercase leading-4 tracking-[0.14em] rtl:text-[0.8125rem] rtl:leading-5 rtl:normal-case rtl:tracking-normal ${line ? "" : "text-center sm:max-w-[5.25rem] [text-wrap:balance]"}`}>{label}</span>
      <span aria-hidden className={`text-[0.75rem] font-semibold leading-4 tabular-nums ${line ? "border-s border-current ps-2" : "mt-0.5 border-t border-current pt-0.5"}`} dir="auto">{printed}</span>
      <span className="sr-only">{label}{locale === "ar" ? "، " : ", "}{printed}</span>
    </span>
  );
}

/** A recorded instant as the file prints it: day and month, and the year when it is not this year; null when unreadable. */
export function stampDate(iso: string, locale: Locale): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const sameYear = when.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(when);
}
