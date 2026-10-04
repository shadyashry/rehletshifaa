import { Check, FileHeart, Route } from "lucide-react";

import { JourneyLine } from "@/components/home/JourneyConnector";

/**
 * The Consultants hero visual: how a case reaches a Consultant — the case, clinical matching on three
 * criteria, and the panel with one Consultant matched. It shows the platform's promise (you do not pick;
 * the case is matched) instead of a decorative image. Decorative to assistive tech: the sr-only sentence
 * carries the meaning, and the panel below carries the facts.
 */
export function ConsultantMatching({ stages, criteria, matched, initials, label }: {
  stages: readonly string[];
  criteria: readonly string[];
  matched: string;
  initials: readonly string[];
  label: string;
}) {
  const [caseLabel, matchingLabel, consultantLabel] = stages;
  return (
    <figure className="relative mx-auto w-full max-w-[27rem]">
      <figcaption className="sr-only">{`${label}: ${stages.join(" → ")} (${criteria.join(", ")}).`}</figcaption>
      <div aria-hidden className="relative rounded-[20px] border border-border-card bg-surface-default/90 p-5 shadow-[0_30px_60px_-40px_rgba(36,64,74,0.55)] backdrop-blur-sm sm:p-6">
        {/* 01 — the case */}
        <div className="relative flex items-start gap-4">
          <div className="pointer-events-none absolute -bottom-5 start-[1.375rem] top-11 w-6 -translate-x-1/2 rtl:translate-x-1/2">
            <JourneyLine className="h-full w-full" />
          </div>
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface-default text-brand-800 ring-[1.75px] ring-brand-600">
            <FileHeart size={19} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-pearl px-4 py-3">
            <p className="text-[0.875rem] font-semibold text-brand-900">{caseLabel}</p>
            <span className="mt-2 block h-1.5 w-4/5 rounded-full bg-border-subtle" />
            <span className="mt-1.5 block h-1.5 w-3/5 rounded-full bg-border-subtle" />
          </div>
        </div>

        {/* 02 — clinical matching */}
        <div className="relative mt-5 flex items-start gap-4">
          <div className="pointer-events-none absolute -bottom-5 start-[1.375rem] top-11 w-6 -translate-x-1/2 rtl:translate-x-1/2">
            <JourneyLine className="h-full w-full" />
          </div>
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-surface-default text-brand-800 ring-[1.75px] ring-brand-600">
            <Route size={19} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1 pt-2.5">
            <p className="text-[0.875rem] font-semibold text-brand-900">{matchingLabel}</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {criteria.map((item) => (
                <span key={item} className="inline-flex items-center gap-1 rounded-full bg-surface-clinical px-2.5 py-1 text-[0.75rem] font-medium leading-4 text-brand-800 ring-1 ring-border-clinical">
                  <Check size={12} strokeWidth={2.4} />
                  {item}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* 03 — the panel, one Consultant matched */}
        <div className="relative mt-5 flex items-start gap-4">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-brand-700 text-white shadow-[0_10px_24px_-12px_rgba(31,107,115,0.8)]">
            <Check size={19} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 pt-2.5">
            <p className="text-[0.875rem] font-semibold text-brand-900">{consultantLabel}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {initials.map((mark, index) =>
                index === 0 ? (
                  <span key={`${mark}-${index}`} className="relative grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-[0.68rem] font-semibold tracking-[0.03em] text-white ring-4 ring-brand-100">
                    {mark}
                  </span>
                ) : (
                  <span key={`${mark}-${index}`} className="grid h-9 w-9 place-items-center rounded-full bg-surface-pearl text-[0.68rem] font-semibold tracking-[0.03em] text-ink-400 ring-1 ring-border-subtle">
                    {mark}
                  </span>
                ),
              )}
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[0.75rem] font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {matched}
            </p>
          </div>
        </div>
      </div>
    </figure>
  );
}
