"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate, plural } from "@/lib/portal-labels";
import { statusLabel } from "@/components/portal/portal-model";
import type { AdminApi } from "./admin-api";
import { ControlCenterError, EmptyState, Facts, Field, SectionTabs, StatusBadge, TabPanel, WordedErrorNotice } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { WorkforcePage, json, syncQuery, useRead } from "./workforce-ui";

/** The page's words, plus the day counts in the locale's plural forms (`portalWork.plural.retentionDays`). */
export type RetentionCopy = Dictionary["portalWork"]["retention"] & { days: Dictionary["portalWork"]["plural"]["retentionDays"] };
type Tab = "policies" | "purges" | "erase";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export type Policy = {
  recordClass: string; retentionDays?: number | null; anchor: string; legalHold: boolean; enforced: boolean; basis: string;
  lastPurgedAt?: string | null; tables: string[];
};
export type ClassTotals = { recordClass: string; purges: number; rowsAffected: number; filesDeleted: number; bytesDeleted: number; lastPurgedAt?: string | null };
export type Purge = {
  id: string; recordClass: string; subjectType: string; subjectId?: string | null; caseNumber?: string | null; cause: string; policyDays?: number | null;
  rowsAffected: number; filesDeleted: number; bytesDeleted: number; actor: string; requestReference?: string | null; purgedAt: string;
};
export type PurgeLog = { from: string; to: string; totals: ClassTotals[]; purges: Purge[]; truncated: boolean };
export type ErasurePreview = {
  patientId: string; cases: { caseNumber: string; status: string; draft: boolean; purged: boolean }[]; hasAccount: boolean; blockers: string[]; erasedAt?: string | null;
};
export type ErasureResult = {
  purgeId: string; patientId: string; erasedAt: string; casesKept: number; draftsPurged: number; rowsAffected: number; filesDeleted: number; accountRemovalQueued: boolean;
};

/** Deep-linkable state (`?tab=…&class=…&case=…`): read once from the route, kept in step as the viewer changes it. Never the request reference. */
export type RetentionQuery = { tab?: string; class?: string; case?: string };
const TABS = ["policies", "purges", "erase"] as const;
type PolicyState = keyof RetentionCopy["policies"]["states"];
const STATE_TONE: Record<PolicyState, Tone> = { NIGHTLY: "success", NOT_YET: "neutral", HOLD: "warning", KEPT: "neutral" };

/** A hold wins; no days = kept; days with a running handler = removed nightly; days without one = classified, not removed yet. */
export function policyState(p: Policy): PolicyState {
  if (p.legalHold) return "HOLD";
  if (p.retentionDays === null || p.retentionDays === undefined) return "KEPT";
  return p.enforced ? "NIGHTLY" : "NOT_YET";
}

const word = (map: Record<string, string>, code?: string | null) => (code ? map[code] ?? code : "—");
/** Case numbers inside a sentence keep their left-to-right order in Arabic (LRI … PDI). */
const ltr = (value: string) => `⁦${value}⁩`;

function useFormats(locale: Locale) {
  return useMemo(() => {
    const tag = intlLocale(locale);
    const dayFormat = new Intl.DateTimeFormat(tag, { dateStyle: "medium" });
    const timeFormat = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
    const count = new Intl.NumberFormat(tag);
    const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
    const sizes = units.map((unit) => new Intl.NumberFormat(tag, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: 1 }));
    return {
      day: (iso?: string | null) => (iso ? dayFormat.format(new Date(iso)) : "—"),
      time: (iso: string) => timeFormat.format(new Date(iso)),
      n: (value: number) => count.format(value),
      bytes: (value: number) => {
        let size = value, step = 0;
        while (size >= 1024 && step < units.length - 1) { size /= 1024; step++; }
        return sizes[step].format(size);
      },
    };
  }, [locale]);
}
type Formats = ReturnType<typeof useFormats>;

/**
 * Reviews & Safety › Retention (P1-7, review E-03): how long each record class is kept, the purge log, and the erasure of a person on
 * request. Compliance and Care Coordination Managers read (RETENTION_READ); only a Care Coordination Manager erases (SUBJECT_ERASE,
 * fresh sign-in). Policies change by migration only, so there is no edit control. The backend authorises every call.
 */
