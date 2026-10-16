"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, CalendarClock, CircleAlert, FileText, MessageSquareText } from "lucide-react";

import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { scrollIntoView } from "@/lib/scroll";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate, plural, workCopyText, type WorkCopy, type WorkItemCopy } from "@/lib/portal-labels";

/** The backend's resolution of what this person should do now — rendered, never re-derived here. */
export type CurrentActionView = {
  code: string; kind: "COMPLETE" | "FOCUS" | "CLAIM" | "ACCEPT" | "WAIT" | "NONE";
  title?: string | null; context?: string | null; workItemId?: string | null; workItemVersion?: number | null;
  workType?: string | null; dueAt?: string | null; overdue?: boolean; blockerCode?: string | null;
  /** For a work item: the wording code and parameters (the English `title`/`context` are the fallback). */
  copy?: WorkItemCopy | null;
  /** NONE on a journey that ended after acceptance: the calm word it ended with (WITHDRAWN, CANCELLED, EXPIRED, COMPLETED, CLOSED). */
  exit?: string | null;
  /** On a waiting state: how many working days the team usually takes over it (the backend's SLA table, P1-6). */
  expectedWorkingDays?: number | null;
};
export type BlockerView = { code: string; labelEn: string; labelAr: string; owner: "PATIENT" | "STAFF" | "LATER"; gating: boolean };
/** `viewer`: who is looking at this case, per case — the patient (SELF), someone acting for them (REPRESENTATIVE) or STAFF. */
export type CaseViewer = "SELF" | "REPRESENTATIVE" | "STAFF";
export type CaseActions = { journeyStage: string; waitingOn?: string | null; waitingReason?: string | null; currentAction: CurrentActionView; blockers: BlockerView[]; availableActions: string[]; viewer?: CaseViewer;
  /** The code `waitingReason` is worded from (see `waitingReasonText`). */
  waitingReasonCode?: string | null;
  /**
   * UX area 2 (D-06), coordinators only: the step the patient's own page shows now, resolved by the patient's rule (code,
   * kind, due, exit word, usual window; never the request's free text). Absent for every other viewer.
   */
  patientStep?: CurrentActionView | null };
export type ResponseContext = { message?: string | null; documentName?: string | null; receivedAt?: string | null };
/** `opensDialog`: the action opens a dialog (the strip's reply opens the messages drawer), said to assistive technology. */
export type SecondaryAction = { label: string; onClick: () => void; opensDialog?: boolean };

/**
 * The single strongest element on a case page: the one thing to do next ("Your step"), labelled by its business
 * outcome. It is the strip of the case file's cover (UX area 2): the cover draws the edge and the identity above it, and
 * `facts` — who the case waits on and what the patient's own page says now — sit beside the step, said once on the page.
 *
 * <p>Everything here comes from the backend's action contract. Future workflow steps are absent until
 * they become the current action, and nothing is offered that the backend would refuse.
 */
