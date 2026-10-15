"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { Fact, Task as PanelTask, instant, pick, submit, text } from "@/components/portal/panel-parts";
import type { FollowUpContact, FollowUpOutcome, FollowUpView, Mutate } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["followUp"];
export type FollowUpRole = "doctor" | "coordinator";

/** Work types whose work is done in this panel, so "do it" lands on its next form (P1-18). */
export const FOLLOW_UP_WORK: ReadonlySet<string> = new Set(["FOLLOW_UP_CONTACT", "REBOOK_FOLLOW_UP", "REVIEW_COMPLICATION", "CHECK_IN_D3", "CHECK_IN_D14", "CHECK_IN_D30"]);
/** The case states this panel belongs to: from discharge, through follow-up, to a closed case (outcomes and reviews outlive it). */
export const FOLLOW_UP_STAGES: ReadonlySet<string> = new Set(["DISCHARGED", "FOLLOW_UP", "CLOSED"]);
/** Contacts are booked, recorded and cancelled only while the patient is discharged or in follow-up (else FOLLOW_UP_NOT_ACTIVE). */
const RECORDABLE = new Set(["DISCHARGED", "FOLLOW_UP"]);
const MODES = ["VIDEO", "PHONE", "IN_PERSON"] as const;
const ANCHOR = "follow-up-next";

/**
 * P1-18, staff case page: the "Follow-up" panel (design §5 stage 6), as `GET /{doctor|coordinator}/cases/{id}/follow-up` returns
 * it. The free window, the plan, the contacts, the coordinator's check-ins, the patient's outcome answers and what still holds the
 * case open — closing is automatic, so there is no close button. The Consultant books, records and cancels contacts and reviews a
 * reported complication; the coordinator records the check-ins and reads the rest without its clinical text (the API leaves it
 * out). One primary action — the viewer's current work — and the rest one click away.
 */
