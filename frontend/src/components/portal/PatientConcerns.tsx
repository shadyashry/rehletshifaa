"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import type { Mutate } from "@/components/portal/portal-model";

const CONCERN_TYPES = ["COMPLAINT", "ADVERSE_EVENT"] as const;
type ConcernType = (typeof CONCERN_TYPES)[number];
/** What the patient sees of a concern: that it was received and where it stands — never the owner or the notes. */
export type Concern = { id: string; type: string; status: string; raisedAt: string; resolvedAt?: string | null };
const MAX_SUMMARY = 2000;

/**
 * P1-13 (A-06): "Raise a concern" on My Care — one quiet line, never a second call to action beside the step's own. It opens
 * a short form in place (a complaint, or a health problem after treatment) that goes to a Care Coordination Manager, and the
 * patient's own concerns are listed with their status. The emergency notice stays on the page above.
 */
export function PatientConcerns({ locale, caseId, busy, mutate, load }: {
  locale: Locale; caseId: string; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const t = useWorkCopy().safety.concerns;
  const id = useId();
  const [concerns, setConcerns] = useState<Concern[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ConcernType | "">("");
  const [summary, setSummary] = useState("");
  const [touched, setTouched] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);

  const refresh = useCallback(() => load<Concern[]>(`/patient/cases/${caseId}/concerns`)
    .then(rows => { setConcerns(rows ?? []); setFailed(false); }, () => setFailed(true)), [load, caseId]);
  useEffect(() => {
    let live = true;
    load<Concern[]>(`/patient/cases/${caseId}/concerns`).then(rows => { if (live) setConcerns(rows ?? []); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [load, caseId]);

  const missingType = !type;
  const missingSummary = !summary.trim();

  function close() {
    setOpen(false); setType(""); setSummary(""); setTouched(false);
    requestAnimationFrame(() => opener.current?.focus());
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (missingType || missingSummary) {
      (missingType ? document.querySelector<HTMLElement>(`input[name="${id}-type"]`) : document.getElementById(`${id}-summary`))?.focus();
      return;
    }
    const result = await mutate(`/patient/cases/${caseId}/concerns`, { type, summary: summary.trim() });
    if (!result) return;
    close();
    await refresh();
  }

  return (
    <div className="space-y-4">
      {concerns && concerns.length > 0 && (
        <section aria-labelledby={`${id}-list`} className="card p-5 sm:p-6">
          <h2 id={`${id}-list`} className="text-[1.0625rem] font-bold text-brand-900">{t.listTitle}</h2>
          <ul className="mt-3 divide-y divide-line">
            {concerns.map(concern => (
              <li key={concern.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink-800">{(t.typeShort as Record<string, string>)[concern.type] ?? concern.type}</span>
                  <span className="block text-[0.875rem] text-ink-500">
                    {fillTemplate(t.raisedOn, { date: dateFormat.format(new Date(concern.raisedAt)) })}
                    {concern.resolvedAt && <> · {fillTemplate(t.resolvedOn, { date: dateFormat.format(new Date(concern.resolvedAt)) })}</>}
                  </span>
                </span>
                <StatusBadge tone={concernTone(concern.status)}>{(t.status as Record<string, string>)[concern.status] ?? concern.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
      {failed && <p className="text-[0.875rem] text-ink-500">{t.loadFailed}</p>}

      {!open ? (
        <p className="text-[0.875rem] leading-6 text-ink-500">
          {t.lead}{" "}
          <button ref={opener} type="button" aria-expanded={false} aria-controls={`${id}-form`}
                  className="inline-flex min-h-11 items-center font-semibold text-ink-700 underline decoration-ink-350 underline-offset-4 hover:text-brand-800"
                  onClick={() => setOpen(true)}>{t.action}</button>
        </p>
      ) : (
        <section id={`${id}-form`} aria-labelledby={`${id}-title`} className="card p-5 sm:p-6">
          <h2 id={`${id}-title`} className="text-[1.0625rem] font-bold text-brand-900">{t.title}</h2>
          <p className="mt-1.5 max-w-[65ch] text-[0.9375rem] leading-6 text-ink-600">{t.intro}</p>
          <form className="mt-5 space-y-5" onSubmit={event => void send(event)} noValidate>
            <fieldset aria-describedby={touched && missingType ? `${id}-type-error` : undefined}>
              <legend className="text-[0.9375rem] font-semibold text-ink-800">{t.typeLegend}</legend>
              <div className="mt-1.5">
                {CONCERN_TYPES.map(code => (
                  <label key={code} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input type="radio" name={`${id}-type`} value={code} checked={type === code} onChange={() => setType(code)} className="h-4 w-4 flex-none accent-brand-700"/>
                    <span className="text-[0.9375rem] text-ink-800">{t.types[code]}</span>
                  </label>
                ))}
              </div>
              {touched && missingType && <p id={`${id}-type-error`} className="error-text mt-1">{t.chooseType}</p>}
            </fieldset>
            <div>
              <label htmlFor={`${id}-summary`} className="block text-[0.9375rem] font-semibold text-ink-800">{t.summaryLabel}</label>
              <textarea id={`${id}-summary`} className={`field mt-2 min-h-32 resize-y ${touched && missingSummary ? "field-error" : ""}`} dir="auto"
                        maxLength={MAX_SUMMARY} value={summary} onChange={event => setSummary(event.target.value)}
                        aria-invalid={touched && missingSummary ? true : undefined}
                        aria-describedby={`${id}-summary-help${touched && missingSummary ? ` ${id}-summary-error` : ""}`}/>
              <p id={`${id}-summary-help`} className="mt-1.5 text-[0.8125rem] leading-5 text-ink-500">{t.summaryHelp}</p>
              {touched && missingSummary && <p id={`${id}-summary-error`} className="error-text mt-1">{t.describe}</p>}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={close}>{t.cancel}</button>
              <button type="submit" className="btn-primary" disabled={busy}>{t.send}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function concernTone(status: string): StatusTone {
  return status === "RESOLVED" ? "success" : status === "UNDER_REVIEW" ? "info" : "neutral";
}
