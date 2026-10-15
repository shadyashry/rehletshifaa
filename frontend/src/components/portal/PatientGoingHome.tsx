"use client";

import { useEffect, useId, useMemo, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { GoingHomeStory, StatementSheet } from "@/components/portal/GoingHomeStory";
import type { PatientDischargeView, PatientStatement } from "@/components/portal/portal-model";

/**
 * P1-17, inside My Care's current step once the patient is discharged (GOING_HOME) and in follow-up: the warning signs, the
 * medicines, the follow-up date, the journey home, the pack documents and the letter for the home doctor, then the statement
 * once the hospital's invoice is reconciled. Read from `GET /patient/cases/{id}/discharge` and `/statements` in parallel;
 * nothing is recomputed here. There is nothing to do on this step, so it carries no primary action.
 */
export function PatientGoingHome({ locale, caseId, code, documents, onOpenDocuments, load }: {
  locale: Locale; caseId: string; code: string;
  /** The patient's documents, to name the pack's files. */
  documents: { documentId: string; fileName: string }[];
  /** Opens My Care's Documents view, where the pack documents are downloaded. */
  onOpenDocuments?: () => void;
  load: <T>(path: string) => Promise<T>;
}) {
  const work = useWorkCopy();
  const t = work.myCare.goingHome;
  const id = useId();
  // undefined while loading; null when the read failed (the step's own words still stand).
  const [view, setView] = useState<PatientDischargeView | null | undefined>(undefined);
  const [statements, setStatements] = useState<PatientStatement[]>([]);

  useEffect(() => {
    let live = true;
    void Promise.all([
      load<PatientDischargeView>(`/patient/cases/${caseId}/discharge`).catch(() => null),
      load<PatientStatement[]>(`/patient/cases/${caseId}/statements`).catch(() => []),
    ]).then(([discharge, issued]) => { if (live) { setView(discharge ?? null); setStatements(issued ?? []); } });
    return () => { live = false; };
  }, [load, caseId, code]);

  const names = useMemo(() => Object.fromEntries(documents.map(d => [d.documentId, d.fileName])), [documents]);
  if (!view?.discharged) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      {/* P1-18: in follow-up the follow-up block above names the next contact, so the plan's first date is not repeated here. */}
      <GoingHomeStory locale={locale} copy={t} view={code === "FOLLOW_UP" ? { ...view, followUpDueAt: null } : view} documentNames={names}
        documentsAction={onOpenDocuments && <button type="button" className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-brand-700 underline underline-offset-4"
                                                     onClick={onOpenDocuments}>{t.openDocuments}</button>}/>
      <section aria-labelledby={`${id}-statement`} className="mt-5 border-t border-line pt-4">
        <h3 id={`${id}-statement`} className="text-[0.9375rem] font-bold text-ink-800">{t.statement}</h3>
        {statements.length === 0 ? <p className="mt-1 max-w-[65ch] text-[0.9375rem] text-ink-600">{t.statementPending}</p>
          : <div className="mt-2 space-y-5">{statements.map(s => <StatementSheet key={s.id} locale={locale} copy={work.statement} statement={s} headingLevel={4}/>)}</div>}
      </section>
    </div>
  );
}