export function FollowUpPanel({ locale, role, caseId, caseStatus, currentCode, busy, mutate, load }: {
  locale: Locale; role: FollowUpRole; caseId: string; caseStatus: string;
  /** The viewer's current work type, which picks what opens first. */
  currentCode?: string | null;
  busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const t = useWorkCopy().followUp;
  const id = useId();
  const [view, setView] = useState<FollowUpView | null | undefined>(undefined);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const when = useCallback((iso?: string | null) => iso ? dateTime.format(new Date(iso)) : "—", [dateTime]);

  useEffect(() => {
    let live = true;
    load<FollowUpView>(`/${role}/cases/${caseId}/follow-up`).then(value => { if (live) setView(value); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, role, caseId, caseStatus]);

  /** Every follow-up command answers with the panel's view. */
  const act = useCallback(async (path: string, body: unknown) => {
    const result: unknown = await mutate(path, body);
    if (!result) return false;
    if (typeof result === "object" && result !== null && "contacts" in result && "checkIns" in result) setView(result as FollowUpView);
    return true;
  }, [mutate]);

  if (view === undefined) return null;
  if (view === null) return <section id="follow-up-panel" className="card p-5"><h3 className="title text-base">{t.title}</h3><p role="alert" className="mt-2 text-[0.875rem] text-alert-800">{t.loadFailed}</p></section>;

  const status = view.caseStatus ?? caseStatus;
  // A case closed before discharge (declined, cancelled) has no follow-up: nothing to show.
  if (status === "CLOSED" && !view.window && view.contacts.length === 0 && view.outcomes.length === 0) return null;
  const doctor = role === "doctor";
  const recordable = RECORDABLE.has(status);
  const scheduled = view.contacts.filter(c => c.status === "SCHEDULED").toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  const toReview = view.outcomes.filter(o => o.complication && !o.reviewedAt);
  const dueCheckIns = view.checkIns.filter(c => c.status === "DUE");
  // The next thing this viewer does here: it opens first and carries the panel's one primary button.
  const next = doctor
    ? currentCode === "REVIEW_COMPLICATION" && toReview.length ? `review:${toReview[0].point}`
      : currentCode === "FOLLOW_UP_CONTACT" && recordable && scheduled.length ? `record:${scheduled[0].id}` : null
    : currentCode?.startsWith("CHECK_IN_") && dueCheckIns.some(c => `CHECK_IN_${c.point}` === currentCode) ? `check:${currentCode.slice("CHECK_IN_".length)}` : null;
  const closed = status === "CLOSED";

  return (
    <section id="follow-up-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
        {(status === "FOLLOW_UP" || closed) && <StatusBadge tone={closed ? "neutral" : "info"}>{closed ? t.state.closed : t.state.open}</StatusBadge>}
      </div>

      {/* THE FREE WINDOW (D-G) */}
      {view.window ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.85rem] sm:grid-cols-3">
          <Fact label={t.window.discharged}>{day.format(new Date(view.window.dischargedAt))}</Fact>
          <Fact label={t.window.freeDays}>{fillTemplate(t.window.days, { days: String(view.window.freeDays) })}</Fact>
          <Fact label={view.window.closedAt ? t.window.ended : t.window.ends}>{day.format(new Date(view.window.closedAt ?? view.window.endsAt))}</Fact>
        </dl>
      ) : <p className="mt-1 text-[0.85rem] text-ink-600">{t.window.none}</p>}

      {/* A complication after closure: the existing reopen (P1-13) is the way back into follow-up. */}
      {view.reopenAvailable && (
        <p className="mt-3 max-w-[65ch] text-[0.875rem] text-ink-800">
          {t.reopen} <a href="#reopen-case" className="inline-flex min-h-11 items-center font-bold text-brand-700 underline underline-offset-4">{t.reopenLink}</a>
        </p>
      )}

      {/* WHAT HOLDS THE CASE OPEN — instead of a close button. */}
      {status === "FOLLOW_UP" && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.closure.title}</h4>
          {view.closureBlockers.length > 0 ? <>
            <ul className="mt-1 space-y-1 text-[0.85rem] text-ink-700">
              {view.closureBlockers.map(b => <li key={b.code} className="flex items-start gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-ink-400"/>{pick(t.closure.blockers, b.code)}</li>)}
            </ul>
            <p className="mt-1.5 max-w-[65ch] text-[0.8125rem] text-ink-600">{t.closure.automatic}</p>
          </> : <p className="mt-1 text-[0.85rem] text-ink-700">{t.closure.ready}</p>}
        </div>
      )}

      {/* THE PLAN */}
      {view.plan && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.plan.title}</h4>
          <p className="mt-1 text-[0.85rem] text-ink-800">{pick(t.modes, view.plan.mode)} · {when(view.plan.dueAt)}</p>
          {(view.plan.requiredTests || view.plan.instructions) && (
            <dl className="mt-1 grid gap-x-4 text-[0.8125rem] sm:grid-cols-[auto_1fr]">
              {view.plan.requiredTests && <Detail label={t.plan.tests}>{view.plan.requiredTests}</Detail>}
              {view.plan.instructions && <Detail label={t.plan.instructions}>{view.plan.instructions}</Detail>}
            </dl>
          )}
        </div>
      )}

      {/* THE CONTACTS */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.contacts.title}</h4>
        {view.contacts.length === 0 ? <p className="mt-1 text-[0.85rem] text-ink-600">{t.contacts.none}</p>
          : <ul className="mt-1 divide-y divide-line">{view.contacts.map(c => <ContactRow key={c.id} t={t} contact={c} when={when}/>)}</ul>}
        {!doctor && currentCode === "REBOOK_FOLLOW_UP" && <p className="mt-2 max-w-[65ch] text-[0.85rem] font-semibold text-ink-800">{t.rebook}</p>}
      </div>

      {/* THE CHECK-INS */}
      {view.checkIns.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.checkIns.title}</h4>
          <ul className="mt-1 divide-y divide-line">
            {view.checkIns.map(c => (
              <li key={c.point} className="py-2 text-[0.85rem]">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-ink-900">{pick(t.checkIns.points, c.point)}</span>
                  <StatusBadge tone={c.status === "DONE" ? "success" : c.status === "DUE" ? "warning" : "neutral"}>{pick(t.checkIns.status, c.status)}</StatusBadge>
                  <span className="text-[0.8125rem] text-ink-600">{c.outcome ? `${pick(t.checkIns.outcomes, c.outcome)} · ${when(c.recordedAt)}` : fillTemplate(t.checkIns.due, { when: when(c.dueAt) })}</span>
                </p>
                {c.note && <p dir="auto" className="mt-0.5 whitespace-pre-wrap break-words ps-1 text-[0.8125rem] text-ink-700">{c.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* THE OUTCOMES */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.outcomes.title}</h4>
        {view.outcomes.length === 0 ? <p className="mt-1 max-w-[65ch] text-[0.85rem] text-ink-600">{t.outcomes.none}</p>
          : <ul className="mt-1 divide-y divide-line">{view.outcomes.map(o => <OutcomeRow key={o.point} t={t} outcome={o} doctor={doctor} when={when}/>)}</ul>}
      </div>

      {/* RECORDING — the Consultant */}
      {doctor && (
        <div className="mt-3">
          {toReview.map(o => (
            <Task key={o.point} title={fillTemplate(t.outcomes.reviewForm, { point: pick(t.outcomes.points, o.point) })} next={next === `review:${o.point}`}>
              <NoteForm label={t.outcomes.reviewNote} hint={t.outcomes.reviewHint} name="note" required save={t.outcomes.saveReview} primary={next === `review:${o.point}`} busy={busy}
                        onSubmit={data => act(`/doctor/cases/${caseId}/follow-up/outcomes/${o.point}/review`, { note: text(data.get("note")) })}/>
            </Task>
          ))}
          {recordable && scheduled.map(c => (
            <Task key={c.id} title={fillTemplate(t.record.title, { when: when(c.dueAt) })} next={next === `record:${c.id}`}>
              <RecordForm t={t} primary={next === `record:${c.id}`} busy={busy}
                          onRecord={body => act(`/doctor/cases/${caseId}/follow-up/contacts/${c.id}`, body)}/>
            </Task>
          ))}
          {recordable && (
            <Task title={t.book.title} next={false}>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/doctor/cases/${caseId}/follow-up/contacts`, { dueAt: instant(data.get("dueAt")), mode: data.get("mode") }))}>
                <label className="block text-sm font-semibold">{t.book.dueAt}<input className="field" name="dueAt" type="datetime-local" required/></label>
                <label className="block text-sm font-semibold">{t.book.mode}
                  <select className="field" name="mode" defaultValue="VIDEO">{MODES.map(m => <option key={m} value={m}>{t.modes[m]}</option>)}</select>
                </label>
                <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{t.book.save}</button></div>
              </form>
            </Task>
          )}
          {recordable && scheduled.length > 0 && (
            <Task title={t.cancel.title} next={false}>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/doctor/cases/${caseId}/follow-up/contacts/${String(data.get("contactId"))}/cancel`, { reason: text(data.get("reason")) }))}>
                <label className="block text-sm font-semibold">{t.cancel.contact}
                  <select className="field" name="contactId" required defaultValue="">
                    <option value="">{t.cancel.choose}</option>
                    {scheduled.map(c => <option key={c.id} value={c.id}>{`${pick(t.modes, c.mode)} · ${when(c.dueAt)}`}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold sm:col-span-2">{t.cancel.reason}<textarea className="field" name="reason" rows={2} maxLength={1000} required dir="auto"/></label>
                <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{t.cancel.save}</button></div>
              </form>
            </Task>
          )}
        </div>
      )}

      {/* RECORDING — the coordinator's check-ins */}
      {!doctor && dueCheckIns.length > 0 && (
        <div className="mt-3">
          {dueCheckIns.map(c => (
            <Task key={c.point} title={fillTemplate(t.checkIns.form, { point: pick(t.checkIns.points, c.point) })} next={next === `check:${c.point}`}>
              <CheckInForm t={t} primary={next === `check:${c.point}`} busy={busy}
                           onRecord={body => act(`/coordinator/cases/${caseId}/follow-up/check-ins/${c.point}`, body)}/>
            </Task>
          ))}
        </div>
      )}
    </section>
  );
}

function Task({ title, next, children }: { title: string; next: boolean; children: ReactNode }) {
  return <PanelTask title={title} next={next} anchor={ANCHOR}>{children}</PanelTask>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <><dt className="text-ink-500">{label}</dt><dd dir="auto" className="min-w-0 whitespace-pre-wrap break-words text-ink-800">{children}</dd></>;
}

function contactTone(status: string): StatusTone {
  return status === "DONE" ? "success" : status === "MISSED" ? "warning" : status === "SCHEDULED" ? "info" : "neutral";
}

/** One contact: how and when, its state, where it came from, and the Consultant's note (absent for the coordinator). */
function ContactRow({ t, contact: c, when }: { t: Copy; contact: FollowUpContact; when: (iso?: string | null) => string }) {
  return (
    <li className="py-2 text-[0.85rem]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-ink-900">{pick(t.modes, c.mode)} · {when(c.dueAt)}</span>
        <StatusBadge tone={contactTone(c.status)}>{pick(t.contacts.status, c.status)}</StatusBadge>
        <span className="text-[0.8125rem] text-ink-600">{pick(t.contacts.origin, c.origin)}</span>
      </p>
      {(c.recordedAt || c.reminderSentAt) && (
        <p className="mt-0.5 text-[0.8125rem] text-ink-600">
          {c.recordedAt ? fillTemplate(t.contacts.recorded, { when: when(c.recordedAt) }) : fillTemplate(t.contacts.reminded, { when: when(c.reminderSentAt) })}
        </p>
      )}
      {c.note && <p dir="auto" className="mt-0.5 whitespace-pre-wrap break-words text-[0.8125rem] text-ink-800">{c.note}</p>}
    </li>
  );
}

/** One outcome question: asked, answered (and by whom), the three scores, and a complication with its review. */
function OutcomeRow({ t, outcome: o, doctor, when }: { t: Copy; outcome: FollowUpOutcome; doctor: boolean; when: (iso?: string | null) => string }) {
  const w = t.outcomes;
  const score = (n?: number | null) => n == null ? "—" : fillTemplate(w.score, { score: String(n) });
  return (
    <li className="py-2 text-[0.85rem]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-ink-900">{pick(w.points, o.point)}</span>
        {o.complication && <StatusBadge tone={o.reviewedAt ? "neutral" : "danger"}>{w.complication}</StatusBadge>}
        <span className="text-[0.8125rem] text-ink-600">
          {o.reportedAt ? `${fillTemplate(w.answered, { when: when(o.reportedAt) })}${o.channel ? ` ${pick(w.channels, o.channel)}` : ""}`
            : `${fillTemplate(w.asked, { when: when(o.requestedAt) })} · ${o.open ? w.awaiting : w.unanswered}`}
        </span>
      </p>
      {o.reportedAt && <>
        {o.reportedRole === "PATIENT_REPRESENTATIVE" && <p className="mt-0.5 text-[0.8125rem] font-semibold text-ink-700">{w.byRepresentative}</p>}
        <dl className="mt-1 grid grid-cols-3 gap-x-4 text-[0.8125rem]">
          <Fact label={w.pain}>{score(o.pain)}</Fact>
          <Fact label={w.function}>{score(o.function)}</Fact>
          <Fact label={w.satisfaction}>{score(o.satisfaction)}</Fact>
        </dl>
        {!o.complication && <p className="mt-1 text-[0.8125rem] text-ink-600">{w.noComplication}</p>}
      </>}
      {o.complication && (
        <div className="mt-1 text-[0.8125rem]">
          {o.complicationNote ? <p dir="auto" className="whitespace-pre-wrap break-words text-ink-900">{o.complicationNote}</p>
            : !doctor && <p className="text-ink-600">{w.detailsWithConsultant}</p>}
          <p className="mt-0.5 font-semibold text-ink-700">{o.reviewedAt ? fillTemplate(w.reviewed, { when: when(o.reviewedAt) }) : w.awaitingReview}</p>
          {o.reviewNote && <dl className="mt-0.5 grid gap-x-4 sm:grid-cols-[auto_1fr]"><Detail label={w.review}>{o.reviewNote}</Detail></dl>}
        </div>
      )}
    </li>
  );
}

/** A single required note, for the complication review. */
function NoteForm({ label, hint, name, required, save, primary, busy, onSubmit }: {
  label: string; hint: string; name: string; required: boolean; save: string; primary: boolean; busy: boolean; onSubmit: (data: FormData) => Promise<boolean>;
}) {
  const id = useId();
  return (
    <form className="grid gap-3" onSubmit={submit(onSubmit)}>
      <div>
        <label htmlFor={`${id}-note`} className="block text-sm font-semibold">{label}</label>
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-500">{hint}</p>
        <textarea id={`${id}-note`} className="field" name={name} rows={3} maxLength={4000} required={required} dir="auto" aria-describedby={`${id}-hint`}/>
      </div>
      <div><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{save}</button></div>
    </form>
  );
}

/** The Consultant records a contact as held or missed, with a note either way. */
function RecordForm({ t, primary, busy, onRecord }: { t: Copy; primary: boolean; busy: boolean; onRecord: (body: { outcome: string; note: string | null }) => Promise<boolean> }) {
  const id = useId();
  return (
    <form className="grid gap-3" onSubmit={submit(data => onRecord({ outcome: String(data.get("outcome") ?? ""), note: text(data.get("note")) }))}>
      <fieldset>
        <legend className="text-sm font-semibold">{t.record.outcome}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6">
          {(["DONE", "MISSED"] as const).map(o => (
            <label key={o} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="outcome" value={o} required/>{t.record.outcomes[o]}</label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-note`} className="block text-sm font-semibold">{t.record.note}</label>
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-500">{t.record.noteHint}</p>
        <textarea id={`${id}-note`} className="field" name="note" rows={3} maxLength={4000} required dir="auto" aria-describedby={`${id}-hint`}/>
      </div>
      <div><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.record.save}</button></div>
    </form>
  );
}

/** The coordinator's check-in: reached or not, and an optional note with no clinical detail. */
function CheckInForm({ t, primary, busy, onRecord }: { t: Copy; primary: boolean; busy: boolean; onRecord: (body: { outcome: string; note: string | null }) => Promise<boolean> }) {
  const id = useId();
  return (
    <form className="grid gap-3" onSubmit={submit(data => onRecord({ outcome: String(data.get("outcome") ?? ""), note: text(data.get("note")) }))}>
      <fieldset>
        <legend className="text-sm font-semibold">{t.checkIns.outcome}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6">
          {(["REACHED", "NOT_REACHED"] as const).map(o => (
            <label key={o} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="outcome" value={o} required/>{t.checkIns.outcomes[o]}</label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-note`} className="block text-sm font-semibold">{t.checkIns.note}</label>
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-500">{t.checkIns.noteHint}</p>
        <textarea id={`${id}-note`} className="field" name="note" rows={2} maxLength={4000} dir="auto" aria-describedby={`${id}-hint`}/>
      </div>
      <div><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.checkIns.save}</button></div>
    </form>
  );
}
