import type { CSSProperties } from "react";

/**
 * The patient's one case journey, drawn the same wherever the file is opened (My Care, the secure status link):
 * numbered markers joined by a connector that fills as the case moves (DESIGN.md "Journey markers") — reached steps
 * filled Deep Petrol, the current one ringed, the rest outlined and waiting. Down the page on phones, across from
 * 768px. Orientation only: nothing here is a control.
 *
 * Which step is current is the caller's mapping (My Care from the case status, the status link from the public phase);
 * this only draws it. Screen readers hear each step's state in words, not only `aria-current`.
 *
 * `dates` (optional, index-aligned with `steps`) prints when a step happened under its name — only for a step the case
 * has reached or is on, and only where the backend recorded the moment. No date, nothing printed.
 */
export type JourneyDate = { dateTime: string; text: string };
export function CaseJourney({ id, title, steps, current, completedLabel, currentLabel, yoursLabel, dates, className = "" }: {
  /** The heading's id; the section is labelled by it. */
  id: string;
  title: string;
  /** The step names, in journey order. */
  steps: readonly string[];
  /** The index of the current step; -1 when no step applies (a closed case says nothing about how far it got). */
  current: number;
  completedLabel: string;
  currentLabel: string;
  /** Set when the current step is the patient's own to take: said under its name. */
  yoursLabel?: string | null;
  /** When each step happened, already formatted by the caller; null where nothing was recorded. */
  dates?: readonly (JourneyDate | null | undefined)[];
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={`care-journey ${className}`}>
      <h2 id={id} className="eyebrow">{title}</h2>
      <ol className="mt-5 grid md:grid-cols-[repeat(var(--journey-steps),minmax(0,1fr))]" style={{ "--journey-steps": steps.length } as CSSProperties}>
        {steps.map((label, index) => {
          const state = index < current ? "reached" : index === current ? "current" : "upcoming";
          const when = index <= current ? dates?.[index] : null;
          return (
            <li key={label} className="journey-step" aria-current={state === "current" ? "step" : undefined}>
              {index < steps.length - 1 && <span aria-hidden className="journey-link" data-reached={index < current || undefined}/>}
              <span aria-hidden className="journey-marker relative z-10 flex-none" data-state={state}>{index + 1}</span>
              <span className={`text-[0.875rem] leading-5 ${state === "current" ? "font-semibold text-brand-900" : "text-ink-600"}`}>
                {label}
                {state === "reached" && <span className="sr-only"> ({completedLabel})</span>}
                {state === "current" && <span className="sr-only"> ({currentLabel})</span>}
                {when && <><span className="sr-only">, </span><time dateTime={when.dateTime} className="mt-0.5 block text-[0.8125rem] font-medium text-ink-500 tabular-nums">{when.text}</time></>}
                {state === "current" && yoursLabel && <span className="sr-only">, </span>}
                {state === "current" && yoursLabel && <span className="mt-0.5 block text-[0.8125rem] font-semibold text-brand-700">{yoursLabel}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
