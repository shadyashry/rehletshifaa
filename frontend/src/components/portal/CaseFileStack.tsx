import type { ReactNode } from "react";

import { CaseStamp } from "@/components/brand/CaseStamp";
import type { Locale } from "@/lib/i18n";

/** One earlier page of the file: what happened, the stamp's word, and the instant the backend recorded. */
export type FileSheet = { key: string; title: string; label: string; date: string };

/**
 * The patient's file, shown growing (UX 1c-1): each moment the backend dated before the current page is a paper sheet
 * tucked behind it, with the stamp on one line at its end. The current page is the caller's (`children`), drawn last so
 * it rests on top of the sheets. The caller passes only dated moments — no date, no sheet — and without any the page
 * stands alone, exactly as before.
 *
 * Sheets nearest the page are the widest, so the stack reads as depth; the list is in the order the moments happened,
 * and screen readers hear it as a list of earlier pages, each with its stamp's words and date.
 */
export function CaseFileStack({ sheets, locale, label, pages, children, className = "" }: {
  sheets: readonly FileSheet[];
  locale: Locale;
  /** The list's name, e.g. "Earlier in your file". */
  label: string;
  /** The visible caption, e.g. "Your file · 3 pages"; it counts the current page too. */
  pages: string;
  children: ReactNode;
  className?: string;
}) {
  if (sheets.length === 0) return <div className={className}>{children}</div>;
  return (
    <div className={`case-file ${className}`}>
      <p className="case-file-caption">{pages}</p>
      <ol aria-label={label} className="case-file-sheets">
        {sheets.map((sheet, index) => (
          // Depth counts back from the page: 1 is the sheet right behind it.
          <li key={sheet.key} className="case-file-sheet" data-depth={sheets.length - index}>
            <span className="min-w-0 truncate font-semibold text-brand-900">{sheet.title}</span>
            <CaseStamp variant="line" label={sheet.label} date={sheet.date} locale={locale}/>
          </li>
        ))}
      </ol>
      {children}
    </div>
  );
}
