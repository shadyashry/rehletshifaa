"use client";

import { useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import { ChevronDown, CircleDot, Plus } from "lucide-react";

import { CareAreaIcon } from "@/components/care-areas/CareAreaIcon";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { careAreaMeta } from "@/lib/care-area-catalog";
import { careAreaLabel, fillTemplate } from "@/lib/portal-labels";
import type { CaseSummary } from "@/components/portal/MyCare";

/** A case is past once nothing more happens in it; past cases sit folded away under the open ones. */
const PAST = new Set(["CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE"]);
export const isPastCase = (status: string) => PAST.has(status);

/**
 * Switching cases replaces the whole case view, so the card that was pressed is gone; the case view that arrives takes
 * focus to its heading. The intent names the case it was for and is cleared by the next case view to mount either way,
 * so an open that failed or was cancelled can never pull focus later.
 */
let focusOnArrival: string | null = null;
export function takeArrivalFocus(caseId: string) { const pending = focusOnArrival === caseId; focusOnArrival = null; return pending; }

/** A care area's identity: its system icon on the system's well. The icon carries identity; the tone only supports it. */
export function CareAreaMark({ slug, size = "md" }: { slug?: string | null; size?: "md" | "lg" }) {
  const meta = slug ? careAreaMeta(slug) : undefined;
  const tone = meta ? ({ "--sys-well": `var(--color-system-${meta.system}-well)`, "--sys-deep": `var(--sys-${meta.system}-deep, var(--color-brand-800))` } as CSSProperties) : undefined;
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <span aria-hidden style={tone} className={`care-grid-icon grid ${box} flex-none place-items-center rounded-full ${meta ? "" : "bg-mist-deep text-brand-700"}`}>
      {meta ? <CareAreaIcon name={meta.icon} size={size === "lg" ? 22 : 19} strokeWidth={1.7}/> : <CircleDot size={18} strokeWidth={1.7}/>}
    </span>
  );
}

type Group = { key: string; title: string | null; cases: CaseSummary[] };

/**
 * "Your cases": every case the account can open, as cards above the case itself — only when there is more than one.
 * Grouped by whose care it is when the account sees more than one person's cases (from the backend's per-case viewer,
 * never from names), the open cases first and the past ones folded away. "Send a new case" is for the account holder
 * themselves; sending one for someone else is not offered here.
 */
