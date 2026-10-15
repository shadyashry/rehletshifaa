"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { StatementSheet } from "@/components/portal/GoingHomeStory";
import { FollowUpStory, OutcomeQuestions } from "@/components/portal/FollowUpStory";
import type { Mutate, OutcomeAnswer, PatientFollowUpView, PatientStatement } from "@/components/portal/portal-model";

/**
 * P1-18, inside My Care's current step after discharge: on REPORT_OUTCOME the outcome questions (the step's one action), in
 * follow-up the next contact, the free follow-up's end and who to turn to, and on a completed case the closing statement and the
 * review the team asked for. Read from `GET /patient/cases/{id}/follow-up` (and `/statements` once the case is closed); the
 * answers go to `POST …/follow-up/outcomes/{point}`. Nothing is recomputed here.
 */
export function PatientFollowUp({ locale, caseId, code, busy, mutate, load }: {
  locale: Locale; caseId: string;
  /** The patient's current action: REPORT_OUTCOME, FOLLOW_UP, or NONE on a completed case. */
  code: string;
  busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const work = useWorkCopy();
  const t = work.myCare.followUp;
  const id = useId();
  const [view, setView] = useState<PatientFollowUpView | null>(null);
  const [statements, setStatements] = useState<PatientStatement[] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }), [locale]);

  useEffect(() => {
    let live = true;
    load<PatientFollowUpView>(`/patient/cases/${caseId}/follow-up`).then(async value => {
      // The closing statement is read only once the case is closed (it is issued at closure).
      const issued = value.closed ? await load<PatientStatement[]>(`/patient/cases/${caseId}/statements`).catch(() => []) : null;
      if (live) { setView(value); setStatements(issued); }
    }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, caseId, code]);

  if (!view?.active) return null;
  const point = code === "REPORT_OUTCOME" ? view.openOutcome ?? null : null;
  // The last answers the team received: the thanks outlasts the step changing once they are sent.
  const lastAnswered = view.outcomes.filter(o => o.reportedAt).map(o => o.reportedAt!).toSorted().at(-1) ?? null;
  const closing = statements?.filter(s => s.kind === "CLOSURE") ?? [];

  async function send(answer: OutcomeAnswer) {
    if (!point) return;
    const result: unknown = await mutate(`/patient/cases/${caseId}/follow-up/outcomes/${point}`, answer);
    if (result && typeof result === "object" && "outcomes" in result) {
      setView(result as PatientFollowUpView);
      setSent(answer.complication ? t.outcome.sentComplication : t.outcome.sent);
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      {point && <OutcomeQuestions copy={t.outcome} point={point} busy={busy} onSend={send}/>}
      {sent ? <p role="status" className="mb-4 max-w-[65ch] text-[0.9375rem] font-semibold text-brand-800">{sent}</p>
        : !point && lastAnswered && <p className="mb-4 max-w-[65ch] text-[0.9375rem] text-ink-700">{fillTemplate(t.outcome.received, { date: day.format(new Date(lastAnswered)) })}</p>}

      {!view.closed && <div className={point ? "mt-6 border-t border-line pt-4" : undefined}><FollowUpStory locale={locale} copy={t} view={view}/></div>}

      {view.closed && (
        <>
          <section aria-labelledby={`${id}-statement`} className={point ? "mt-6 border-t border-line pt-4" : undefined}>
            <h3 id={`${id}-statement`} className="text-[0.9375rem] font-bold text-ink-800">{t.closed.statement}</h3>
            {closing.length === 0 ? <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-ink-600">{t.closed.statementPending}</p>
              : <div className="mt-2 space-y-5">{closing.map(s => <StatementSheet key={s.id} locale={locale} copy={work.statement} statement={s} headingLevel={4}/>)}</div>}
          </section>
          <section aria-labelledby={`${id}-review`} className="mt-5 border-t border-line pt-4">
            <h3 id={`${id}-review`} className="text-[0.9375rem] font-bold text-ink-800">{t.closed.reviewTitle}</h3>
            <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-ink-700">{t.closed.reviewBody}</p>
          </section>
        </>
      )}
    </div>
  );
}
