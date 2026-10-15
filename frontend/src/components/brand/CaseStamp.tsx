import { intlLocale, type Locale } from "@/lib/i18n";

/**
 * The dossier's one mark: a date stamp pressed where something real happened — a case received, a file reviewed, an
 * estimate ready. The frame is the logo's coral; the words are the stamp-ink red the alert palette already carries
 * (coral on paper is a mark, never text: it does not reach AA). Decorative to assistive technology (the words it
 * carries are repeated in the page text beside it); the slight rotation and the double rule are the stamp's whole
 * vocabulary. Logical properties only, so it sits at the end edge in Arabic and English alike.
 *
 * `date` is the ISO instant of the event the backend recorded, formatted here per locale (day and month; the year
 * too when it is not this year). A page without that date prints no stamp: the caller renders none.
 */
export function CaseStamp({ label, date, locale, className = "" }: { label: string; date?: string | null; locale: Locale; className?: string }) {
  const printed = date ? stampDate(date, locale) : null;
  return (
    <span aria-hidden className={`case-stamp inline-flex flex-col items-center rounded-[0.375rem] border-2 border-[var(--color-coral,var(--color-alert-600))] px-2.5 py-1 text-alert-700 ${className}`}>
      <span className="text-[0.75rem] font-bold uppercase leading-4 tracking-[0.14em] rtl:text-[0.8125rem] rtl:normal-case rtl:tracking-normal">{label}</span>
      {printed && <span className="mt-0.5 border-t border-current pt-0.5 text-[0.75rem] font-semibold leading-4 tabular-nums" dir="auto">{printed}</span>}
    </span>
  );
}

function stampDate(iso: string, locale: Locale): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const sameYear = when.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(when);
}
