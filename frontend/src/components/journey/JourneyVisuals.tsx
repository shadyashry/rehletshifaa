import {
  BedDouble, CalendarCheck, CarFront, Check, ClipboardCheck, FileBadge, FileText, FlaskConical, FolderCheck,
  NotebookPen, Plane, ReceiptText, Scan, Stethoscope,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Dictionary } from "@/lib/dictionary";

type How = Dictionary["how"];

/**
 * The information visualisations of the care-journey page. One grammar throughout: outlined nodes for
 * things the patient or the team handles, one filled teal node for the anchor of each visual, hairlines
 * (1px) for relationships, warm sand for the practical/concierge phase. Nothing here is interactive and
 * nothing is decorative — every shape is also said in the adjacent text, so the SVG/CSS is hidden from
 * assistive technology and the DOM order carries the sequence.
 */

/** An outlined label node. */
function Node({ children, tone = "clinical", strong = false, className = "" }: { children: ReactNode; tone?: "clinical" | "warm"; strong?: boolean; className?: string }) {
  const look = strong
    ? "border-brand-600 bg-brand-600 text-white"
    : tone === "warm"
      ? "border-accent-warm bg-surface-elevated text-sand-700"
      : "border-brand-300 bg-surface-elevated text-brand-800";
  return (
    <span className={`inline-flex min-h-7 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-[0.8rem] font-semibold leading-4 ${look} ${className}`}>
      {children}
    </span>
  );
}

const Stem = ({ tone = "clinical", h = "h-3" }: { tone?: "clinical" | "warm"; h?: string }) => (
  <span className={`mx-auto block w-px ${h} ${tone === "warm" ? "bg-accent-warm" : "bg-brand-300"}`} />
);

/** Stage 01 — reports, scans, tests and notes become one coordinated case. */
export function CaseVisual({ v }: { v: How["caseVisual"] }) {
  const icons = [FileText, Scan, FlaskConical, NotebookPen] as const;
  return (
    <div aria-hidden className="mt-5 select-none">
      <ul className="grid grid-cols-4 gap-1.5">
        {v.inputs.map((label, i) => {
          const Icon = icons[i] ?? FileText;
          return (
            <li key={label} className="flex flex-col items-center gap-1 rounded-[10px] border border-dashed border-brand-300 bg-surface-elevated/70 px-1 py-2 text-center text-[0.7rem] font-semibold leading-4 text-ink-600">
              <Icon size={15} strokeWidth={1.7} className="text-brand-600" />
              {label}
            </li>
          );
        })}
      </ul>
      {/* Four inputs gathered by one bracket into one case. */}
      <div className="mx-[12.5%] mt-2 h-3 rounded-b-lg border-x border-b border-brand-300" />
      <Stem />
      <div className="text-center">
        <Node strong><FolderCheck size={14} strokeWidth={2} />{v.file}</Node>
      </div>
    </div>
  );
}

