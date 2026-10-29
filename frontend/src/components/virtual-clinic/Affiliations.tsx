"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarClock, Plus, X } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import type { DirectoryFacility } from "@/components/portal/portal-model";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { AlertLine, DoneLine, Part, QUIET } from "./clinic-parts";
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

  if (failed && !view) return <AlertLine>{copy.loadFailed} <button type="button" className={QUIET} onClick={() => setAttempt((n) => n + 1)}>{copy.retry}</button></AlertLine>;
  if (!view) return <p role="status" className="text-[0.9375rem] text-ink-500">{copy.loading}</p>;
  return <>
    {filed && <div className="pb-5"><DoneLine>{copy.saved}</DoneLine></div>}
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
    <Part title={copy.title} lead={copy.lead}>
      {view.declarationCurrent && current ? <div className="mt-4">
        <StatusBadge tone="success">{copy.current}</StatusBadge>
        <p className="mt-1.5 text-[0.875rem] text-ink-600">{fillTemplate(copy.filed, { date: day(current.declaredAt) })} · {fillTemplate(copy.renewBy, { date: day(view.renewBy ?? current.validUntil) })}</p>
        <DeclaredLines copy={copy} declaration={current} nameOf={nameOf} />
      </div> : <div className="mt-4"><AlertLine role="status" title={copy.none}><p className="mt-0.5">{copy.noneBody}</p></AlertLine></div>}
    </Part>

    {view.flags.length > 0 && <Part title={copy.flagsTitle} lead={copy.flagsIntro}>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {view.flags.map((flag) => <li key={flag.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-[0.9375rem]">
          <span className="min-w-0"><bdi dir="ltr" className="font-semibold tabular-nums text-ink-900 whitespace-nowrap">{flag.caseNumber}</bdi> · <bdi>{nameOf(flag.facilityId, flag.facilityName)}</bdi>
            <span className="block text-[0.8125rem] text-ink-500">{fillTemplate(copy.flagRaised, { date: day(flag.raisedAt) })}{flag.clearedAt && <> · {fillTemplate(copy.flagCleared, { date: day(flag.clearedAt) })}</>}</span></span>
          {!flag.clearedAt && <StatusBadge tone="warning">{copy.flagOpen}</StatusBadge>}
        </li>)}
      </ul>
    </Part>}

    <Part title={current ? copy.renewTitle : copy.formTitle} lead={copy.formIntro}>
      <form className="mt-4 space-y-4" onSubmit={(e) => void submit(e)} noValidate>
        {rows.length === 0 && <p className="text-[0.9375rem] text-ink-700">{copy.noLines}</p>}
        {rows.map((row) => {
          const name = nameOf(row.facilityId);
          const kindError = touched && rowMissingKind(row);
          const noteError = touched && rowMissingNote(row);
          return <fieldset key={row.facilityId} id={`${id}-${row.facilityId}-kinds`} className="relative min-w-0 border-t border-line pt-3"
            aria-describedby={kindError ? `${id}-${row.facilityId}-kinds-error` : `${id}-${row.facilityId}-hint`}>
            <legend className="sr-only">{fillTemplate(copy.relationship, { facility: name })}</legend>
            <p aria-hidden className="pe-12 text-[0.9375rem] font-bold text-ink-800">{fillTemplate(copy.relationship, { facility: name })}</p>
            <button type="button" className="absolute end-0 top-0.5 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-600 hover:text-alert-800"
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

        {error && <div ref={errorRef} tabIndex={-1} className="outline-none"><AlertLine>{error}</AlertLine></div>}
        <button type="submit" className="btn-primary" disabled={busy}>{copy.submit}</button>
      </form>
    </Part>

    <Part title={copy.history}>
      {view.history.length === 0 ? <p className="mt-1 text-[0.9375rem] text-ink-600">{copy.noHistory}</p>
        : <ul className="mt-3 divide-y divide-line border-t border-line">
          {view.history.map((d) => <li key={d.id} className="py-3 text-[0.9375rem]">
            <p className="text-[0.875rem] text-ink-600">{fillTemplate(copy.filed, { date: day(d.declaredAt) })}{d.supersededAt ? ` · ${fillTemplate(copy.replaced, { date: day(d.supersededAt) })}` : ""}</p>
            <DeclaredLines copy={copy} declaration={d} nameOf={nameOf} />
          </li>)}
        </ul>}
    </Part>
  </>;
}

/** A declaration's facilities with their relationships in words; an empty declaration says what it means. */
function DeclaredLines({ copy, declaration, nameOf }: { copy: AffiliationCopy; declaration: Declaration; nameOf: (id: string, fallback?: string | null) => string }) {
  if (!declaration.lines.length) return <p className="mt-1.5 text-[0.9375rem] text-ink-700">{copy.usesNone}</p>;
  const byFacility = new Map<string, { name: string; kinds: string[] }>();
  for (const line of declaration.lines) {
    const entry = byFacility.get(line.facilityId) ?? { name: nameOf(line.facilityId, line.facilityName), kinds: [] };
    entry.kinds.push((copy.kindsShort as Record<string, string>)[line.kind] ?? line.kind);
    byFacility.set(line.facilityId, entry);
  }
  return <ul className="mt-1.5 space-y-0.5 text-[0.9375rem]">
    {[...byFacility.entries()].map(([facilityId, entry]) => <li key={facilityId}><bdi className="font-semibold text-ink-900">{entry.name}</bdi> <span className="text-ink-600">· {entry.kinds.join(" · ")}</span></li>)}
  </ul>;
}

/**
 * The owner's declaration status for the Virtual Clinic overview (P1-19 follow-up): read once per clinic load, so the overview can
 * say why the Consultant is not eligible and prompt a first or overdue declaration. Null until read, or when it cannot be read.
 */
export function useDeclarationStatus(call: AffiliationCall, practitionerId: string, enabled: boolean, refresh: unknown) {
  const [status, setStatus] = useState<{ key: string; view: AffiliationsView | null } | null>(null);
  const key = `${practitionerId}`;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    call<AffiliationsView>(`/clinics/${practitionerId}/affiliations`)
      .then((view) => { if (live) setStatus({ key, view: view && typeof view === "object" && "declarationCurrent" in view ? view : null }); },
        () => { if (live) setStatus({ key, view: null }); });
    return () => { live = false; };
  }, [call, practitionerId, enabled, refresh, key]);
  return enabled && status?.key === key ? status.view : null;
}

const RENEW_NOTICE_MS = 30 * 86_400_000;

/** The overview's prompt: a first declaration, a lapsed one, or one ending within 30 days; nothing otherwise. One quiet action. */
export function DeclarationPrompt({ locale, copy, view, now, onOpen }: { locale: Locale; copy: AffiliationCopy; view: AffiliationsView | null; now: number; onOpen: () => void }) {
  if (!view) return null;
  const words = copy.overview;
  const renewBy = view.renewBy ? new Date(view.renewBy) : null;
  if (view.declarationCurrent && !(renewBy && renewBy.getTime() - now < RENEW_NOTICE_MS)) return null;
  const first = !view.current && view.history.length === 0;
  const action = <button type="button" className={QUIET} onClick={onOpen}>{words.action}</button>;
  // Hairline notices (UX 3-3): a renewal is a reminder in ink; a missing declaration stops new cases, so it is said in alert ink.
  if (view.declarationCurrent && renewBy) return <div role="status" className="flex items-start gap-2.5 border-y border-line py-3 text-[0.9375rem] leading-6 text-ink-800">
    <CalendarClock size={18} aria-hidden className="mt-0.5 flex-none text-brand-700" />
    <div><p>{fillTemplate(words.renewSoon, { date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(renewBy) })}</p>{action}</div>
  </div>;
  return <AlertLine role="status" title={first ? words.firstTitle : words.lapsedTitle}><p className="mt-0.5">{first ? words.firstBody : words.lapsedBody}</p>{action}</AlertLine>;
}
