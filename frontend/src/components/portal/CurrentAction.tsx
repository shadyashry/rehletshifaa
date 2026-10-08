"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, CalendarClock, CircleAlert, FileText, MessageSquareText } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import type { WorkCopy } from "@/lib/portal-labels";

/** The backend's resolution of what this person should do now — rendered, never re-derived here. */
export type CurrentActionView = {
  code: string; kind: "COMPLETE" | "FOCUS" | "CLAIM" | "ACCEPT" | "WAIT" | "NONE";
  title?: string | null; context?: string | null; workItemId?: string | null; workItemVersion?: number | null;
  workType?: string | null; dueAt?: string | null; overdue?: boolean; blockerCode?: string | null;
};
export type BlockerView = { code: string; labelEn: string; labelAr: string; owner: "PATIENT" | "STAFF" | "LATER"; gating: boolean };
/** `viewer`: who is looking at this case, per case — the patient (SELF), someone acting for them (REPRESENTATIVE) or STAFF. */
export type CaseViewer = "SELF" | "REPRESENTATIVE" | "STAFF";
export type CaseActions = { journeyStage: string; waitingOn?: string | null; waitingReason?: string | null; currentAction: CurrentActionView; blockers: BlockerView[]; availableActions: string[]; viewer?: CaseViewer };
export type ResponseContext = { message?: string | null; documentName?: string | null; receivedAt?: string | null };
export type SecondaryAction = { label: string; onClick: () => void };

/**
 * The single strongest element on a case page: the one thing to do next, labelled by its business
 * outcome. Who has the ball is stated once, in the case header; this panel explains why.
 *
 * <p>Everything here comes from the backend's action contract. Future workflow steps are absent until
 * they become the current action, and nothing is offered that the backend would refuse.
 */
export function CurrentActionPanel({ locale, role, action, response, busy, secondary = [], form, onComplete, onFocusAction, onClaim, onAcceptAssignment, onDeclineAssignment }: {
  locale: Locale; role: string; action: CurrentActionView; response?: ResponseContext | null; busy?: boolean;
  secondary?: SecondaryAction[];
  /** The form that does a FOCUS step, shown here instead of a button that scrolls to it: one entry point per action. */
  form?: ReactNode;
  onComplete?: (evidence: string) => void; onFocusAction?: () => void; onClaim?: () => void;
  onAcceptAssignment?: () => void; onDeclineAssignment?: () => void;
}) {
  const work = useWorkCopy();
  const t = work.currentAction;
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (role === "patient") return null;

  const copy = describe(action, role, t, locale === "ar" ? work.workTitles : null);
  const found = primaryFor(action, t);
  // With the step's form inline, its submit is the primary; a second button for the same job would only repeat it.
  const primary: Primary = form && found.kind === "focus" ? { label: "", kind: "none" } : found;
  const showResponse = !!response && (!!response.message || !!response.documentName);
  const waiting = action.kind === "WAIT" || action.kind === "NONE";

  return (
    <section id="current-action" aria-labelledby="current-action-title"
             className={`mt-4 rounded-lg border bg-white p-4 shadow-[0_1px_2px_rgba(28,51,58,0.04)] sm:p-5 ${waiting ? "border-line" : "border-brand-200"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-brand-700 rtl:normal-case rtl:tracking-normal">{t.label}</p>
        {action.dueAt && (
          <span className={`inline-flex items-center gap-1 text-[0.8125rem] ${action.overdue ? "font-bold text-alert-700" : "text-ink-500"}`}>
            {action.overdue ? <CircleAlert size={13} aria-hidden/> : <CalendarClock size={13} aria-hidden/>}
            {action.overdue ? t.overdue : t.due}{": "}
            {new Date(action.dueAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      <h2 id="current-action-title" dir="auto" className="mt-1.5 text-[1.1rem] font-bold leading-6 text-brand-900">{copy.title}</h2>
      {copy.body && <p dir="auto" className="mt-1 max-w-2xl text-[0.88rem] leading-6 text-ink-600">{copy.body}</p>}

      {/* What the coordinator has to look at, inline — reviewing should not require navigating away. */}
      {showResponse && (
        <div className="mt-3 rounded-lg border border-line bg-mist p-3">
          {response?.message && (
            <p className="flex gap-2 text-[0.88rem] leading-6 text-ink-700">
              <MessageSquareText size={15} aria-hidden className="mt-1 flex-none text-brand-600"/>
              <span dir="auto" className="line-clamp-3">{response.message}</span>
            </p>
          )}
          {response?.documentName && (
            <p className="mt-1.5 flex items-center gap-2 text-[0.85rem] font-semibold text-ink-700">
              <FileText size={15} aria-hidden className="flex-none text-brand-600"/><bdi>{response.documentName}</bdi>
            </p>
          )}
        </div>
      )}

      {confirming && primary.kind === "complete" ? (
        <form className="mt-4" onSubmit={event => { event.preventDefault(); onComplete?.(note.trim() || primary.label); setConfirming(false); setNote(""); }}>
          <label className="block text-[0.8rem] font-bold text-ink-700">
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {primary.kind !== "none" && (
            <button type="button" className="btn-primary" disabled={busy}
                    onClick={() => { if (primary.kind === "complete") setConfirming(true); else if (primary.kind === "claim") onClaim?.(); else if (primary.kind === "accept") onAcceptAssignment?.(); else onFocusAction?.(); }}>
              {primary.label}<ArrowRight size={16} aria-hidden className="rtl:rotate-180"/>
            </button>
          )}
          {primary.kind === "accept" && onDeclineAssignment && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={onDeclineAssignment}>{t.decline}</button>
          )}
          {(primary.kind === "accept" ? [] : secondary).slice(0, 2).map(item => (
            <button key={item.label} type="button" className="btn-secondary" disabled={busy} onClick={item.onClick}>{item.label}</button>
          ))}
        </div>
      )}
      {form}
    </section>
  );
}

type Primary = { label: string; kind: "complete" | "focus" | "claim" | "accept" | "none" };
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
function describe(action: CurrentActionView, role: string, t: ActionCopy, localizedWork: Record<string, string> | null): Described {
  // Work items are titled by the backend in English; Arabic shows the work type in Arabic and keeps the context.
  if (action.code === "WORK_ITEM") return { title: pick(localizedWork ?? {}, action.workType) ?? action.title ?? "",
    body: localizedWork && LOCALIZED_FORM_HINT.has(action.workType ?? "") ? null : action.context };
  if (action.code === "VIEW_ONLY") return role === "coordinator" ? t.states.VIEW_ONLY : t.states.VIEW_ONLY_STAFF;
  if (action.code === "ACCEPT_ASSIGNMENT") return role === "doctor" ? t.states.ACCEPT_ASSIGNMENT_DOCTOR : t.states.ACCEPT_ASSIGNMENT;
  if (action.code === "WAIT_PATIENT_READINESS") return state(t.readiness, action.blockerCode ?? "") ?? t.readiness.default;
  return state(t.states, action.code) ?? t.states.default;
}