/** Stage 02 — the Coordinator prepares the case: received, organized, asked for more only if needed → prepared. */
export function ChecksVisual({ v }: { v: How["caseVisual"] }) {
  return (
    <div aria-hidden className="mt-5 select-none">
      <ol className="mx-auto w-fit space-y-0">
        {v.checks.map((label, i) => {
          const done = i < 2;
          return (
            <li key={label} className="flex flex-col">
              {i > 0 && <span className="ms-[9px] block h-2.5 w-px bg-brand-300" />}
              <span className="flex items-center gap-2.5 text-[0.85rem] font-semibold leading-5 text-ink-700">
                <span className={`grid h-[19px] w-[19px] flex-none place-items-center rounded-full border ${done ? "border-brand-600 bg-brand-600 text-white" : "border-brand-400 bg-surface-elevated"}`}>
                  {done && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={done ? "" : "font-medium text-ink-600"}>{label}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <Stem />
      <div className="text-center">
        <Node strong><FolderCheck size={14} strokeWidth={2} />{v.prepared}</Node>
      </div>
    </div>
  );
}

/** Stage 03 — the prepared case reaches the Consultant and leaves as a clinical recommendation. */
export function ReviewVisual({ v }: { v: How["caseVisual"] }) {
  return (
    <div aria-hidden className="mt-5 select-none text-center">
      <Node><FolderCheck size={14} strokeWidth={2} />{v.prepared}</Node>
      <Stem />
      <Node className="border-brand-500 text-brand-800"><Stethoscope size={14} strokeWidth={2} />{v.review}</Node>
      <Stem />
      <Node strong><ClipboardCheck size={14} strokeWidth={2} />{v.outcome}</Node>
    </div>
  );
}

/** Stage 04 — recommendation and proposal come together into the patient's options. */
export function ProposalVisual({ v }: { v: How["proposalVisual"] }) {
  return (
    <div aria-hidden className="mt-5 select-none">
      {/* Side by side from lg (joined by one bracket); stacked on one stem below. */}
      <div className="grid gap-2 lg:grid-cols-2 lg:gap-3">
        {[[ClipboardCheck, v.recommendation], [ReceiptText, v.proposal]].map(([Icon, label], i) => (
          <div key={label as string} className="flex flex-col items-center">
            {i > 0 && <span className="lg:hidden"><Stem h="h-2" /></span>}
            <div className="flex w-full items-center gap-2.5 rounded-[12px] border border-border-clinical bg-surface-elevated/80 px-3.5 py-2.5 text-[0.85rem] font-medium leading-5 text-ink-700 lg:items-start lg:py-3">
              <Icon size={16} strokeWidth={1.8} className="flex-none text-brand-600 lg:mt-0.5" />
              {label as string}
            </div>
          </div>
        ))}
      </div>
      {/* Both feed one place. */}
      <div className="mx-[25%] mt-2 hidden h-3 rounded-b-lg border-x border-b border-brand-300 lg:block" />
      <Stem />
      <div className="text-center">
        <Node strong className="px-5 py-1.5 text-[0.9rem]">{v.options}</Node>
      </div>
      <p className="mt-2.5 text-center text-[0.8125rem] leading-5 text-ink-500">{v.note}</p>
    </div>
  );
}

/** Stage 05 — the decision gate. Educational only: branch labels are tracked text on the line, never controls. */
export function DecisionGate({ v }: { v: How["gate"] }) {
  return (
    <div aria-hidden className="select-none">
      <p className="text-center text-[0.8rem] font-bold uppercase tracking-[0.1em] text-brand-800 rtl:text-[0.95rem] rtl:normal-case rtl:tracking-normal">{v.decide}</p>
      <Stem h="h-3" />
      <div className="mx-[25%] h-px bg-brand-400" />
      <div className="grid grid-cols-2 gap-x-4">
        {[[v.yes, v.yesSteps, null], [v.no, null, v.noBody]].map(([label, steps, body]) => (
          <div key={label as string} className="flex flex-col items-center">
            <Stem h="h-3" />
            <span className="flex items-center gap-2 text-[0.8rem] font-bold text-brand-800">
              <span className="h-2 w-2 rounded-full border border-brand-500 bg-surface-elevated" />
              {label as string}
            </span>
            {steps ? (
              <ol className="mt-2 w-full max-w-[13rem] space-y-1 border-s border-brand-300 ps-3 text-[0.8125rem] font-medium leading-[1.15rem] text-ink-700">
                {(steps as string[]).map((step) => <li key={step}>{step}</li>)}
              </ol>
            ) : (
              <p className="mt-2 max-w-[11rem] text-center text-[0.8125rem] leading-5 text-ink-600">{body as string}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Stage 06 — the medical plan anchors appointment timing; travel support is arranged around it, as needed. */
export function CoordinationMap({ v }: { v: How["plan"] }) {
  const icons = [Plane, BedDouble, FileBadge, CarFront] as const;
  return (
    <div aria-hidden className="select-none rounded-[14px] border border-sand-200 bg-surface-elevated/60 px-4 py-4 sm:px-5">
      <div className="text-center">
        <Node strong className="px-4 text-[0.85rem]"><Stethoscope size={14} strokeWidth={2} />{v.center}</Node>
      </div>
      <Stem h="h-3" />
      <div className="text-center">
        <Node className="border-brand-500 px-4"><CalendarCheck size={14} strokeWidth={2} />{v.appointment}</Node>
      </div>
      <Stem tone="warm" h="h-3" />
      {/* One warm bar from which the optional services hang (a plain 2×2 on phones). */}
      <div className="mx-[12.5%] hidden h-px bg-accent-warm lg:block" />
      <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-x-1.5 lg:gap-y-0">
        {v.services.map((label, i) => {
          const Icon = icons[i] ?? Plane;
          return (
            <li key={label} className="flex flex-col items-center">
              <span className="hidden lg:block"><Stem tone="warm" h="h-3" /></span>
              <span className="flex w-full flex-col items-center gap-1 rounded-[10px] border border-dashed border-accent-warm bg-surface-elevated px-1 py-1.5 text-center text-[0.75rem] font-semibold leading-4 text-sand-700 lg:text-[0.74rem] xl:text-[0.78rem]">
                <Icon size={15} strokeWidth={1.7} />
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-center text-[0.8125rem] font-medium leading-5 text-ink-600">{v.note}</p>
    </div>
  );
}

/** Stage 07 — care continues: arrival, treatment, follow-up, and coordination that carries on. */
export function ContinuityLoop({ v }: { v: How["loop"] }) {
  const [arrival, treatment, followUp, continued] = v;
  return (
    <div aria-hidden className="select-none">
      {/* Upright on phones, one line from sm. */}
      <ol className="flex flex-col items-center sm:flex-row sm:justify-center">
        {[arrival, treatment, followUp].map((label, i) => (
          <li key={label} className="flex flex-col items-center sm:flex-row">
            {i > 0 && <span className="h-4 w-px bg-brand-400 sm:h-px sm:w-10" />}
            <Node strong={i === 1} className="px-3.5 py-1.5 text-[0.8rem] sm:px-4 sm:text-[0.875rem]">{label}</Node>
          </li>
        ))}
      </ol>
      {/* An open return — coordination continues past follow-up, without closing into a circle. */}
      <svg className="mx-auto mt-1.5 hidden h-12 w-full max-w-[24rem] rtl:-scale-x-100 sm:block" viewBox="0 0 240 48" fill="none" focusable="false">
        <path className="journey-path" d="M204 2 C 204 36, 140 42, 120 42" vectorEffect="non-scaling-stroke" />
        <circle cx="120" cy="42" r="3" fill="var(--color-brand-600)" />
      </svg>
      <span className="mx-auto mt-1 block h-4 w-px bg-brand-400 sm:hidden" />
      <p className="mt-1 text-center text-[0.875rem] font-semibold leading-5 text-brand-700 sm:-mt-0.5">{continued}</p>
    </div>
  );
}
