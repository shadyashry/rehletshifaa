"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";

import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import type { AdminApi } from "./admin-api";
import { ErrorNotice, Field } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { useRead } from "./workforce-ui";

export type SuspensionCopy = Dictionary["portalWork"]["compliance"]["suspension"];
export type Suspension = {
  id: string; reason: string; quarter: string; occurrences: number; triggerCaseId?: string | null; suspendedAt: string;
  liftedBy?: string | null; liftedAt?: string | null; liftNote?: string | null;
};

/**
 * Facilities › a facility's package suspension (P1-19, design §7.5): the banner while it holds (reason, quarter, count, what it
 * means), a Finance Manager's "Lift suspension" with the required note, and the history. The facility's own record (with every
 * suspension) is read here; the list carries only the open one.
 */
export function FacilitySuspension({ locale, copy, api, facilityId, canLift, onLifted }: {
  locale: Locale; copy: SuspensionCopy; api: AdminApi; facilityId: string; canLift: boolean; onLifted: () => void;
}) {
  const { data, error, reload } = useRead<{ packageSuspension?: Suspension | null; suspensions?: Suspension[] }>(api, `/admin/facilities/${facilityId}`);
  const [lifting, setLifting] = useState(false);
  const [notice, setNotice] = useState("");
  const date = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const day = (iso?: string | null) => (iso ? date.format(new Date(iso)) : "—");
  const n = new Intl.NumberFormat(intlLocale(locale));
  if (error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />;
  if (!data) return null;
  const open = data.packageSuspension ?? null;
  const history = data.suspensions ?? [];

  return <>
    {notice && <p role="status" className="cc-notice cc-notice-success">{notice}</p>}
    {open && <div role="status" className="cc-notice cc-notice-warning">
      <AlertTriangle size={18} aria-hidden />
      <div>
        <p><strong>{copy.title}</strong> · {(copy.reasons as Record<string, string>)[open.reason] ?? open.reason}</p>
        <p>{fillTemplate(copy.body, { date: day(open.suspendedAt), count: n.format(open.occurrences), quarter: `⁦${open.quarter}⁩` })}</p>
        <p>{copy.consequence}</p>
        {!canLift && <p className="cc-meta">{copy.financeOnly}</p>}
      </div>
      {canLift && <button type="button" onClick={() => setLifting(true)}>{copy.lift}</button>}
    </div>}
    {history.length > 0 && <details className="cc-technical" style={{ marginBottom: 16 }}>
      <summary>{copy.history}</summary>
      <ul style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
        {history.map((s) => <li key={s.id} style={{ marginBottom: 6 }}>
          {fillTemplate(copy.historyLine, { quarter: `⁦${s.quarter}⁩`, date: day(s.suspendedAt), count: n.format(s.occurrences) })}
          <span className="cc-row-sub" dir="auto">{s.liftedAt ? fillTemplate(copy.liftedLine, { date: day(s.liftedAt), note: s.liftNote ?? "" }) : copy.stillOpen}</span>
        </li>)}
      </ul>
    </details>}
    {lifting && open && <LiftDialog locale={locale} copy={copy} api={api} facilityId={facilityId} onClose={() => setLifting(false)}
      onLifted={() => { setLifting(false); setNotice(copy.lifted); reload(); onLifted(); }} />}
  </>;
}

function LiftDialog({ locale, copy, api, facilityId, onClose, onLifted }: { locale: Locale; copy: SuspensionCopy; api: AdminApi; facilityId: string; onClose: () => void; onLifted: () => void }) {
  const id = useId();
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!note.trim()) { document.getElementById(`${id}-note`)?.focus(); return; }
    setBusy(true); setError(null);
    try { await api(`/admin/facilities/${facilityId}/package-suspension/lift`, { method: "POST", body: { note: note.trim() } }); onLifted(); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  }
  return <FocusTrapDialog label={copy.liftTitle} onClose={busy ? () => undefined : onClose}>
    <form onSubmit={(e) => void submit(e)} noValidate>
      <h2>{copy.liftTitle}</h2>
      <ul className="cc-consequences"><li>{copy.liftConsequence}</li><li>{copy.freshSignIn}</li></ul>
      <Field label={copy.noteLabel} hint={copy.noteHint} required error={touched && !note.trim() ? copy.noteRequired : undefined}>
        <textarea id={`${id}-note`} rows={3} maxLength={2000} dir="auto" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={touched && !note.trim() ? true : undefined} />
      </Field>
      <ErrorNotice error={error} locale={locale} />
      <div className="cc-form-actions"><button type="submit" disabled={busy}>{copy.lift}</button><button type="button" className="cc-secondary" disabled={busy} onClick={onClose}>{copy.cancel}</button></div>
    </form>
  </FocusTrapDialog>;
}
