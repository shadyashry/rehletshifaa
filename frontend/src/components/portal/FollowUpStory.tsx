"use client";

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { OUTCOME_NOTICE_VERSION } from "@/components/portal/admission-steps";
import type { OutcomeAnswer, PatientFollowUpView } from "@/components/portal/portal-model";

export type FollowUpCopy = Dictionary["portalWork"]["myCare"]["followUp"];
type OutcomeCopy = FollowUpCopy["outcome"];

const words = (table: Record<string, string>, key?: string | null) => key && Object.hasOwn(table, key) ? table[key] : key ?? "";

/**
 * P1-18, the patient's follow-up (My Care and the verified status link): the next contact and the reminder, how long the free
 * follow-up lasts, the contacts already held or missed, and — while the case is open — who to turn to if something goes wrong,
 * in order. Everything is the backend's record; nothing is inferred here.
 */
export function FollowUpStory({ locale, copy: t, view }: { locale: Locale; copy: FollowUpCopy; view: PatientFollowUpView }) {
  const id = useId();
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }), [locale]);
  const when = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeStyle: "short" }), [locale]);
  if (!view.active) return null;
  const booked = view.contacts.filter(c => c.status === "SCHEDULED").toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  const earlier = view.contacts.filter(c => c.status === "DONE" || c.status === "MISSED");
  const next = booked[0];
  return (
    <section aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-[0.9375rem] font-bold text-ink-800">{t.title}</h3>
      {!view.windowClosed && !view.closed && (
        <dl className="mt-2 text-[0.9375rem]">
          <dt className="font-semibold text-ink-700">{t.next}</dt>
          <dd className="mt-0.5 text-ink-900">
            {next ? <><span className="font-bold">{fillTemplate(t.nextLine, { mode: words(t.modes, next.mode), date: when.format(new Date(next.dueAt)) })}</span>
              <span className="block text-[0.875rem] text-ink-600">{t.reminder}</span></> : <span className="text-ink-700">{t.noneBooked}</span>}
          </dd>
        </dl>
      )}
      {view.windowEndsAt && (
        <p className="mt-3 max-w-[65ch] text-[0.9375rem] text-ink-700">
          {fillTemplate(view.windowClosed ? t.windowEnded : t.window, { date: day.format(new Date(view.windowEndsAt)) })}
        </p>
      )}
      {earlier.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.875rem] font-semibold text-ink-700">{t.earlier}</p>
          <ul className="mt-1 space-y-0.5 text-[0.875rem] text-ink-700">
            {earlier.map(c => <li key={`${c.dueAt}-${c.mode}`}>{fillTemplate(t.nextLine, { mode: words(t.modes, c.mode), date: day.format(new Date(c.dueAt)) })} · {words(t.status, c.status)}</li>)}
          </ul>
        </div>
      )}
      {!view.closed && (
        <section aria-labelledby={`${id}-route`} className="mt-5 border-t border-line pt-4">
          <h3 id={`${id}-route`} className="text-[0.9375rem] font-bold text-ink-800">{t.route.title}</h3>
          <ol className="mt-2 space-y-2 text-[0.9375rem]">
            {[t.route.coordinator, t.route.consultant, t.route.emergency].map((line, index) => (
              <li key={index} className="flex items-start gap-3">
                <span aria-hidden className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[0.8125rem] font-bold tabular-nums ${index === 2 ? "border border-alert-700 text-alert-800" : "border border-brand-600 text-brand-700"}`}>{index + 1}</span>
                <span className={`max-w-[60ch] ${index === 2 ? "font-semibold text-alert-800" : "text-ink-800"}`}>{line}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}

type Scale = "pain" | "function" | "satisfaction";
const SCALES: readonly Scale[] = ["pain", "function", "satisfaction"];
const POINTS = Array.from({ length: 11 }, (_, n) => n);
/** The errors with one question's answered. */
const without = (key: string) => (errors: Record<string, string>) => { const next = { ...errors }; delete next[key]; return next; };
/** A choice card (DESIGN.md "Choice cards"): Petrol edge, petrol-50 fill and a 3px halo once checked. */
const CHOICE = "flex min-h-11 cursor-pointer items-center rounded-lg border border-ink-350 bg-white text-ink-900 transition-[border-color,box-shadow,background-color] hover:border-brand-300 has-[:checked]:border-[var(--choice-checked-border)] has-[:checked]:bg-[var(--choice-checked-bg)] has-[:checked]:shadow-[0_0_0_3px_var(--color-brand-100)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600";

/**
 * P1-18, the outcome questions (My Care and the OUTCOME secure link): the purpose notice first (who reads the answers, the
 * quality use without the patient's name, how long they are kept, how to withdraw), then pain, daily activities and satisfaction
 * from 0 to 10 and whether anything went wrong — a yes asks what happened, and says not to wait in an emergency. `children` sits
 * at the top of the questions (the link's "who is answering"); `onSend` gets the answers with the notice version shown here and
 * the form's data; `checkChildren` checks what `children` asked (an error in the patient's words, or null). Sends once every
 * question has an answer; the backend checks again.
 */
export function OutcomeQuestions({ copy: t, point, busy, error, onSend, checkChildren, children }: {
  copy: OutcomeCopy;
  /** D30 or D90: which question this is, named above the form. */
  point: string;
  busy: boolean;
  /** A failure from the last send, in the patient's words. */
  error?: string | null;
  onSend: (answer: OutcomeAnswer, data: FormData) => Promise<unknown>;
  checkChildren?: (data: FormData) => string | null;
  children?: ReactNode;
}) {
  const id = useId();
  const [scores, setScores] = useState<Record<Scale, number | null>>({ pain: null, function: null, satisfaction: null });
  const [complication, setComplication] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = String(data.get("complicationNote") ?? "").trim();
    const found: Record<string, string> = {};
    const childError = checkChildren?.(data);
    if (childError) found.answeredBy = childError;
    for (const scale of SCALES) if (scores[scale] == null) found[scale] = t.errors.missing;
    if (complication == null) found.complication = t.errors.missing;
    if (complication && !note) found.complicationNote = t.errors.details;
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      // The first unanswered question takes focus, so it is read out with its error.
      requestAnimationFrame(() => (formRef.current?.querySelector<HTMLElement>(`[data-question="${first}"] input, [data-question="${first}"] textarea`))?.focus());
      return;
    }
    void onSend({ pain: scores.pain!, function: scores.function!, satisfaction: scores.satisfaction!, complication: complication!,
      complicationNote: complication ? note : null, noticeVersion: OUTCOME_NOTICE_VERSION }, data);
  }

  const errorId = (key: string) => `${id}-${key}-error`;

  return (
    <div>
      <p className="text-[0.875rem] font-semibold text-ink-600">{words(t.points, point)}</p>
      {/* The purpose notice (PDPL): above the questions, read before answering; its version is sent with the answers. */}
      <section aria-labelledby={`${id}-notice`} className="mt-2 rounded-lg border border-line bg-mist p-4">
        <h3 id={`${id}-notice`} className="text-[0.9375rem] font-bold text-ink-800">{t.notice.title}</h3>
        <ul className="mt-1.5 max-w-[65ch] space-y-1 text-[0.875rem] leading-6 text-ink-700">
          {[t.notice.who, t.notice.use, t.notice.keep, t.notice.withdraw].map(line => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <form ref={formRef} noValidate className="mt-5 space-y-6" onSubmit={send} aria-describedby={`${id}-notice`}>
        {children && <div data-question="answeredBy" aria-describedby={errors.answeredBy ? errorId("answeredBy") : undefined}>{children}<FieldError id={errorId("answeredBy")} message={errors.answeredBy}/></div>}

        {SCALES.map(scale => (
          <fieldset key={scale} data-question={scale} aria-describedby={`${id}-${scale}-ends${errors[scale] ? ` ${errorId(scale)}` : ""}`}>
            <legend className="text-[0.9375rem] font-bold text-ink-900">{t[scale].label}</legend>
            <p id={`${id}-${scale}-ends`} className="mt-0.5 flex flex-wrap justify-between gap-x-4 text-[0.8125rem] text-ink-600">
              <span>{t[scale].low}</span><span>{t[scale].high}</span>
            </p>
            <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-11">
              {POINTS.map(n => (
                <label key={n} className={`${CHOICE} justify-center font-bold tabular-nums`}>
                  <input type="radio" className="sr-only" name={scale} value={n} checked={scores[scale] === n}
                         onChange={() => { setScores(s => ({ ...s, [scale]: n })); setErrors(without(scale)); }}/>
                  <bdi dir="ltr">{n}</bdi>
                </label>
              ))}
            </div>
            <FieldError id={errorId(scale)} message={errors[scale]}/>
          </fieldset>
        ))}

        <fieldset data-question="complication" aria-describedby={errors.complication ? errorId("complication") : undefined}>
          <legend className="text-[0.9375rem] font-bold text-ink-900">{t.complication.legend}</legend>
          <div className="mt-2 grid max-w-sm grid-cols-2 gap-2">
            {([[true, t.complication.yes], [false, t.complication.no]] as const).map(([value, label]) => (
              <label key={String(value)} className={`${CHOICE} justify-center px-3`}>
                <input type="radio" className="sr-only" name="complication" value={String(value)} checked={complication === value}
                       onChange={() => { setComplication(value); setErrors(without("complication")); }}/>
                {label}
              </label>
            ))}
          </div>
          <FieldError id={errorId("complication")} message={errors.complication}/>
        </fieldset>

        {complication && (
          <div data-question="complicationNote">
            <label htmlFor={`${id}-note`} className="block text-[0.9375rem] font-bold text-ink-900">{t.complication.what}</label>
            <p id={`${id}-note-hint`} className="mt-0.5 max-w-[65ch] text-[0.875rem] text-ink-600">{t.complication.whatHint}</p>
            <textarea id={`${id}-note`} name="complicationNote" className="field mt-1" rows={4} maxLength={4000} dir="auto"
                      aria-invalid={errors.complicationNote ? true : undefined}
                      aria-describedby={`${id}-note-hint ${id}-emergency${errors.complicationNote ? ` ${errorId("complicationNote")}` : ""}`}
                      onChange={() => errors.complicationNote && setErrors(without("complicationNote"))}/>
            <FieldError id={errorId("complicationNote")} message={errors.complicationNote}/>
            <p id={`${id}-emergency`} className="mt-2 max-w-[65ch] text-[0.875rem] font-semibold text-alert-800">{t.complication.emergency}</p>
          </div>
        )}

        {error && <p role="alert" className="text-[0.9375rem] font-semibold text-alert-800">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? t.sending : t.send}</button>
      </form>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1 text-[0.875rem] font-semibold text-alert-800">{message}</p> : null;
}

/**
 * P1-18, the OUTCOME link only: its code may have reached the person who sent the case for the patient, so they say who is
 * answering (sent as `answeredBy`, PATIENT or REPRESENTATIVE). Goes inside `OutcomeQuestions` as its children.
 */
export function AnsweredBy({ copy: t }: { copy: OutcomeCopy["answeredBy"] }) {
  return (
    <fieldset>
      <legend className="text-[0.9375rem] font-bold text-ink-900">{t.legend}</legend>
      <div className="mt-2 grid gap-2 sm:max-w-xl sm:grid-cols-2">
        {(["PATIENT", "REPRESENTATIVE"] as const).map(who => (
          <label key={who} className={`${CHOICE} gap-3 px-4 py-2`}>
            <input type="radio" name="answeredBy" value={who} className="h-4 w-4 accent-brand-600"/>{t[who]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
