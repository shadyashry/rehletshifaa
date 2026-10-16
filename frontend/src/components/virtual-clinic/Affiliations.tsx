"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import type { DirectoryFacility } from "@/components/portal/portal-model";
import { AFFILIATION_KINDS, type AffiliationKind, type AffiliationsView, type Declaration } from "./virtual-clinic-model";

export type AffiliationCopy = Dictionary["portalWork"]["affiliations"];
/** A clinic call; a failure carries the backend's stable `code` when it sent one. */
export type AffiliationCall = <T = unknown>(path: string, method?: string, body?: unknown) => Promise<T>;
type Draft = { facilityId: string; kinds: AffiliationKind[]; note: string };

/** The current declaration as the form's starting point: one row per facility, its relationships and the interest note. */
function draftFrom(current?: Declaration | null): Draft[] {
  const rows = new Map<string, Draft>();
  for (const line of current?.lines ?? []) {
    const row = rows.get(line.facilityId) ?? { facilityId: line.facilityId, kinds: [], note: "" };
    if ((AFFILIATION_KINDS as readonly string[]).includes(line.kind)) row.kinds.push(line.kind as AffiliationKind);
    if (line.kind === "FINANCIAL_INTEREST" && line.note) row.note = line.note;
    rows.set(line.facilityId, row);
  }
  return [...rows.values()];
}

/** "No relationship" stands alone: choosing it clears the others, and choosing another clears it. */
function toggleKind(kinds: AffiliationKind[], kind: AffiliationKind): AffiliationKind[] {
  if (kinds.includes(kind)) return kinds.filter((k) => k !== kind);
  return kind === "NONE_DECLARED" ? ["NONE_DECLARED"] : [...kinds.filter((k) => k !== "NONE_DECLARED"), kind];
}

/**
 * Virtual Clinic › Affiliations (P1-19, D-H), the Consultant's own: the current declaration or the plain consequence of having none,
 * the yearly form with its attestation, the facilities used before they were declared, and the earlier declarations. Filing is the
 * one primary action. The backend decides every rule (eligibility, duplicates, the note, the attestation version).
 */
