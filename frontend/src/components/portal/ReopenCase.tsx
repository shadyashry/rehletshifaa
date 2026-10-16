"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Mutate } from "@/components/portal/portal-model";

export const REOPEN_REASONS = ["COMPLICATION_REPORTED", "PATIENT_REQUEST", "CLINICAL_FOLLOW_UP_NEEDED", "INCIDENT_REVIEW"] as const;
type ReopenReason = (typeof REOPEN_REASONS)[number];
type CaseIncident = { id: string; type: string; severity: string; status: string; raisedAt: string };

/**
 * P1-13 (A-06): a CLOSED case is reopened into follow-up by a Care Coordination Manager (`/coordinator/...`) or by the case's own
 * Consultant (`/doctor/...`); the backend checks who may. One quiet line on the closed case, and a dialog for the reason, an
 * optional incident (managers, who can read the case's incidents) and an optional note.
 */
export function ReopenCase({ locale, caseId, side, busy, mutate, load }: {
  locale: Locale; caseId: string; side: "coordinator" | "doctor"; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const t = useWorkCopy().safety.reopen;
  const [open, setOpen] = useState(false);
  return (
    <section id="reopen-case" className="card mt-4 flex scroll-mt-28 flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4" aria-label={t.closed}>
      <p className="text-[0.9375rem] text-ink-700">{t.closed}</p>
      <button type="button" className="btn-secondary" aria-haspopup="dialog" onClick={() => setOpen(true)}>{t.action}</button>
      {open && <ReopenDialog locale={locale} caseId={caseId} side={side} busy={busy} mutate={mutate} load={load} onClose={() => setOpen(false)}/>}
    </section>
  );
}

function ReopenDialog({ locale, caseId, side, busy, mutate, load, onClose }: {
  locale: Locale; caseId: string; side: "coordinator" | "doctor"; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>; onClose: () => void;
}) {
  const work = useWorkCopy();
  const t = work.safety.reopen, incidentCopy = work.safety.incidents;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reason, setReason] = useState<ReopenReason | "">("");
  const [incidentId, setIncidentId] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  // Only managers read a case's incidents; for anyone else (or on a failed read) the choice is simply not offered.
  const [incidents, setIncidents] = useState<CaseIncident[]>([]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (side !== "coordinator") return;
    let live = true;
    load<CaseIncident[]>(`/incidents/cases/${caseId}`).then(rows => { if (live) setIncidents(rows ?? []); }, () => undefined);
    return () => { live = false; };
  }, [load, caseId, side]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!reason) { dialog.current?.querySelector<HTMLInputElement>(`input[name="${id}-reason"]`)?.focus(); return; }
    const result = await mutate(`/${side}/cases/${caseId}/reopen`, { reason, incidentId: incidentId || null, note: note.trim() || null });
    if (result) dialog.current?.close();
  }
  const date = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" });

  return (
    <dialog ref={dialog} className="account-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={`${id}-title`} className="title">{t.title}</h2>
        <button type="button" className="icon-button" aria-label={t.cancel} onClick={() => dialog.current?.close()}><X size={20}/></button>
      </div>
      <p id={`${id}-body`} className="mt-2 text-[0.9rem] leading-6 text-ink-600">{t.body}</p>
      <form className="mt-5 space-y-5" onSubmit={event => void save(event)} noValidate>
        <fieldset aria-describedby={touched && !reason ? `${id}-reason-error` : undefined}>
          <legend className="text-[0.8rem] font-bold text-ink-800">{t.reasonLegend}</legend>
          <div className="mt-1.5">
            {REOPEN_REASONS.map(code => (
              <label key={code} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="radio" name={`${id}-reason`} value={code} checked={reason === code} onChange={() => setReason(code)} className="h-4 w-4 flex-none accent-brand-700"/>
                <span className="text-[0.9375rem] text-ink-800">{t.reasons[code]}</span>
              </label>
            ))}
          </div>
          {touched && !reason && <p id={`${id}-reason-error`} className="error-text mt-1">{t.chooseReason}</p>}
        </fieldset>
        {incidents.length > 0 && (
          <div>
            <label htmlFor={`${id}-incident`} className="block text-[0.8rem] font-bold text-ink-800">{t.incidentLabel}</label>
            <select id={`${id}-incident`} className="field mt-1.5" value={incidentId} onChange={event => setIncidentId(event.target.value)}>
              <option value="">{t.noIncident}</option>
              {incidents.map(incident => <option key={incident.id} value={incident.id}>
                {(incidentCopy.types as Record<string, string>)[incident.type] ?? incident.type} · {(incidentCopy.severity as Record<string, string>)[incident.severity] ?? incident.severity} · {date.format(new Date(incident.raisedAt))}
              </option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`${id}-note`} className="block text-[0.8rem] font-bold text-ink-800">{t.noteLabel}</label>
          <textarea id={`${id}-note`} className="field mt-1.5 min-h-24 resize-y" dir="auto" maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>{t.cancel}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{t.confirm}</button>
        </div>
      </form>
    </dialog>
  );
}