export function RetentionPage({ locale, copy, query }: { locale: Locale; copy: RetentionCopy; query?: RetentionQuery }) {
  return <WorkforcePage locale={locale} active="retention" title={copy.title} intro={copy.intro} allowed={(a) => a.can("RETENTION_READ")}>
    {({ access, api }) => <Retention locale={locale} copy={copy} api={api} can={access.can} query={query} />}
  </WorkforcePage>;
}

export function Retention({ locale, copy, api, can, query = {} }: { locale: Locale; copy: RetentionCopy; api: AdminApi; can: (permission: string) => boolean; query?: RetentionQuery }) {
  const tabs: Tab[] = can("SUBJECT_ERASE") ? ["policies", "purges", "erase"] : ["policies", "purges"];
  const [chosen, setChosen] = useState<Tab | null>(() => (TABS as readonly string[]).includes(query.tab ?? "") ? query.tab as Tab : null);
  const [recordClass, setRecordClassState] = useState(() => Object.hasOwn(copy.classes, query.class ?? "") ? query.class! : "");
  const tab = chosen && tabs.includes(chosen) ? chosen : tabs[0];
  const setTab = (next: Tab) => { setChosen(next); syncQuery({ tab: next, ...(next === "erase" ? {} : { case: null }) }); };
  const setRecordClass = (next: string) => { setRecordClassState(next); syncQuery({ class: next || null }); };
  return <>
    <SectionTabs label={copy.tabs.label} active={tab} onChange={setTab} tabs={tabs.map((key) => ({ key, label: copy.tabs[key] }))} />
    <TabPanel id={tab}>
      {tab === "policies" && <Policies locale={locale} copy={copy} api={api} />}
      {tab === "purges" && <Purges locale={locale} copy={copy} api={api} recordClass={recordClass} onRecordClass={setRecordClass} />}
      {tab === "erase" && <Erasure locale={locale} copy={copy} api={api} initialCase={query.case ?? ""} onSeeLog={() => { setRecordClass("PERSONAL_IDENTITY"); setTab("purges"); }} />}
    </TabPanel>
  </>;
}

// ---- Policies ----

function Policies({ locale, copy, api }: { locale: Locale; copy: RetentionCopy; api: AdminApi }) {
  const t = copy.policies;
  const { data, error, reload } = useRead<Policy[]>(api, "/compliance/retention/policies");
  const f = useFormats(locale);
  return <>
    <WordedErrorNotice error={error} locale={locale} words={copy.errors} action="load" onRetry={reload} />
    {!data ? (!error && <p role="status">{copy.loading}</p>) : !data.length ? <EmptyState title={t.empty} /> :
      <ul className="cc-list">
        <li className="cc-list-head" aria-hidden><span>{t.class}</span><span>{t.keptFor}</span><span>{t.state}</span><span>{t.lastPurge}</span></li>
        {data.map((p) => <PolicyRow key={p.recordClass} locale={locale} copy={copy} policy={p} f={f} />)}
      </ul>}
  </>;
}

function PolicyRow({ locale, copy, policy: p, f }: { locale: Locale; copy: RetentionCopy; policy: Policy; f: Formats }) {
  const t = copy.policies;
  const state = policyState(p);
  const days = p.retentionDays ?? null;
  const name = word(copy.classes, p.recordClass);
  return <li>
    <span>
      <strong>{name}</strong>
      <span className="cc-row-sub">{word(copy.classMeaning, p.recordClass)}</span>
      <details className="cc-retention-tables">
        <summary>{fillTemplate(t.tables, { count: f.n(p.tables.length) })}</summary>
        <ul>{p.tables.map((table) => <li key={table}><code dir="ltr" translate="no">{table}</code></li>)}</ul>
        <p className="cc-meta">{t.basis}</p>
        <p lang="en" dir="ltr" className="cc-retention-basis">{p.basis}</p>
      </details>
    </span>
    <span>
      <span className="sr-only">{t.keptFor}: </span>
      {days !== null ? plural(locale, days, copy.days) : p.legalHold ? t.never : t.noTerm}
      {days !== null && <span className="cc-row-sub">{word(copy.anchors, p.anchor)}</span>}
    </span>
    <span>
      <span className="sr-only">{t.state}: </span>
      <StatusBadge tone={STATE_TONE[state]}>{t.states[state]}</StatusBadge>
      {state === "NOT_YET" && <span className="cc-row-sub">{t.notYetNote}</span>}
      {state === "HOLD" && <span className="cc-row-sub">{t.holdNote}</span>}
    </span>
    <span><span className="sr-only">{t.lastPurge}: </span>{p.lastPurgedAt ? f.day(p.lastPurgedAt) : <span className="cc-meta">{t.neverPurged}</span>}</span>
  </li>;
}

