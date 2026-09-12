import { CheckCircle2, FileText, MapPin, Repeat, Route, Stethoscope, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import type { Dictionary } from "@/lib/dictionary";
import { CaseVisual, ChecksVisual, ContinuityLoop, CoordinationMap, DecisionGate, ProposalVisual, ReviewVisual } from "./JourneyVisuals";

type How = Dictionary["how"];
type Stage = How["stages"][number];

/**
 * The whole journey in one glance, for the hero: five semantic markers on one thin line. It does not
 * repeat the seven stages below — it gives the mental model in three seconds.
 */
export function JourneyPreview({ items }: { items: How["preview"] }) {
  const icons = [FileText, Stethoscope, CheckCircle2, MapPin, Repeat] as const;
  return (
    <ol className="relative grid grid-cols-5 gap-1 before:absolute before:inset-x-[10%] before:top-[19px] before:h-px before:bg-brand-400 sm:max-w-[44rem] sm:gap-3 lg:max-w-none">
      {items.map((label, i) => {
        const Icon = icons[i] ?? FileText;
        return (
          <li key={label} className="relative flex flex-col items-center gap-2 text-center">
            <span className={`grid h-[38px] w-[38px] place-items-center rounded-full border ${i === 2 ? "border-brand-600 bg-brand-600 text-white" : "border-brand-400 bg-surface-elevated text-brand-700"}`}>
              <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="text-[0.72rem] font-semibold leading-4 text-ink-700 sm:text-[0.875rem] sm:leading-5">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The two supporting lines every stage carries: what the patient may need to do, and what comes next. */
function StageNotes({ stage, labels }: { stage: Stage; labels: How["labels"] }) {
  return (
    <dl className="mt-3 space-y-1 text-[0.9375rem] leading-6">
      {[[labels.you, stage.you], [labels.next, stage.next]].map(([term, detail]) => (
        <div key={term} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 rtl:grid-cols-[3.25rem_minmax(0,1fr)]">
          <dt className="pt-[0.25rem] text-[0.66rem] font-bold uppercase tracking-[0.1em] text-brand-600 rtl:text-[0.78rem] rtl:normal-case rtl:tracking-normal">{term}</dt>
          <dd className="text-ink-600">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One numbered stage: marker, title, what happens, the two notes, and its visual. */
function StageBlock({ number, stage, labels, tone = "clinical", strong = false, branch, children }: {
  number: number; stage: Stage; labels: How["labels"]; tone?: "clinical" | "warm"; strong?: boolean;
  /** Desktop only: width/offset classes of the branch that crosses the column gap to the next stage. */
  branch?: string; children?: ReactNode;
}) {
  const id = `stage-${number}`;
  const marker = strong
    ? "bg-brand-600 text-white shadow-none ring-4 ring-brand-100"
    : tone === "warm" ? "journey-marker-warm" : "";
  return (
    <li aria-labelledby={id} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      {/* Desktop only: a precise 1px branch across the gap to the next stage in this row. */}
      {branch && <span aria-hidden className={`absolute top-4 hidden h-px bg-brand-300 lg:block ${branch}`} />}
      <span aria-hidden className={`journey-marker relative z-[1] ${marker}`}>{String(number).padStart(2, "0")}</span>
      <div className="min-w-0 pt-0.5">
        <h3 id={id} className="text-[1.1875rem] font-semibold leading-[1.3] tracking-[-0.01em] text-brand-900 lg:text-[1.3rem]">{stage.title}</h3>
        <p className="mt-2 max-w-[46ch] text-[0.95rem] leading-6 text-ink-600 sm:text-[1rem] sm:leading-7">{stage.what}</p>
        <StageNotes stage={stage} labels={labels} />
        {children}
      </div>
    </li>
  );
}

/** A phase header on the spine: a node on the line, the label and title beside it. */
function PhaseHeader({ index, phase, labels, tone = "clinical" }: { index: number; phase: How["phases"][number]; labels: How["labels"]; tone?: "clinical" | "warm" }) {
  return (
    <header className="relative grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-4 pb-4">
      <span aria-hidden className={`relative z-[1] mx-auto block h-2.5 w-2.5 rounded-full ring-4 ring-surface-pearl ${tone === "warm" ? "bg-accent-warm" : "bg-brand-500"}`} />
      <div>
        <p className="eyebrow">{labels.phase} {index}</p>
        <h2 id={`phase-${index}`} className="mt-0.5 text-[1.0625rem] font-semibold leading-6 text-brand-900 lg:text-[1.125rem]">{phase.title}</h2>
      </div>
    </header>
  );
}

/**
 * Seven stages, four phases, one spine. On desktop each phase is a row hanging off a vertical spine at the
 * start edge — 01 ─ 02 ─ 03, then 04 ─ 05, then 06, then 07 — so several stages share a viewport; on
 * phones the same DOM is one vertical path. All vertical rhythm lives inside the spine's container so the
 * line never breaks between phases; its tone follows the phase — clinical through review and decision,
 * warm through practical coordination, clinical again for care — and it ends at the last marker.
 */
export function CareJourney({ how }: { how: How }) {
  const { stages, phases, labels } = how;
  const spine = "relative before:absolute before:inset-y-0 before:start-[0.96875rem] before:w-px";
  const clinical = `${spine} before:bg-brand-300`;
  const decision = `${spine} before:bg-brand-400`;
  const warm = `${spine} before:bg-accent-warm`;
  const roleIcons = [UserRound, Stethoscope, Route] as const;

  return (
    <>
      {/* Phase 1 — understand your case */}
      <section className="bg-surface-pearl pt-10 md:pt-12" aria-labelledby="phase-1">
        <div className={`container-site ${clinical} before:top-2`}>
          <PhaseHeader index={1} phase={phases[0]} labels={labels} />
          <ol className="grid gap-y-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-7 lg:grid-cols-3" start={1}>
            <StageBlock number={1} stage={stages[0]} labels={labels} branch="-end-8 w-8"><div className="hidden sm:block"><CaseVisual v={how.caseVisual} /></div></StageBlock>
            <StageBlock number={2} stage={stages[1]} labels={labels} branch="-end-8 w-8"><div className="hidden sm:block"><ChecksVisual v={how.caseVisual} /></div></StageBlock>
            <StageBlock number={3} stage={stages[2]} labels={labels}><div className="hidden sm:block"><ReviewVisual v={how.caseVisual} /></div></StageBlock>
          </ol>
          <div className="h-7 md:h-9" />
        </div>
      </section>

      {/* Phase 2 — understand your options: the page's strongest moment, on the clinical mist */}
      <section className="canvas-clinical" aria-labelledby="phase-2">
        <div className={`container-site ${decision}`}>
          <div className="h-6 md:h-7" />
          {/* The trust anchor of the page — said once, at the head of the decision phase, beside its header on desktop. */}
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
            <PhaseHeader index={2} phase={phases[1]} labels={labels} />
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 pb-6 lg:grid-cols-1 lg:pb-7">
              <span aria-hidden className="lg:hidden" />
              <div className="max-w-[60ch] border-s-2 border-brand-500 ps-4">
                <p className="eyebrow">{how.control.eyebrow}</p>
                <p className="mt-1 text-[1.125rem] font-semibold leading-[1.45] text-brand-900 lg:text-[1.25rem]">{how.control.statement}</p>
              </div>
            </div>
          </div>
          <ol className="grid gap-y-6 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-7 lg:gap-x-10" start={4}>
            <StageBlock number={4} stage={stages[3]} labels={labels} strong branch="-end-10 w-10"><ProposalVisual v={how.proposalVisual} /></StageBlock>
            <StageBlock number={5} stage={stages[4]} labels={labels} strong>
              <div className="mt-5 rounded-[12px] border border-border-clinical bg-surface-elevated/60 px-3 pb-4 pt-3 sm:px-4"><DecisionGate v={how.gate} /></div>
            </StageBlock>
          </ol>
          <div className="h-7 md:h-9" />
        </div>
      </section>

      {/* Phase 3 — prepare your care in Egypt: the practical, warm phase */}
      <section className="canvas-hospitality" aria-labelledby="phase-3">
        <div className={`container-site ${warm}`}>
          <div className="h-6 md:h-7" />
          <PhaseHeader index={3} phase={phases[2]} labels={labels} tone="warm" />
          <div className="md:grid md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] md:items-start md:gap-x-8 lg:gap-x-10">
            <ol start={6}>
              <StageBlock number={6} stage={stages[5]} labels={labels} tone="warm">
                <p className="mt-3 flex max-w-[46ch] items-start gap-2.5 text-[0.9375rem] font-semibold leading-6 text-sand-700">
                  <span aria-hidden className="mt-3 h-px w-5 flex-none bg-accent-warm" />
                  {how.plan.conditional}
                </p>
                <div className="mt-5 md:hidden"><CoordinationMap v={how.plan} /></div>
              </StageBlock>
            </ol>
            {/* From tablet: the coordination map beside the stage, on the same row. */}
            <div className="hidden md:block"><CoordinationMap v={how.plan} /></div>
          </div>
          {/* Who does what — indented past the spine. */}
          <div className="ms-12 mt-5 grid gap-3 border-t border-sand-200 pt-4 sm:grid-cols-3 sm:gap-6 lg:mt-6">
            {how.roles.map((r, i) => {
              const Icon = roleIcons[i] ?? UserRound;
              return (
                <div key={r.role} className="flex items-start gap-3">
                  <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-elevated text-brand-700 ring-1 ring-border-subtle"><Icon size={15} strokeWidth={1.8} /></span>
                  <div>
                    <p className="text-[0.9375rem] font-semibold leading-5 text-brand-900">{r.role}</p>
                    <p className="mt-0.5 text-[0.9375rem] leading-5 text-ink-600">{r.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="h-7 md:h-9" />
        </div>
      </section>

      {/* Phase 4 — continue your care; the spine ends at the last marker */}
      <section className="bg-surface-pearl pb-12 md:pb-14" aria-labelledby="phase-4">
        <div className={`container-site ${clinical} before:bottom-auto before:h-[5.75rem] md:before:h-[6rem]`}>
          <div className="h-6 md:h-7" />
          <PhaseHeader index={4} phase={phases[3]} labels={labels} />
          <div className="md:grid md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] md:items-center md:gap-x-8 lg:gap-x-10">
            <ol start={7}>
              <StageBlock number={7} stage={stages[6]} labels={labels}>
                <div className="mt-5 md:hidden"><ContinuityLoop v={how.loop} /></div>
              </StageBlock>
            </ol>
            <div className="hidden md:block md:pb-2"><ContinuityLoop v={how.loop} /></div>
          </div>
        </div>
      </section>
    </>
  );
}
