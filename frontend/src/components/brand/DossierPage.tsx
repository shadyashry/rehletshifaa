import type { HTMLAttributes, ReactNode } from "react";

/**
 * One page of the patient's case file, resting flat: the paper sheet with its strong hairline edge, the case
 * reference as its kicker, one heading, the body, and — only when the page records a real event — the stamp in its
 * end-top corner. The Send my case confirmation is the template; every patient door (status link, proposal link,
 * activation, My Care's current step) is a page of the same file.
 *
 * Slots, not switches: the caller renders its own heading (so it chooses the level and where focus lands) and its own
 * `CaseStamp` (so a page without an event date passes none). `edge="tab"` draws the file's petrol tab on the top edge
 * (the page that matters now); the confirmation page keeps its plain edge.
 */
export function DossierPage({ kicker, reference, stamp, edge = "plain", className = "", children, ...rest }: {
  /** The small label above the reference, e.g. "Case number". */
  kicker?: ReactNode;
  /** The case number the patient knows, set large and kept left-to-right. */
  reference?: string | null;
  /** A `CaseStamp`, or nothing. */
  stamp?: ReactNode;
  edge?: "plain" | "tab";
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section {...rest} data-edge={edge === "tab" ? "tab" : undefined} data-stamped={stamp ? "" : undefined}
             className={`dossier-page dossier-page-static relative card ${edge === "tab" ? "file-tab " : ""}${className}`}>
      {kicker ? <p className="text-[0.8125rem] font-semibold uppercase leading-5 tracking-[0.1em] text-ink-500 rtl:text-[0.875rem] rtl:normal-case rtl:tracking-normal">{kicker}</p> : null}
      {/* Isolated left-to-right inside the paragraph, so the number stays whole and still starts at the page's start edge in Arabic. */}
      {reference ? <p className="mt-1 text-3xl font-bold tracking-wide text-brand-900"><bdi dir="ltr" className="inline-block">{reference}</bdi></p> : null}
      {children}
      {/* Drawn in the end-top corner; read after the page's own text. */}
      {stamp ? <div className="dossier-page-stamp">{stamp}</div> : null}
    </section>
  );
}