// ---- Purge log ----

/** A chosen day as the instant it starts in the viewer's time zone; `to` is exclusive, so the end day counts whole. */
const dayStart = (date: string, plusDays = 0) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + plusDays); return d.toISOString(); };

function Purges({ locale, copy, api, recordClass, onRecordClass }: { locale: Locale; copy: RetentionCopy; api: AdminApi; recordClass: string; onRecordClass: (next: string) => void }) {
  const t = copy.purges;
  const id = useId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams({ ...(from ? { from: dayStart(from) } : {}), ...(to ? { to: dayStart(to, 1) } : {}), ...(recordClass ? { recordClass } : {}) });
  const path = `/compliance/retention/purges${params.size ? `?${params}` : ""}`;
  const { data, error, reload } = useRead<PurgeLog>(api, from && to && from > to ? null : path);
  const f = useFormats(locale);
  const shown = data?.totals.filter((row) => row.purges > 0) ?? [];

  return <>
    <p className="cc-meta" style={{ maxWidth: "70ch" }}>{t.intro}</p>
    <div className="cc-filterbar" role="search" aria-label={t.filters}>
      <label>{t.from}<input type="date" dir="ltr" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-describedby={`${id}-period`} /></label>
      <label>{t.to}<input type="date" dir="ltr" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-describedby={`${id}-period`} /></label>
      <label>{t.class}
        <select value={recordClass} onChange={(e) => onRecordClass(e.target.value)}>
          <option value="">{t.anyClass}</option>
          {Object.entries(copy.classes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>
    <p id={`${id}-period`} className="cc-meta">{t.periodHint}</p>
    <WordedErrorNotice error={error} locale={locale} words={copy.errors} action="load" onRetry={reload} />
    {!data ? (!error && <p role="status">{copy.loading}</p>) : <>
      <section aria-labelledby={`${id}-totals`}>
        <h3 id={`${id}-totals`} className="cc-subhead">{t.totals}</h3>
        <p className="cc-meta"><bdi>{f.day(data.from)}</bdi> – <bdi>{f.day(data.to)}</bdi></p>
        {!shown.length ? <p>{t.totalsEmpty}</p> : <div className="cc-table-wrap">
          <table className="cc-data">
            <caption className="sr-only">{t.totals}</caption>
            <thead><tr><th scope="col">{t.class}</th><th scope="col">{t.purgesCount}</th><th scope="col">{t.rows}</th><th scope="col">{t.files}</th><th scope="col">{t.size}</th><th scope="col">{t.last}</th></tr></thead>
            <tbody>{shown.map((row) => <tr key={row.recordClass}>
              <th scope="row" style={{ fontWeight: 600 }}>{word(copy.classes, row.recordClass)}</th>
              <td className="cc-num"><bdi dir="ltr">{f.n(row.purges)}</bdi></td>
              <td className="cc-num"><bdi dir="ltr">{f.n(row.rowsAffected)}</bdi></td>
              <td className="cc-num"><bdi dir="ltr">{f.n(row.filesDeleted)}</bdi></td>
              <td className="cc-num">{f.bytes(row.bytesDeleted)}</td>
              <td>{f.day(row.lastPurgedAt)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      <h3 className="cc-subhead">{copy.tabs.purges}</h3>
      {!data.purges.length ? <EmptyState title={t.empty} /> : <ul className="cc-list" style={{ marginTop: 8 }}>
        <li className="cc-list-head" aria-hidden><span>{t.when}</span><span>{t.what}</span><span>{t.cause}</span><span>{t.by}</span></li>
        {data.purges.map((p) => <PurgeRow key={p.id} locale={locale} copy={copy} purge={p} f={f} />)}
      </ul>}
      {data.truncated && <p role="note" className="cc-meta" style={{ marginTop: 12 }}>{fillTemplate(t.truncated, { count: f.n(data.purges.length) })}</p>}
    </>}
  </>;
}

function PurgeRow({ locale, copy, purge: p, f }: { locale: Locale; copy: RetentionCopy; purge: Purge; f: Formats }) {
  const t = copy.purges;
  const subjects = t.subjects as Record<string, string>;
  const subject = Object.hasOwn(subjects, p.subjectType) ? fillTemplate(subjects[p.subjectType], { caseNumber: ltr(p.caseNumber ?? "") }) : p.subjectType;
  return <li>
    <span><strong>{f.time(p.purgedAt)}</strong><span className="cc-row-sub">{word(copy.classes, p.recordClass)}</span></span>
    <span>
      <span className="sr-only">{t.what}: </span>{subject}
      <span className="cc-row-sub">{fillTemplate(t.counts, { rows: f.n(p.rowsAffected), files: f.n(p.filesDeleted), size: f.bytes(p.bytesDeleted) })}</span>
      {p.requestReference && <span className="cc-row-sub" dir="auto" style={{ overflowWrap: "anywhere" }}>{fillTemplate(t.reference, { reference: `⁨${p.requestReference}⁩` })}</span>}
    </span>
    <span>
      <span className="sr-only">{t.cause}: </span>
      <StatusBadge tone={p.cause === "ERASURE_REQUEST" ? "info" : "neutral"}>{word(t.causes, p.cause)}</StatusBadge>
      {p.policyDays ? <span className="cc-row-sub">{fillTemplate(t.afterDays, { days: plural(locale, p.policyDays, copy.days) })}</span> : null}
    </span>
    <span><span className="sr-only">{t.by}: </span>{p.actor === "SYSTEM" ? t.system : t.staff}</span>
  </li>;
}

// ---- Erase a person ----

/**
 * The erasure of a person on request (SUBJECT_ERASE): the case number they are known by → what would happen to each of their cases and
 * their account, with any blocker worded as what to do first → where and when they asked → an irreversible confirmation (fresh sign-in)
 * → the result. One primary action per step.
 */
function Erasure({ locale, copy, api, initialCase, onSeeLog }: { locale: Locale; copy: RetentionCopy; api: AdminApi; initialCase: string; onSeeLog: () => void }) {
  const t = copy.erase;
  const id = useId();
  const [input, setInput] = useState(initialCase);
  // Each look-up is its own mount (keyed by number and attempt), so a preview never shows against another case number.
  const [lookup, setLookup] = useState(() => ({ caseNumber: normalise(initialCase), attempt: 0 }));
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<ErasureResult | null>(null);

  function find(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    const next = normalise(input);
    if (!next) { document.getElementById(`${id}-case`)?.focus(); return; }
    setResult(null);
    setLookup((prev) => ({ caseNumber: next, attempt: prev.attempt + 1 }));
    syncQuery({ case: next });
  }
  function startOver() {
    setResult(null); setLookup((prev) => ({ caseNumber: "", attempt: prev.attempt + 1 })); setInput(""); setTouched(false); syncQuery({ case: null });
    requestAnimationFrame(() => document.getElementById(`${id}-case`)?.focus());
  }

  const missing = touched && !normalise(input);
  return <>
    <p className="cc-meta" style={{ maxWidth: "70ch" }}>{t.intro}</p>
    {!result && <form onSubmit={find} noValidate className="cc-retention-find" aria-label={t.find}>
      <Field label={t.caseNumber} hint={t.caseNumberHint} required error={missing ? t.caseNumberRequired : undefined}>
        <input id={`${id}-case`} dir="ltr" autoComplete="off" spellCheck={false} maxLength={20} value={input} onChange={(e) => setInput(e.target.value)}
          aria-invalid={missing ? true : undefined} placeholder="RS-2026-000123" />
      </Field>
      {/* After a look-up the erasure is the step's one primary action; looking up again turns secondary. */}
      <button type="submit" className={lookup.caseNumber ? "cc-secondary" : undefined}>{t.find}</button>
    </form>}
    {result ? <ErasureDone locale={locale} copy={copy} result={result} onSeeLog={onSeeLog} onStartOver={startOver} />
      : lookup.caseNumber && <ErasureLookup key={`${lookup.caseNumber}-${lookup.attempt}`} locale={locale} copy={copy} api={api} caseNumber={lookup.caseNumber} onErased={setResult} />}
  </>;
}

function normalise(value: string) { return value.trim().toUpperCase(); }

function ErasureLookup({ locale, copy, api, caseNumber, onErased }: { locale: Locale; copy: RetentionCopy; api: AdminApi; caseNumber: string; onErased: (result: ErasureResult) => void }) {
  const { data, error, reload } = useRead<ErasurePreview>(api, `/compliance/retention/erasures/preview?caseNumber=${encodeURIComponent(caseNumber)}`);
  if (error) return <WordedErrorNotice error={error} locale={locale} words={copy.errors} action="load" onRetry={reload} />;
  if (!data) return <p role="status">{copy.loading}</p>;
  return <ErasurePreviewSheet locale={locale} copy={copy} api={api} caseNumber={caseNumber} preview={data} onErased={onErased} onRefused={reload} />;
}

function ErasurePreviewSheet({ locale, copy, api, caseNumber, preview, onErased, onRefused }: {
  locale: Locale; copy: RetentionCopy; api: AdminApi; caseNumber: string; preview: ErasurePreview; onErased: (result: ErasureResult) => void; onRefused: () => void;
}) {
  const t = copy.erase;
  const id = useId();
  const f = useFormats(locale);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const missing = touched && !reference.trim();

  function review(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!reference.trim()) { document.getElementById(`${id}-reference`)?.focus(); return; }
    setConfirming(true);
  }

  return <section className="cc-section" aria-labelledby={`${id}-title`} style={{ marginTop: 16 }}>
    <div className="cc-section-head">
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{fillTemplate(t.previewTitle, { caseNumber: ltr(caseNumber) })}</h2>
    </div>
    <h3 className="cc-subhead">{t.casesTitle}</h3>
    <ul className="cc-retention-cases">
      {preview.cases.map((c) => <li key={c.caseNumber}>
        <strong><bdi dir="ltr">{c.caseNumber}</bdi></strong>
        <span className="cc-row-sub">{c.purged ? t.casePurged : c.draft ? t.caseDraft : t.caseKept}{c.draft ? null : <> · {statusLabel(c.status, locale)}</>}</span>
      </li>)}
    </ul>

    <h3 className="cc-subhead">{t.accountTitle}</h3>
    <p>{preview.hasAccount ? t.accountRemoved : t.noAccount}</p>

    {preview.erasedAt ? <p role="status" className="cc-notice cc-notice-info" style={{ marginTop: 20 }}>
      {fillTemplate(t.erasedOn, { date: f.day(preview.erasedAt) })} {t.blockers.ERASURE_ALREADY_DONE}
    </p> : preview.blockers.length ? <div role="alert" className="cc-notice cc-notice-warning" style={{ marginTop: 20 }}>
      <div>
        <p><strong>{t.blockedTitle}</strong></p>
        <p>{t.blockedLead}</p>
        <ul style={{ margin: "4px 0 0", paddingInlineStart: 20, listStyle: "disc" }}>
          {preview.blockers.map((code) => <li key={code}>{word(t.blockers, code)}</li>)}
        </ul>
      </div>
    </div> : <>
      <div className="cc-retention-split">
        <div><h3 className="cc-subhead">{t.removedTitle}</h3><ul className="cc-consequences">{t.removed.map((line) => <li key={line}>{line}</li>)}</ul></div>
        <div><h3 className="cc-subhead">{t.keptTitle}</h3><ul className="cc-consequences">{t.kept.map((line) => <li key={line}>{line}</li>)}</ul></div>
      </div>
      <form onSubmit={review} noValidate aria-label={t.continue}>
        <Field label={t.reference} hint={t.referenceHint} required error={missing ? t.referenceRequired : undefined}>
          <textarea id={`${id}-reference`} rows={2} maxLength={200} dir="auto" value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={missing ? true : undefined} />
        </Field>
        <div className="cc-form-actions"><button type="submit">{t.continue}</button></div>
      </form>
    </>}
    {confirming && <ConfirmErasure locale={locale} copy={copy} api={api} caseNumber={caseNumber} reference={reference.trim()} preview={preview}
      onClose={(refused) => { setConfirming(false); if (refused) onRefused(); }} onErased={onErased} />}
  </section>;
}

function ConfirmErasure({ locale, copy, api, caseNumber, reference, preview, onClose, onErased }: {
  locale: Locale; copy: RetentionCopy; api: AdminApi; caseNumber: string; reference: string; preview: ErasurePreview;
  onClose: (refused: boolean) => void; onErased: (result: ErasureResult) => void;
}) {
  const t = copy.erase;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const f = useFormats(locale);
  const drafts = preview.cases.filter((c) => c.draft && !c.purged).length;
  const kept = preview.cases.filter((c) => !c.draft).length;
  // A blocker that arose since the preview (409 with its code): closing reloads the preview so it shows what to do first.
  const refused = error instanceof ControlCenterError && (error.code ?? "").startsWith("ERASURE_");

  async function erase(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try { onErased(await api<ErasureResult>("/compliance/retention/erasures", json("POST", { caseNumber, reference }))); }
    catch (e) { setError(e); setBusy(false); }
  }
  return <FocusTrapDialog label={t.confirmTitle} onClose={busy ? () => undefined : () => onClose(refused)}>
    <form onSubmit={(e) => void erase(e)}>
      <h2>{t.confirmTitle}</h2>
      <p><strong>{t.confirmLead}</strong></p>
      <Facts items={[[t.casesKept, <bdi key="k" dir="ltr">{f.n(kept)}</bdi>], [t.draftsPurged, <bdi key="d" dir="ltr">{f.n(drafts)}</bdi>], [t.account, preview.hasAccount ? t.accountRemoved : t.noAccount]]} />
      <ul className="cc-consequences"><li>{t.freshSignIn}</li></ul>
      <WordedErrorNotice error={error} locale={locale} words={copy.errors} />
      <div className="cc-form-actions">
        <button type="submit" className="cc-danger-button" disabled={busy}>{t.confirm}</button>
        <button type="button" className="cc-secondary" disabled={busy} onClick={() => onClose(refused)}>{t.cancel}</button>
      </div>
    </form>
  </FocusTrapDialog>;
}

function ErasureDone({ locale, copy, result, onSeeLog, onStartOver }: { locale: Locale; copy: RetentionCopy; result: ErasureResult; onSeeLog: () => void; onStartOver: () => void }) {
  const t = copy.erase;
  const f = useFormats(locale);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const num = (value: number) => <bdi dir="ltr">{f.n(value)}</bdi>;
  return <section className="cc-section" aria-labelledby="erasure-done" style={{ marginTop: 16 }}>
    <div className="cc-section-head"><h2 id="erasure-done" ref={heading} tabIndex={-1}>{t.doneTitle}</h2></div>
    <p role="status">{fillTemplate(t.done, { date: f.day(result.erasedAt) })}</p>
    <Facts items={[[t.casesKept, num(result.casesKept)], [t.draftsPurged, num(result.draftsPurged)], [t.rowsAffected, num(result.rowsAffected)],
      [t.filesDeleted, num(result.filesDeleted)], [t.account, result.accountRemovalQueued ? t.accountQueued : t.accountNone]]} />
    <div className="cc-form-actions">
      <button type="button" className="cc-secondary" onClick={onSeeLog}>{t.seeLog}</button>
      <button type="button" className="cc-secondary" onClick={onStartOver}>{t.lookUpAnother}</button>
    </div>
  </section>;
}