export function Affiliations({ locale, copy, practitionerId, call, onFiled }: {
  locale: Locale; copy: AffiliationCopy; practitionerId: string; call: AffiliationCall; onFiled?: () => void;
}) {
  const [view, setView] = useState<AffiliationsView | null>(null);
  const [directory, setDirectory] = useState<DirectoryFacility[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filed, setFiled] = useState(false);
  const base = `/clinics/${practitionerId}/affiliations`;

  useEffect(() => {
    let live = true;
    Promise.all([call<AffiliationsView>(base), call<DirectoryFacility[]>("/facilities/directory").catch(() => [] as DirectoryFacility[])])
      .then(([affiliations, facilities]) => { if (live) { setView(affiliations); setDirectory(Array.isArray(facilities) ? facilities : []); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [call, base, attempt]);

  if (failed && !view) return <p role="alert" className="rounded-xl bg-alert-50 p-4 text-sm text-alert-800">{copy.loadFailed} <button type="button" className="link-cta" onClick={() => setAttempt((n) => n + 1)}>{copy.retry}</button></p>;
  if (!view) return <p role="status" className="text-sm text-ink-500">{copy.loading}</p>;
  return <>
    {filed && <p role="status" className="rounded-lg bg-brand-50 p-3 text-sm font-semibold text-brand-800">{copy.saved}</p>}
    <AffiliationsBody key={view.current?.id ?? "none"} locale={locale} copy={copy} view={view} directory={directory} base={base} call={call}
      onEdit={() => setFiled(false)} onFiled={(next) => { setView(next); setFiled(true); onFiled?.(); }} />
  </>;
}

function AffiliationsBody({ locale, copy, view, directory, base, call, onEdit, onFiled }: {
  locale: Locale; copy: AffiliationCopy; view: AffiliationsView; directory: DirectoryFacility[]; base: string; call: AffiliationCall;
  onEdit: () => void; onFiled: (next: AffiliationsView) => void;
}) {
  const id = useId();
  const date = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }), [locale]);
  const day = (iso?: string | null) => (iso ? date.format(new Date(iso)) : "");
  // Facility names: the directory first, then the names a declaration already carries (a facility may have left the directory).
  const names = new Map<string, string>(directory.map((f) => [f.id, f.name]));
  for (const d of [view.current, ...view.history]) for (const line of d?.lines ?? []) if (line.facilityName && !names.has(line.facilityId)) names.set(line.facilityId, line.facilityName);
  const nameOf = (facilityId: string, fallback?: string | null) => names.get(facilityId) ?? fallback ?? facilityId;

  const [rows, setRows] = useState<Draft[]>(() => draftFrom(view.current));
  const [pick, setPick] = useState("");
  const [attested, setAttested] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const available = directory.filter((f) => !rows.some((r) => r.facilityId === f.id));

  const rowMissingKind = (row: Draft) => row.kinds.length === 0;
  const rowMissingNote = (row: Draft) => row.kinds.includes("FINANCIAL_INTEREST") && !row.note.trim();
  const invalid = rows.some((r) => rowMissingKind(r) || rowMissingNote(r)) || !attested;

  const update = (facilityId: string, change: (row: Draft) => Draft) => setRows((all) => all.map((r) => (r.facilityId === facilityId ? change(r) : r)));
  const add = () => { if (!pick) return; setRows((all) => [...all, { facilityId: pick, kinds: [], note: "" }]); setPick(""); onEdit(); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true); onEdit();
    if (invalid) {
      // Focus the first thing to fix, in reading order.
      const first = rows.find((r) => rowMissingKind(r) || rowMissingNote(r));
      const target = first ? document.getElementById(`${id}-${first.facilityId}-${rowMissingKind(first) ? "kinds" : "note"}`) : document.getElementById(`${id}-attest`);
      (target?.querySelector<HTMLElement>("input,textarea") ?? target)?.focus();
      return;
    }
    const lines = rows.flatMap((r) => r.kinds.map((kind) => ({ facilityId: r.facilityId, kind, ...(kind === "FINANCIAL_INTEREST" ? { note: r.note.trim() } : {}) })));
    setBusy(true); setError(null);
    try {
      const next = await call<AffiliationsView>(base, "POST", { lines, attested, attestationVersion: view.attestationVersion });
      onFiled(next);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code && Object.hasOwn(copy.errors, code) ? copy.errors[code as keyof typeof copy.errors] : e instanceof Error ? e.message : copy.loadFailed);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setBusy(false); }
  }

  const current = view.current;
  return <>
    <section className="card p-4 sm:p-5" aria-labelledby={`${id}-status`}>
      <h2 id={`${id}-status`} className="font-bold text-brand-900">{copy.title}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-600">{copy.lead}</p>
      {view.declarationCurrent && current ? <div className="mt-4">
        <p className="text-sm font-bold text-ink-800">{copy.current}</p>
        <p className="mt-0.5 text-sm text-ink-600">{fillTemplate(copy.filed, { date: day(current.declaredAt) })} · {fillTemplate(copy.renewBy, { date: day(view.renewBy ?? current.validUntil) })}</p>
        <DeclaredLines copy={copy} declaration={current} nameOf={nameOf} />
      </div> : <div role="status" className="mt-4 flex items-start gap-2.5 rounded-lg bg-alert-50 p-3 text-alert-800">
        <AlertTriangle size={18} aria-hidden className="mt-0.5 flex-none" />
        <div><p className="font-bold">{copy.none}</p><p className="mt-0.5 text-sm">{copy.noneBody}</p></div>
      </div>}
    </section>

    {view.flags.length > 0 && <section className="card p-4 sm:p-5" aria-labelledby={`${id}-flags`}>
      <h2 id={`${id}-flags`} className="font-bold text-brand-900">{copy.flagsTitle}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-600">{copy.flagsIntro}</p>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {view.flags.map((flag) => <li key={flag.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
          <span><bdi dir="ltr" className="font-semibold text-ink-900">{flag.caseNumber}</bdi> · <bdi>{nameOf(flag.facilityId, flag.facilityName)}</bdi></span>
          <span className="text-ink-600">{fillTemplate(copy.flagRaised, { date: day(flag.raisedAt) })} · {flag.clearedAt ? fillTemplate(copy.flagCleared, { date: day(flag.clearedAt) }) : <strong className="text-alert-800">{copy.flagOpen}</strong>}</span>
        </li>)}
      </ul>
    </section>}

    <section className="card p-4 sm:p-5" aria-labelledby={`${id}-form`}>
      <h2 id={`${id}-form`} className="font-bold text-brand-900">{current ? copy.renewTitle : copy.formTitle}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-600">{copy.formIntro}</p>
      <form className="mt-4 space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        {rows.length === 0 && <p className="text-sm text-ink-700">{copy.noLines}</p>}
        {rows.map((row) => {
          const name = nameOf(row.facilityId);
          const kindError = touched && rowMissingKind(row);
          const noteError = touched && rowMissingNote(row);
          return <fieldset key={row.facilityId} id={`${id}-${row.facilityId}-kinds`} className="relative min-w-0 rounded-lg border border-line p-3 sm:p-4"
            aria-describedby={kindError ? `${id}-${row.facilityId}-kinds-error` : `${id}-${row.facilityId}-hint`}>
            <legend className="sr-only">{fillTemplate(copy.relationship, { facility: name })}</legend>
            <p aria-hidden className="pe-10 text-sm font-bold text-ink-800">{fillTemplate(copy.relationship, { facility: name })}</p>
            <button type="button" className="absolute end-1 top-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-600 hover:text-alert-800"
              aria-label={fillTemplate(copy.remove, { facility: name })} onClick={() => setRows((all) => all.filter((r) => r.facilityId !== row.facilityId))}><X size={18} aria-hidden /></button>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {AFFILIATION_KINDS.map((kind) => <label key={kind} className="flex min-h-11 items-start gap-2.5 py-1.5 text-sm text-ink-800">
                <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-brand-700" checked={row.kinds.includes(kind)} aria-invalid={kindError || undefined}
                  onChange={() => update(row.facilityId, (r) => ({ ...r, kinds: toggleKind(r.kinds, kind) }))} />
                <span>{copy.kinds[kind]}</span>
              </label>)}
            </div>
            <p id={`${id}-${row.facilityId}-hint`} className="mt-1 text-[0.8125rem] text-ink-500">{copy.noneHint}</p>
            {kindError && <p id={`${id}-${row.facilityId}-kinds-error`} className="error-text mt-1">{copy.chooseKind}</p>}
            {row.kinds.includes("FINANCIAL_INTEREST") && <label id={`${id}-${row.facilityId}-note`} className="mt-3 block text-sm font-bold">{copy.noteLabel}
              <span id={`${id}-${row.facilityId}-note-hint`} className="mt-0.5 block text-[0.8125rem] font-normal text-ink-500">{copy.noteHint}</span>
              <textarea className={`field mt-1.5 ${noteError ? "field-error" : ""}`} rows={2} maxLength={2000} dir="auto" value={row.note} aria-invalid={noteError || undefined}
                aria-describedby={`${id}-${row.facilityId}-note-hint${noteError ? ` ${id}-${row.facilityId}-note-error` : ""}`}
                onChange={(e) => update(row.facilityId, (r) => ({ ...r, note: e.target.value }))} />
              {noteError && <span id={`${id}-${row.facilityId}-note-error`} className="error-text mt-1 block font-normal">{copy.noteRequired}</span>}
            </label>}
          </fieldset>;
        })}

        {directory.length === 0 ? <p className="text-sm text-ink-600">{copy.directoryEmpty}</p>
          : available.length > 0 && <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-0 flex-1 text-sm font-bold sm:max-w-sm">{copy.facility}
              <select className="field mt-1.5" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{copy.chooseFacility}</option>
                {available.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}
              </select>
            </label>
            <button type="button" className="btn-secondary inline-flex min-h-11 items-center gap-1.5" disabled={!pick} onClick={add}><Plus size={16} aria-hidden />{copy.addFacility}</button>
          </div>}

        <div id={`${id}-attest`}>
          <label className="flex items-start gap-3 text-[0.9375rem] leading-6 text-ink-800">
            <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-brand-700" checked={attested} onChange={(e) => setAttested(e.target.checked)}
              aria-invalid={touched && !attested ? true : undefined} aria-describedby={touched && !attested ? `${id}-attest-error` : undefined} />
            <span className="max-w-[70ch]">{copy.attestation}</span>
          </label>
          {touched && !attested && <p id={`${id}-attest-error`} className="error-text mt-1 ms-7">{copy.attestRequired}</p>}
        </div>

        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-alert-50 p-3 text-sm text-alert-800 outline-none">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{copy.submit}</button>
      </form>
    </section>

    <section className="card p-4 sm:p-5" aria-labelledby={`${id}-history`}>
      <h2 id={`${id}-history`} className="font-bold text-brand-900">{copy.history}</h2>
      {view.history.length === 0 ? <p className="mt-1 text-sm text-ink-500">{copy.noHistory}</p>
        : <ul className="mt-3 divide-y divide-line border-y border-line">
          {view.history.map((d) => <li key={d.id} className="py-2.5 text-sm">
            <p className="text-ink-700">{fillTemplate(copy.filed, { date: day(d.declaredAt) })}{d.supersededAt ? ` · ${fillTemplate(copy.replaced, { date: day(d.supersededAt) })}` : ""}</p>
            <DeclaredLines copy={copy} declaration={d} nameOf={nameOf} />
          </li>)}
        </ul>}
    </section>
  </>;
}

/** A declaration's facilities with their relationships in words; an empty declaration says what it means. */
function DeclaredLines({ copy, declaration, nameOf }: { copy: AffiliationCopy; declaration: Declaration; nameOf: (id: string, fallback?: string | null) => string }) {
  if (!declaration.lines.length) return <p className="mt-1.5 text-sm text-ink-700">{copy.usesNone}</p>;
  const byFacility = new Map<string, { name: string; kinds: string[] }>();
  for (const line of declaration.lines) {
    const entry = byFacility.get(line.facilityId) ?? { name: nameOf(line.facilityId, line.facilityName), kinds: [] };
    entry.kinds.push((copy.kindsShort as Record<string, string>)[line.kind] ?? line.kind);
    byFacility.set(line.facilityId, entry);
  }
  return <ul className="mt-1.5 space-y-0.5 text-sm">
    {[...byFacility.entries()].map(([facilityId, entry]) => <li key={facilityId}><bdi className="font-semibold text-ink-900">{entry.name}</bdi> <span className="text-ink-600">· {entry.kinds.join(" · ")}</span></li>)}
  </ul>;
}