export function CurrentActionPanel({ locale, role, action, stage, response, busy, secondary = [], form, facts, respondBy, onComplete, onFocusAction, onClaim, onAcceptAssignment, onDeclineAssignment }: {
  locale: Locale; role: string; action: CurrentActionView; response?: ResponseContext | null; busy?: boolean;
  /** The case's stage, for wording only: the same step reads differently by stage (the backend still decides the step). */
  stage?: string;
  secondary?: SecondaryAction[];
  /** The form that does a FOCUS step, shown here instead of a button that scrolls to it: one entry point per action. */
  form?: ReactNode;
  /** The strip's other lines (waiting on, the patient's page), beside the step on wide screens and under its title on phones. */
  facts?: ReactNode;
  /** P1-6: when the offer this panel accepts or declines expires (ISO instant); shown with the time, in place of the day-only due date. */
  respondBy?: string | null;
  onComplete?: (evidence: string) => void; onFocusAction?: () => void; onClaim?: () => void;
  onAcceptAssignment?: () => void; onDeclineAssignment?: () => void;
}) {
  const work = useWorkCopy();
  const t = work.currentAction;
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (role === "patient") return null;

  const worded = stagedAction(action, stage);
  const copy = describe(worded, role, t, locale === "ar" ? work.workTitles : null, work.workCopy);
  const found = primaryFor(worded, t);
  // With the step's form inline, its submit is the primary; a second button for the same job would only repeat it. With the
  // form elsewhere on the page (UX 3-1, every role), the strip only points to it: the form's own submit is the view's one
  // filled action.
  const primary: Primary = form && found.kind === "focus" ? { label: "", kind: "none" } : found;
  const pointsToForm = primary.kind === "focus";
  const showResponse = !!response && (!!response.message || !!response.documentName);
  const waiting = action.kind === "WAIT" || action.kind === "NONE";
  const deadline = primary.kind === "accept" && respondBy ? respondBy : null;
  const hasWork = showResponse || primary.kind !== "none" || secondary.length > 0 || !!form;

  // Phones read the step, then the facts, then the work; wide screens keep the facts in a column beside both. When the work
  // is a reply to read (the patient's response), the facts come after it on phones (UX 2-4): the reply is what the step is about.
  const factsAfterWork = showResponse;
  const factsColumn = facts ? <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">{facts}</div> : null;
  return (
    <section id="current-action" aria-labelledby="current-action-title"
             className={`grid gap-x-8 gap-y-4 ${facts ? "lg:grid-cols-[minmax(0,1fr)_17rem]" : ""}`}>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="label-micro text-brand-700">{stepLabel(action, work)}</p>
          {deadline ? (
            <span className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-500">
              <CalendarClock size={13} aria-hidden/>
              {t.respondBy.replace("{time}", new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(deadline)))}
            </span>
          ) : waiting && action.expectedWorkingDays ? (
            <span className="inline-flex items-center gap-1 text-[0.8125rem] text-ink-500">
              <CalendarClock size={13} aria-hidden/>
              {t.usuallyWithin.replace("{duration}", plural(locale, action.expectedWorkingDays, work.plural.workingDays))}
            </span>
          ) : action.dueAt && (
            <span className={`inline-flex items-center gap-1 text-[0.8125rem] ${action.overdue ? "font-bold text-alert-700" : "text-ink-500"}`}>
              {action.overdue ? <CircleAlert size={13} aria-hidden/> : <CalendarClock size={13} aria-hidden/>}
              {fillTemplate(action.overdue ? work.caseCover.overdueSince : work.caseCover.dueOn, { date: new Date(action.dueAt).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short" }) })}
            </span>
          )}
        </div>

        {/* Under the case name (the cover's h2). Focusable from code when the step has no control of its own, with a visible ring. */}
        <h3 id="current-action-title" tabIndex={-1} dir="auto" className="mt-1.5 rounded-sm text-[1.25rem] font-bold leading-7 text-brand-900 outline-none focus:outline-2 focus:outline-offset-4 focus:outline-brand-600">{copy.title}</h3>
        {copy.body && <p dir="auto" className="mt-1 max-w-[65ch] text-[0.9375rem] leading-6 text-ink-600">{copy.body}</p>}
      </div>

      {!factsAfterWork && factsColumn}

      {hasWork && <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        {/* What the coordinator has to look at, inline — reviewing should not require navigating away. A hairline, not a tinted box. */}
        {showResponse && (
          <div className="border-y border-line py-3">
            {response?.message && (
              <p className="flex gap-2 text-[0.9375rem] leading-6 text-ink-700">
                <MessageSquareText size={15} aria-hidden className="mt-1 flex-none text-brand-600"/>
                <span dir="auto" className="line-clamp-3">{response.message}</span>
              </p>
            )}
            {response?.documentName && (
              <p className="mt-1.5 flex items-center gap-2 text-[0.875rem] font-semibold text-ink-700">
                <FileText size={15} aria-hidden className="flex-none text-brand-600"/><bdi>{response.documentName}</bdi>
              </p>
            )}
          </div>
        )}

        {confirming && primary.kind === "complete" ? (
          <form className="mt-4 first:mt-0" onSubmit={event => { event.preventDefault(); onComplete?.(note.trim() || primary.label); setConfirming(false); setNote(""); }}>
            <label className="block text-[0.8125rem] font-bold text-ink-700">
              {t.note}
              <input className="field mt-1.5" value={note} maxLength={2000} onChange={event => setNote(event.target.value)}
                     placeholder={t.notePlaceholder} autoFocus/>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy}>{primary.label}</button>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>{t.cancel}</button>
            </div>
          </form>
        ) : (primary.kind !== "none" || secondary.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 first:mt-0">
            {pointsToForm ? (
              <button type="button" className="link-cta text-[0.9375rem]" aria-label={fillTemplate(t.goToFormFor, { action: primary.label })} onClick={() => onFocusAction?.()}>
                {t.goToForm}<ArrowDown size={16} aria-hidden/>
              </button>
            ) : primary.kind !== "none" && (
              <button type="button" className="btn-primary" disabled={busy}
                      onClick={() => { if (primary.kind === "complete") setConfirming(true); else if (primary.kind === "claim") onClaim?.(); else if (primary.kind === "accept") onAcceptAssignment?.(); else onFocusAction?.(); }}>
                {primary.label}<ArrowRight size={16} aria-hidden className="rtl:rotate-180"/>
              </button>
            )}
            {primary.kind === "accept" && onDeclineAssignment && (
              <button type="button" className="btn-secondary" disabled={busy} onClick={onDeclineAssignment}>{t.decline}</button>
            )}
            {(primary.kind === "accept" ? [] : secondary).slice(0, 2).map(item => (
              <button key={item.label} type="button" className="btn-secondary" disabled={busy} aria-haspopup={item.opensDialog ? "dialog" : undefined} onClick={item.onClick}>{item.label}</button>
            ))}
          </div>
        )}
        {form}
      </div>}
      {factsAfterWork && factsColumn}
    </section>
  );
}

type Primary = { label: string; kind: "complete" | "focus" | "claim" | "accept" | "none" };

/**
 * The step as it is worded at this stage. "Record clinical decision" on an arrived patient is the final in-person
 * assessment, so it reads as that; the code the backend sent still decides what the step is.
 */
const stagedAction = (action: CurrentActionView, stage?: string): CurrentActionView =>
  action.code === "RECORD_CLINICAL_DECISION" && stage === "ARRIVAL_CONFIRMED" ? { ...action, code: "RECORD_FINAL_ASSESSMENT" } : action;
type ActionCopy = WorkCopy["currentAction"];
const pick = (table: Record<string, string>, key?: string | null) => (key && Object.hasOwn(table, key) ? table[key] : undefined);

/** One button per state, named for the outcome. Waiting states have none: offering a future step here is the premature action this panel exists to prevent. */
function primaryFor(action: CurrentActionView, t: ActionCopy): Primary {
  switch (action.kind) {
    case "CLAIM": return { label: t.claim, kind: "claim" };
    case "ACCEPT": return { label: t.accept, kind: "accept" };
    case "COMPLETE": case "FOCUS": {
      const label = pick(t.work, action.workType) ?? pick(t.actions, action.code) ?? t.done;
      return { label, kind: action.kind === "COMPLETE" ? "complete" : "focus" };
    }
    default: return { label: "", kind: "none" };
  }
}

type Described = { title: string; body?: string | null };
/** Work items whose inline form carries its own localized explanation, so the English context is not repeated in Arabic. */
const LOCALIZED_FORM_HINT = new Set(["PROPOSAL_TERMS_CALL"]);
const state = (table: Record<string, Described>, key: string) => (Object.hasOwn(table, key) ? table[key] : undefined);

/**
 * Title and explanation per resolved action, in the viewer's terms. A work item speaks for itself; view-only and new
 * assignments read differently for a coordinator than for a Consultant or another team.
 */
function describe(action: CurrentActionView, role: string, t: ActionCopy, localizedWork: Record<string, string> | null, wording: WorkCopy["workCopy"]): Described {
  if (action.code === "WORK_ITEM") {
    const known = workCopyText(action.copy, wording);
    if (known) return { title: known.title, body: known.context };
  }
  // Work without a known code keeps the backend's English; Arabic shows the work type in Arabic and keeps the context.
  if (action.code === "WORK_ITEM") return { title: pick(localizedWork ?? {}, action.workType) ?? action.title ?? "",
    body: localizedWork && LOCALIZED_FORM_HINT.has(action.workType ?? "") ? null : action.context };
  if (action.code === "VIEW_ONLY") return role === "coordinator" ? t.states.VIEW_ONLY : t.states.VIEW_ONLY_STAFF;
  if (action.code === "ACCEPT_ASSIGNMENT") return role === "doctor" ? t.states.ACCEPT_ASSIGNMENT_DOCTOR : t.states.ACCEPT_ASSIGNMENT;
  if (action.code === "WAIT_PATIENT_READINESS") return state(t.readiness, action.blockerCode ?? "") ?? t.readiness.default;
  return state(t.states, action.code) ?? t.states.default;
}

/** Whether the step is the viewer's to take: a waiting or empty step reads as "This case now", never "Your step". */
export const isOwnStep = (action: CurrentActionView) => action.kind !== "WAIT" && action.kind !== "NONE";
export const stepLabel = (action: CurrentActionView, work: LocalizedWorkCopy) => isOwnStep(action) ? work.caseCover.yourStep : work.caseCover.now;

/** The step's title as the panel words it, for the case's sticky line (the same words, never a second rule). */
export function actionTitle(action: CurrentActionView, role: string, work: LocalizedWorkCopy, stage?: string) {
  return describe(stagedAction(action, stage), role, work.currentAction, work.locale === "ar" ? work.workTitles : null, work.workCopy).title;
}

/**
 * Moves the focus to the step's own control — its primary button or the first field of its inline form — or, on a
 * waiting step with nothing to press, to its title; scrolled to the middle of the screen so no sticky bar covers it.
 */
export function focusCurrentAction() {
  const panel = document.getElementById("current-action");
  // The primary first (a selector list would return whichever comes first in the page), then the form's first field.
  const target = panel?.querySelector<HTMLElement>(".btn-primary:not(:disabled)")
    ?? panel?.querySelector<HTMLElement>(":is(input, select, textarea, button, summary, a[href]):not(:disabled):not([type=hidden])")
    ?? document.getElementById("current-action-title");
  // Instant, overriding the page's smooth scrolling: the sticky line leaves as the cover returns, and its going cuts a
  // smooth scroll short, stranding the control above the screen.
  scrollIntoView(target, { block: "center", behavior: "instant" });
  target?.focus({ preventScroll: true });
}