export function CaseSwitcher({ cases, currentId, phases, onOpenCase, newCaseHref }: {
  cases: CaseSummary[]; currentId: string; phases: readonly string[]; onOpenCase: (id: string) => void; newCaseHref: string | null;
}) {
  const work = useWorkCopy();
  const t = work.myCare.cases;
  const open = cases.filter(c => !isPastCase(c.status));
  const past = cases.filter(c => isPastCase(c.status));
  const groups = byPerson(open, t.yourCare, t.careFor, t.someoneElse);
  const pastHoldsCurrent = past.some(c => c.id === currentId);

  const card = (c: CaseSummary) => <CaseCard key={c.id} item={c} current={c.id === currentId} phases={phases} onOpenCase={onOpenCase}/>;
  return (
    <section aria-labelledby="your-cases-title" className="mb-6">
      <h2 id="your-cases-title" className="eyebrow">{t.title}</h2>
      {/* People side by side where there is room; each person's cases scroll in a row on phones. */}
      <div className="sm:flex sm:flex-wrap sm:gap-x-8">
        {groups.map(group => (
          <div key={group.key} className="mt-3 min-w-0">
            {group.title && <h3 className="mb-2 text-[0.9375rem] font-semibold text-brand-900">{group.title}</h3>}
            {/* Flex lists lose their list role in WebKit; it is restored so "n of m" is still announced. */}
            <ul role="list" className="case-row">{group.cases.map(card)}</ul>
          </div>
        ))}
      </div>
      {newCaseHref && (
        <p className="mt-2">
          <a href={newCaseHref} className="link-cta inline-flex min-h-11 items-center gap-2 text-[0.9375rem]"><Plus size={16} aria-hidden className="flex-none"/>{t.sendNew}</a>
        </p>
      )}
      {past.length > 0 && (
        <details className="group mt-3" open={pastHoldsCurrent || undefined}>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-brand-700 hover:text-brand-800 hover:underline [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180"/>
            {t.past} <span className="text-ink-500 tabular-nums">({past.length})</span>
          </summary>
          <ul role="list" className="case-row mt-2">{past.map(card)}</ul>
        </details>
      )}
    </section>
  );
}

function CaseCard({ item, current, phases, onOpenCase }: { item: CaseSummary; current: boolean; phases: readonly string[]; onOpenCase: (id: string) => void }) {
  const work = useWorkCopy();
  const t = work.myCare.cases;
  const pastStatus = t.pastStatus as Record<string, string>;
  const area = item.careCategory ? careAreaLabel(item.careCategory, work.careAreas) : null;
  const where = isPastCase(item.status) ? pastStatus[item.status] ?? pastStatus.CLOSED : phases[phaseIndex(item.status)];
  const needsYou = item.waitingOn === "PATIENT" && !isPastCase(item.status);
  const link = useRef<HTMLAnchorElement>(null);
  // On a phone the row scrolls: the open case is brought into the row's view when the switcher arrives with it.
  useEffect(() => { if (current) link.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [current]);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click keeps the browser's own behaviour (a new tab on this case); a plain one switches in place.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (current) return;
    focusOnArrival = item.id;
    onOpenCase(item.id);
  };
  return (
    <li className="case-row-item">
      <a ref={link} href={`?case=${encodeURIComponent(item.id)}`} onClick={open} aria-current={current ? "page" : undefined}
         className="case-card card flex h-full min-h-[7.25rem] flex-col gap-3 p-4">
        <span className="flex items-center gap-3">
          <CareAreaMark slug={item.careCategory}/>
          <span className="min-w-0">
            {area && <span className="block truncate text-[1rem] font-semibold leading-6 text-brand-900" title={area}>{area}</span>}
            <span className={`block tabular-nums ${area ? "text-[0.8125rem] leading-5 text-ink-500" : "text-[1rem] font-semibold leading-6 text-brand-900"}`}><bdi dir="ltr">{item.caseNumber}</bdi></span>
          </span>
        </span>
        <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="text-[0.875rem] leading-5 text-ink-600">{where}</span>
          {needsYou && <span className="status-badge">{t.needsYou}</span>}
        </span>
      </a>
    </li>
  );
}

/**
 * One group when every case is the account's own; otherwise the account's own first, then one group per person
 * represented. Whose case it is comes from the backend's per-case relation; the person within the represented cases is
 * told apart by the patient's name, the only identity the patient's case list carries.
 */
function byPerson(cases: CaseSummary[], yourCare: string, careFor: string, someoneElse: string): Group[] {
  const self = cases.filter(c => c.viewer !== "REPRESENTATIVE");
  const others = new Map<string, CaseSummary[]>();
  for (const c of cases) if (c.viewer === "REPRESENTATIVE") {
    const key = c.patientName?.trim() || "";
    others.set(key, [...(others.get(key) ?? []), c]);
  }
  if (others.size === 0) return self.length ? [{ key: "self", title: null, cases: self }] : [];
  const groups: Group[] = self.length ? [{ key: "self", title: yourCare, cases: self }] : [];
  for (const [name, list] of others) groups.push({ key: `rep:${name}`, title: name ? fillTemplate(careFor, { name: `⁨${name}⁩` }) : someoneElse, cases: list });
  return groups;
}

/** Patient-facing phases; internal statuses are mapped into them and never shown. */
const PHASES = [
  ["DRAFT", "RECEIVED"], ["INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT"],
  ["CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "CLINICAL_RECOMMENDATION_READY", "CLINICALLY_NOT_SUITABLE"],
  ["PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED", "PATIENT_DECISION", "DECLINED", "EXPIRED"],
  ["ACCEPTED"], ["TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "ADMISSION_READY", "TREATMENT_IN_PROGRESS"], ["DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED"],
];
export function phaseIndex(status: string) { const found = PHASES.findIndex(group => group.includes(status)); return found < 0 ? 0 : found; }
