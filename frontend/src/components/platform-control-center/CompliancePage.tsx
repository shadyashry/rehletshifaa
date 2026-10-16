"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import type { AffiliationFlag, Declaration } from "@/components/virtual-clinic/virtual-clinic-model";
import type { AdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Facts, SectionTabs, StatusBadge, TabPanel, WordedErrorNotice } from "./cc-ui";
import { WorkforcePage, json, syncQuery, useRead } from "./workforce-ui";

/** The page's words, plus the relationship words the Consultant's own page uses (`portalWork.affiliations.kindsShort`). */
export type ComplianceCopy = Dictionary["portalWork"]["compliance"] & { kinds: Record<string, string> };
type Tab = "declarations" | "flags" | "scorecards" | "samples";
type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export type OutcomeFigures = { point: string; asked: number; answered: number; byRepresentative: number; complications: number; suppressed: boolean;
  averagePain?: number | null; averageFunction?: number | null; averageSatisfaction?: number | null };
export type Scorecard = {
  subject: "CONSULTANT" | "FACILITY"; subjectId: string; name: string; from: string; to: string; cases: number; smallCohort: boolean;
  quotes: { finalQuotesAccepted: number; comparable: number; averageFinalToEstimateMaximum?: number | null; aboveEstimateMaximum: number };
  changeOrders: { casesWithChangeOrders: number; changeOrders: number; emergency: number };
  reconciliation: { reconciled: number; withVariance: number; disputed: number; unapprovedExtraCases: number; unapprovedExtraLines: number; unapprovedExtrasEgp: number; billingErrorLines: number };
  safety: { complicationsReported: number; adverseEventCases: number; reopenedCases: number; patientConcerns: number; chargeDisputes: number };
  followUp: { contactsHeld: number; contactsMissed: number; completionRate?: number | null };
  outcomes: OutcomeFigures[]; undeclaredFacilityFlags: number; packagesSuspended?: boolean | null; patientRating: string;
};
export type SampleSummary = { id: string; month: string; kind: string; requestedSize: number; candidates: number; cases: number; pending: number; drawnBy?: string | null; drawnAt: string };
export type SampleCase = {
  caseId: string; caseNumber: string; closedAt?: string | null; practitionerId?: string | null; consultantName?: string | null; facilityId?: string | null; facilityName?: string | null;
  record: Record<string, string>; mismatches: string[]; reviewStatus: string; reviewedAt?: string | null; findingNote?: string | null; incidentId?: string | null;
};
export type SampleView = { sample: SampleSummary; cases: SampleCase[] };

/** Deep-linkable state (`?tab=…&review=…&flags=all`): read once from the route, kept in step as the viewer changes it. */
export type ComplianceQuery = { tab?: string; review?: string; flags?: string };
const TABS = ["declarations", "flags", "scorecards", "samples"] as const;
const REVIEW_STATUSES = ["PENDING", "CLEARED", "FINDING"] as const;

const REVIEW_TONE: Record<string, Tone> = { PENDING: "warning", CLEARED: "success", FINDING: "danger", NO_FINDING: "success" };
const word = (map: Record<string, string>, code?: string | null) => (code ? map[code] ?? code : "—");

/**
 * Reviews & Safety › Compliance (P1-19, design §7): the hospital-agreement audit. Compliance reviews affiliation declarations and
 * sampled cases (its only writes, COMPLIANCE_REVIEW) and draws extra samples; Consultant Operations read the declarations, the flags and
 * the scorecards. Every tab is shown only to a caller who can read it; the backend authorises every call.
 */
export function CompliancePage({ locale, copy, query }: { locale: Locale; copy: ComplianceCopy; query?: ComplianceQuery }) {
  return <WorkforcePage locale={locale} active="compliance" title={copy.title} intro={copy.intro} allowed={(a) => a.canAny(["SCORECARD_READ", "AUDIT_SAMPLE_READ"])}>
    {({ access, api }) => <Compliance locale={locale} copy={copy} api={api} can={access.can} query={query} />}
  </WorkforcePage>;
}

export function Compliance({ locale, copy, api, can, query = {} }: { locale: Locale; copy: ComplianceCopy; api: AdminApi; can: (permission: string) => boolean; query?: ComplianceQuery }) {
  const tabs = useMemo(() => ([
    ...(can("AFFILIATION_READ") ? ["declarations", "flags"] as const : []),
    ...(can("SCORECARD_READ") ? ["scorecards"] as const : []),
    ...(can("AUDIT_SAMPLE_READ") ? ["samples"] as const : []),
  ] as Tab[]), [can]);
  const [chosen, setChosen] = useState<Tab | null>(() => (TABS as readonly string[]).includes(query.tab ?? "") ? query.tab as Tab : null);
  const setTab = (next: Tab) => { setChosen(next); syncQuery({ tab: next }); };
  const tab = chosen && tabs.includes(chosen) ? chosen : tabs[0];
  const canReview = can("COMPLIANCE_REVIEW");
  if (!tab) return null;
  return <>
    {!canReview && <p className="cc-meta">{copy.readOnly}</p>}
    <SectionTabs label={copy.tabs.label} active={tab} onChange={setTab} tabs={tabs.map((key) => ({ key, label: copy.tabs[key] }))} />
    <TabPanel id={tab}>
      {tab === "declarations" && <Declarations locale={locale} copy={copy} api={api} canReview={canReview}
        initialStatus={(REVIEW_STATUSES as readonly string[]).includes(query.review ?? "") ? query.review! : ""} />}
      {tab === "flags" && <Flags locale={locale} copy={copy} api={api} initialOpenOnly={query.flags !== "all"} />}
      {tab === "scorecards" && <Scorecards locale={locale} copy={copy} api={api} />}
      {tab === "samples" && <Samples locale={locale} copy={copy} api={api} canReview={canReview} />}
    </TabPanel>
  </>;
}

/** A refusal this page can word (a known compliance code) in its own words, with the support code; anything else as usual. */
function ComplianceError({ error, locale, copy, action, onRetry }: { error: unknown; locale: Locale; copy: ComplianceCopy; action?: "load" | "save"; onRetry?: () => void }) {
  return <WordedErrorNotice error={error} locale={locale} words={copy.errors} action={action} onRetry={onRetry} />;
}

function useDates(locale: Locale) {
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" });
    return (iso?: string | null) => (iso ? day.format(new Date(iso)) : "—");
  }, [locale]);
}

/** One review form: the outcome as two choices and a note, required when the outcome is a finding. One primary action. */
function ReviewForm<O extends string>({ title, legend, outcomes, finding, noteLabel, noteHint, chooseOutcome, noteRequired, submit, busy, onSubmit }: {
  title: string; legend: string; outcomes: Record<O, string>; finding: O; noteLabel: string; noteHint: string; chooseOutcome: string; noteRequired: string; submit: string;
  busy: boolean; onSubmit: (outcome: O, note: string) => Promise<boolean>;
}) {
  const id = useId();
  const [outcome, setOutcome] = useState<O | "">("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const missingOutcome = !outcome;
  const missingNote = outcome === finding && !note.trim();
  async function send(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (missingOutcome) { document.querySelector<HTMLInputElement>(`input[name="${id}-outcome"]`)?.focus(); return; }
    if (missingNote) { document.getElementById(`${id}-note`)?.focus(); return; }
    if (await onSubmit(outcome as O, note.trim())) { setOutcome(""); setNote(""); setTouched(false); }
  }
  return <form onSubmit={(e) => void send(e)} noValidate aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="cc-subhead">{title}</h3>
    <fieldset aria-describedby={touched && missingOutcome ? `${id}-outcome-error` : undefined} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="cc-field-label">{legend}<span className="cc-required" aria-hidden> *</span></legend>
      <div className="cc-choices">
        {(Object.keys(outcomes) as O[]).map((key) => <label key={key} className="cc-choice">
          <input type="radio" name={`${id}-outcome`} value={key} checked={outcome === key} onChange={() => setOutcome(key)} />
          <span>{outcomes[key]}</span>
        </label>)}
      </div>
      {touched && missingOutcome && <p id={`${id}-outcome-error`} className="cc-field-error">{chooseOutcome}</p>}
    </fieldset>
    <label className={"cc-field" + (touched && missingNote ? " cc-field-invalid" : "")}>
      <span className="cc-field-label">{noteLabel}{outcome === finding && <span className="cc-required" aria-hidden> *</span>}</span>
      <span className="cc-field-hint" id={`${id}-note-hint`}>{noteHint}</span>
      <textarea id={`${id}-note`} rows={4} dir="auto" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={touched && missingNote ? true : undefined}
        aria-describedby={`${id}-note-hint${touched && missingNote ? ` ${id}-note-error` : ""}`} />
      {touched && missingNote && <span id={`${id}-note-error`} className="cc-field-error">{noteRequired}</span>}
    </label>
    <div className="cc-form-actions"><button type="submit" disabled={busy}>{submit}</button></div>
  </form>;
}

// ---- Declarations ----

function Declarations({ locale, copy, api, canReview, initialStatus }: { locale: Locale; copy: ComplianceCopy; api: AdminApi; canReview: boolean; initialStatus: string }) {
  const t = copy.declarations;
  const [status, setStatusState] = useState(initialStatus);
  const setStatus = (next: string) => { setStatusState(next); syncQuery({ review: next || null }); };
  const [selected, setSelected] = useState<Declaration | null>(null);
  const { data, error, reload } = useRead<Declaration[]>(api, `/compliance/affiliations/declarations${status ? `?reviewStatus=${status}` : ""}`);
  const day = useDates(locale);
  // The queue first: declarations waiting for review lead, each group newest first as the backend sends it.
  const rows = useMemo(() => data ? [...data].sort((a, b) => Number(b.reviewStatus === "PENDING") - Number(a.reviewStatus === "PENDING")) : null, [data]);

  if (selected) return <DeclarationDetail locale={locale} copy={copy} api={api} declaration={selected} canReview={canReview} onBack={() => { setSelected(null); reload(); }} />;
  return <>
    <div className="cc-filterbar" role="search" aria-label={t.filter}>
      <label>{t.filter}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t.any}</option>
          {(["PENDING", "CLEARED", "FINDING"] as const).map((s) => <option key={s} value={s}>{copy.reviewStatus[s]}</option>)}
        </select>
      </label>
    </div>
    <ComplianceError error={error} locale={locale} copy={copy} action="load" onRetry={reload} />
    {!rows ? (!error && <p role="status">{copy.loading}</p>) : !rows.length ? <EmptyState title={t.empty} /> :
      <ul className="cc-list">
        <li className="cc-list-head" aria-hidden><span>{t.consultant}</span><span>{t.filedLabel}</span><span>{t.review}</span><span /></li>
        {rows.map((d) => <li key={d.id}>
          <span><strong><bdi>{d.consultantName ?? "—"}</bdi></strong><span className="cc-row-sub">{d.current ? t.current : d.supersededAt ? fillTemplate(t.replaced, { date: day(d.supersededAt) }) : null}</span></span>
          <span>{day(d.declaredAt)}</span>
          <span><StatusBadge tone={REVIEW_TONE[d.reviewStatus ?? ""] ?? "neutral"}>{word(copy.reviewStatus, d.reviewStatus)}</StatusBadge></span>
          <span><button type="button" className="cc-secondary" aria-label={fillTemplate(t.open, { consultant: d.consultantName ?? "" })} onClick={() => setSelected(d)}>{t.view}</button></span>
        </li>)}
      </ul>}
  </>;
}

function DeclarationDetail({ locale, copy, api, declaration, canReview, onBack }: {
  locale: Locale; copy: ComplianceCopy; api: AdminApi; declaration: Declaration; canReview: boolean; onBack: () => void;
}) {
  const t = copy.declarations;
  const [d, setD] = useState(declaration);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const day = useDates(locale);
  const facilities = groupLines(d.lines, copy.kinds);

  async function review(outcome: "CLEARED" | "FINDING", note: string) {
    setBusy(true); setError(null);
    try { setD(await api<Declaration>(`/compliance/affiliations/declarations/${d.id}/review`, json("POST", { outcome, note: note || null }))); return true; }
    catch (e) { setError(e); return false; }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" className="cc-secondary" onClick={onBack}>{copy.back}</button>
    <section className="cc-section" aria-labelledby="declaration-title" style={{ marginTop: 16 }}>
      <div className="cc-section-head">
        <h2 id="declaration-title" ref={heading} tabIndex={-1}>{fillTemplate(t.detailTitle, { consultant: `⁨${d.consultantName ?? ""}⁩` })}</h2>
        <StatusBadge tone={REVIEW_TONE[d.reviewStatus ?? ""] ?? "neutral"}>{word(copy.reviewStatus, d.reviewStatus)}</StatusBadge>
      </div>
      <p className="cc-meta">{fillTemplate(t.filed, { date: day(d.declaredAt) })} · {d.current ? fillTemplate(t.holdsUntil, { date: day(d.validUntil) }) : d.supersededAt ? fillTemplate(t.replaced, { date: day(d.supersededAt) }) : ""}</p>
      <h3 className="cc-subhead">{t.facilities}</h3>
      {facilities.length === 0 ? <p>{t.usesNone}</p> : <ul className="cc-list">
        {facilities.map((f) => <li key={f.facilityId} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          <span><strong><bdi>{f.name}</bdi></strong><span className="cc-row-sub">{f.kinds.join(" · ")}</span>
            {f.note && <span className="cc-row-sub" dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.note}</span>}</span>
        </li>)}
      </ul>}
      {d.reviewStatus !== "PENDING" && d.reviewedAt && <>
        <h3 className="cc-subhead">{t.reviewTitle}</h3>
        <p><strong>{word(copy.reviewStatus, d.reviewStatus)}</strong> <span className="cc-row-sub">{fillTemplate(t.reviewed, { date: day(d.reviewedAt) })}</span></p>
        {d.reviewNote && <p dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "70ch" }}>{d.reviewNote}</p>}
      </>}
      <p className="cc-meta">{t.eligibility}</p>
    </section>
    <ComplianceError error={error} locale={locale} copy={copy} />
    {canReview && d.reviewStatus === "PENDING" && <div className="cc-section">
      <ReviewForm title={t.reviewTitle} legend={t.outcomeLegend} outcomes={t.outcomes} finding="FINDING" noteLabel={t.noteLabel} noteHint={t.noteHint}
        chooseOutcome={t.chooseOutcome} noteRequired={t.noteRequired} submit={t.submit} busy={busy} onSubmit={review} />
    </div>}
  </>;
}

function groupLines(lines: Declaration["lines"], kinds: Record<string, string>) {
  const byFacility = new Map<string, { facilityId: string; name: string; kinds: string[]; note?: string | null }>();
  for (const line of lines) {
    const entry = byFacility.get(line.facilityId) ?? { facilityId: line.facilityId, name: line.facilityName ?? line.facilityId, kinds: [] };
    entry.kinds.push(kinds[line.kind] ?? line.kind);
    if (line.note) entry.note = line.note;
    byFacility.set(line.facilityId, entry);
  }
  return [...byFacility.values()];
}

// ---- Undeclared-facility flags ----

function Flags({ locale, copy, api, initialOpenOnly }: { locale: Locale; copy: ComplianceCopy; api: AdminApi; initialOpenOnly: boolean }) {
  const t = copy.flags;
  const [openOnly, setOpenOnlyState] = useState(initialOpenOnly);
  const setOpenOnly = (next: boolean) => { setOpenOnlyState(next); syncQuery({ flags: next ? null : "all" }); };
  const { data, error, reload } = useRead<AffiliationFlag[]>(api, `/compliance/affiliations/flags?openOnly=${openOnly}`);
  const day = useDates(locale);
  return <>
    <p className="cc-meta" style={{ maxWidth: "70ch" }}>{t.intro}</p>
    <div className="cc-filterbar">
      <label className="cc-choice"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />{t.openOnly}</label>
    </div>
    <ComplianceError error={error} locale={locale} copy={copy} action="load" onRetry={reload} />
    {!data ? (!error && <p role="status">{copy.loading}</p>) : !data.length ? <EmptyState title={t.empty} /> :
      <ul className="cc-list">
        <li className="cc-list-head" aria-hidden><span>{t.case}</span><span>{t.consultant}</span><span>{t.facility}</span><span /></li>
        {data.map((flag) => <li key={flag.id}>
          <span><strong dir="ltr">{flag.caseNumber}</strong><span className="cc-row-sub">{fillTemplate(t.raised, { date: day(flag.raisedAt) })}</span></span>
          <span><bdi>{flag.consultantName ?? "—"}</bdi></span>
          <span><bdi>{flag.facilityName ?? "—"}</bdi></span>
          <span>{flag.clearedAt ? <StatusBadge tone="success">{fillTemplate(t.cleared, { date: day(flag.clearedAt) })}</StatusBadge> : <StatusBadge tone="warning">{t.open}</StatusBadge>}</span>
        </li>)}
      </ul>}
  </>;
}

// ---- Scorecards ----

type Subject = "CONSULTANT" | "FACILITY";
type Option = { id: string; name: string };

function Scorecards({ locale, copy, api }: { locale: Locale; copy: ComplianceCopy; api: AdminApi }) {
  const t = copy.scorecards;
  const id = useId();
  const [subject, setSubject] = useState<Subject>("CONSULTANT");
  const [subjectId, setSubjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const consultants = useRead<{ id: string; displayName?: string }[]>(api, subject === "CONSULTANT" ? "/admin/practitioners" : null);
  const facilities = useRead<{ id: string; name: string; city?: string }[]>(api, subject === "FACILITY" ? "/admin/facilities" : null);
  const options: Option[] = subject === "CONSULTANT"
    ? (consultants.data ?? []).map((c) => ({ id: c.id, name: c.displayName ?? c.id }))
    : (facilities.data ?? []).map((f) => ({ id: f.id, name: f.city ? `${f.name} · ${f.city}` : f.name }));
  const { data, error, reload } = useRead<Scorecard>(api, query);

  function show(event: FormEvent) {
    event.preventDefault();
    if (!subjectId) return;
    const params = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
    setQuery(`/compliance/scorecards/${subject === "CONSULTANT" ? "consultants" : "facilities"}/${subjectId}${params.toString() ? `?${params}` : ""}`);
  }

  return <>
    <p className="cc-meta" style={{ maxWidth: "70ch" }}>{t.intro}</p>
    <form onSubmit={show} className="cc-section" aria-label={t.show}>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 8px" }}>
        <legend className="cc-field-label">{t.subject}</legend>
        <div className="cc-filterbar" style={{ marginBottom: 0 }}>
          {(["CONSULTANT", "FACILITY"] as const).map((s) => <label key={s} className="cc-choice">
            <input type="radio" name={`${id}-subject`} checked={subject === s} onChange={() => { setSubject(s); setSubjectId(""); }} />{t.subjects[s]}
          </label>)}
        </div>
      </fieldset>
      <div className="cc-filterbar">
        <label>{subject === "CONSULTANT" ? t.consultant : t.facility}
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            <option value="">{t.choose}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label>{t.from}<input type="date" dir="ltr" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-describedby={`${id}-period`} /></label>
        <label>{t.to}<input type="date" dir="ltr" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-describedby={`${id}-period`} /></label>
        <button type="submit" disabled={!subjectId}>{t.show}</button>
      </div>
      <p id={`${id}-period`} className="cc-meta">{t.periodHint}</p>
      <ErrorNotice error={consultants.error ?? facilities.error} locale={locale} action="load" />
    </form>
    <ComplianceError error={error} locale={locale} copy={copy} action="load" onRetry={reload} />
    {!query ? <p className="cc-meta">{t.pick}</p> : !data ? (!error && <p role="status">{copy.loading}</p>) : <ScorecardSheet locale={locale} copy={copy} card={data} />}
  </>;
}

export function ScorecardSheet({ locale, copy, card }: { locale: Locale; copy: ComplianceCopy; card: Scorecard }) {
  const t = copy.scorecards;
  const f = t.facts;
  const n = new Intl.NumberFormat(intlLocale(locale));
  const pct = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 });
  const egp = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "EGP", maximumFractionDigits: 0 });
  const day = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" });
  const ld = (iso: string) => day.format(new Date(`${iso}T12:00:00`));
  const num = (value: number) => <bdi dir="ltr">{n.format(value)}</bdi>;
  const ratio = (value?: number | null) => (value === null || value === undefined ? "—" : <bdi dir="ltr">{pct.format(value)}</bdi>);
  const group = (title: string, items: [string, ReactNode][]) => <section aria-label={title} style={{ marginTop: 20 }}>
    <h4 className="cc-subhead">{title}</h4><Facts items={items} />
  </section>;
  return <section className="cc-section" aria-labelledby="scorecard-title">
    <div className="cc-section-head"><h3 id="scorecard-title" style={{ margin: 0, fontSize: 18 }}>{fillTemplate(t.heading, { name: `⁨${card.name}⁩`, from: ld(card.from), to: ld(card.to) })}</h3></div>
    <Facts items={[[t.cases, num(card.cases)]]} />
    {card.smallCohort && <p role="note" className="cc-notice cc-notice-warning" style={{ marginTop: 12 }}>{t.smallCohort}</p>}
    {group(t.groups.quotes, [[f.finalQuotesAccepted, num(card.quotes.finalQuotesAccepted)], [f.comparable, num(card.quotes.comparable)],
      [f.averageFinalToEstimateMaximum, ratio(card.quotes.averageFinalToEstimateMaximum)], [f.aboveEstimateMaximum, num(card.quotes.aboveEstimateMaximum)]])}
    {group(t.groups.changeOrders, [[f.casesWithChangeOrders, num(card.changeOrders.casesWithChangeOrders)], [f.changeOrders, num(card.changeOrders.changeOrders)], [f.emergency, num(card.changeOrders.emergency)]])}
    {group(t.groups.reconciliation, [[f.reconciled, num(card.reconciliation.reconciled)], [f.withVariance, num(card.reconciliation.withVariance)], [f.disputed, num(card.reconciliation.disputed)],
      [f.unapprovedExtraCases, num(card.reconciliation.unapprovedExtraCases)], [f.unapprovedExtraLines, num(card.reconciliation.unapprovedExtraLines)],
      [f.unapprovedExtrasEgp, <bdi key="egp" dir="ltr">{egp.format(card.reconciliation.unapprovedExtrasEgp)}</bdi>], [f.billingErrorLines, num(card.reconciliation.billingErrorLines)]])}
    {group(t.groups.safety, [[f.complicationsReported, num(card.safety.complicationsReported)], [f.adverseEventCases, num(card.safety.adverseEventCases)], [f.reopenedCases, num(card.safety.reopenedCases)],
      [f.patientConcerns, num(card.safety.patientConcerns)], [f.chargeDisputes, num(card.safety.chargeDisputes)]])}
    {group(t.groups.followUp, [[f.contactsHeld, num(card.followUp.contactsHeld)], [f.contactsMissed, num(card.followUp.contactsMissed)], [f.completionRate, ratio(card.followUp.completionRate)]])}
    {group(t.groups.agreement, [[f.undeclaredFacilityFlags, num(card.undeclaredFacilityFlags)],
      ...(card.packagesSuspended === null || card.packagesSuspended === undefined ? [] : [[f.packagesSuspended, card.packagesSuspended ? t.yes : t.no] as [string, ReactNode]]),
      [f.patientRating, card.patientRating === "NOT_COLLECTED" ? t.notCollected : card.patientRating]])}
    <section aria-label={t.groups.outcomes} style={{ marginTop: 20 }}>
      <h4 className="cc-subhead">{t.groups.outcomes}</h4>
      {card.outcomes.map((o) => <div key={o.point} style={{ marginTop: 12 }}>
        <p style={{ fontWeight: 650, margin: "0 0 6px" }}>{word(t.points, o.point)}</p>
        <Facts items={[[t.asked, num(o.asked)], [t.answered, num(o.answered)], [t.complications, num(o.complications)],
          ...(o.suppressed ? [] : [[t.pain, avg(o.averagePain)], [t.function, avg(o.averageFunction)], [t.satisfaction, avg(o.averageSatisfaction)]] as [string, ReactNode][])]} />
        {o.byRepresentative > 0 && <p className="cc-meta">{fillTemplate(t.byRepresentative, { count: n.format(o.byRepresentative) })}</p>}
        {o.suppressed && <p className="cc-meta">{t.suppressed}</p>}
      </div>)}
    </section>
  </section>;

  function avg(value?: number | null) {
    return value === null || value === undefined ? "—" : fillTemplate(t.outOf10, { value: new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(value) });
  }
}

// ---- Audit samples ----

function Samples({ locale, copy, api, canReview }: { locale: Locale; copy: ComplianceCopy; api: AdminApi; canReview: boolean }) {
  const t = copy.samples;
  const [open, setOpen] = useState<SampleView | string | null>(null);
  const { data, error, reload } = useRead<SampleSummary[]>(api, open ? null : "/compliance/audit-samples");
  const [month, setMonth] = useState(previousMonth);
  const [size, setSize] = useState("5");
  const [drawError, setDrawError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const day = useDates(locale);
  const n = new Intl.NumberFormat(intlLocale(locale));

  if (open) return <SampleDetail locale={locale} copy={copy} api={api} initial={typeof open === "string" ? null : open} sampleId={typeof open === "string" ? open : open.sample.id}
    canReview={canReview} onBack={() => { setOpen(null); reload(); }} />;

  async function draw(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setDrawError(null);
    try { setOpen(await api<SampleView>("/compliance/audit-samples", json("POST", { month, size: Number(size) }))); }
    catch (e) { setDrawError(e); }
    finally { setBusy(false); }
  }

  return <>
    <p className="cc-meta" style={{ maxWidth: "70ch" }}>{t.intro}</p>
    <ComplianceError error={error} locale={locale} copy={copy} action="load" onRetry={reload} />
    {!data ? (!error && <p role="status">{copy.loading}</p>) : !data.length ? <EmptyState title={t.empty} /> :
      <ul className="cc-list">
        {data.map((s) => <li key={s.id}>
          <span><strong dir="ltr">{s.month}</strong><span className="cc-row-sub">{word(t.kinds, s.kind)} · {fillTemplate(t.drawn, { date: day(s.drawnAt) })}</span></span>
          <span>{fillTemplate(t.summary, { cases: n.format(s.cases), candidates: n.format(s.candidates), pending: n.format(s.pending) })}</span>
          <span>{s.pending > 0 ? <StatusBadge tone="warning">{t.status.PENDING}</StatusBadge> : null}</span>
          <span><button type="button" className="cc-secondary" aria-label={fillTemplate(t.open, { month: s.month })} onClick={() => setOpen(s.id)}>{t.view}</button></span>
        </li>)}
      </ul>}
    {canReview && <form className="cc-section" onSubmit={(e) => void draw(e)} aria-labelledby="draw-title" style={{ marginTop: 24 }}>
      <h3 id="draw-title" className="cc-subhead">{t.drawTitle}</h3>
      <div className="cc-filterbar">
        <label>{t.month}<input type="month" dir="ltr" required value={month} onChange={(e) => setMonth(e.target.value)} aria-describedby="draw-hint" /></label>
        <label>{t.size}<input type="number" dir="ltr" required min={1} max={50} value={size} onChange={(e) => setSize(e.target.value)} aria-describedby="draw-hint" style={{ width: "7rem" }} /></label>
        <button type="submit" disabled={busy}>{t.draw}</button>
      </div>
      <p id="draw-hint" className="cc-meta">{t.drawHint}</p>
      <ComplianceError error={drawError} locale={locale} copy={copy} />
    </form>}
  </>;
}

/** The month before this one, as YYYY-MM: the usual month to sample. */
function previousMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function SampleDetail({ locale, copy, api, sampleId, initial, canReview, onBack }: {
  locale: Locale; copy: ComplianceCopy; api: AdminApi; sampleId: string; initial: SampleView | null; canReview: boolean; onBack: () => void;
}) {
  const t = copy.samples;
  const loaded = useRead<SampleView>(api, initial ? null : `/compliance/audit-samples/${sampleId}`);
  const [updated, setView] = useState<SampleView | null>(initial);
  const view = updated ?? loaded.data;
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [view?.sample.id]);
  const day = useDates(locale);
  const back = <button type="button" className="cc-secondary" onClick={onBack}>{copy.back}</button>;
  if (!view) return <>{back}<ComplianceError error={loaded.error} locale={locale} copy={copy} action="load" onRetry={loaded.reload} />{!loaded.error && <p role="status">{copy.loading}</p>}</>;

  async function review(caseId: string, outcome: "NO_FINDING" | "FINDING", note: string) {
    setBusy(true); setError(null);
    try { setView(await api<SampleView>(`/compliance/audit-samples/${sampleId}/cases/${caseId}/review`, json("POST", { outcome, note: note || null }))); setReviewing(null); return true; }
    catch (e) { setError(e); return false; }
    finally { setBusy(false); }
  }

  return <>
    {back}
    <section className="cc-section" aria-labelledby="sample-title" style={{ marginTop: 16 }}>
      <div className="cc-section-head">
        <div><h2 id="sample-title" ref={heading} tabIndex={-1}>{fillTemplate(t.detailTitle, { month: `⁦${view.sample.month}⁩` })}</h2>
          <p>{word(t.kinds, view.sample.kind)} · {fillTemplate(t.drawn, { date: day(view.sample.drawnAt) })}</p></div>
      </div>
      {view.cases.length === 0 && <p>{t.noCases}</p>}
      <ComplianceError error={error} locale={locale} copy={copy} />
      {view.cases.map((c) => <SampleCaseBlock key={c.caseId} locale={locale} copy={copy} item={c} day={day}
        review={canReview && c.reviewStatus === "PENDING" ? (reviewing === c.caseId
          ? <ReviewForm title={fillTemplate(t.reviewTitle, { caseNumber: c.caseNumber })} legend={t.outcomeLegend} outcomes={t.outcomes} finding="FINDING" noteLabel={t.noteLabel}
              noteHint={t.noteHint} chooseOutcome={t.chooseOutcome} noteRequired={t.noteRequired} submit={t.submit} busy={busy} onSubmit={(o, note) => review(c.caseId, o, note)} />
          : <button type="button" className="cc-secondary" onClick={() => setReviewing(c.caseId)}>{fillTemplate(t.reviewTitle, { caseNumber: c.caseNumber })}</button>) : null} />)}
    </section>
  </>;
}

/** One sampled case: who and where, the mismatches in words, the money record as amounts and references, and its review. */
function SampleCaseBlock({ locale, copy, item, day, review }: { locale: Locale; copy: ComplianceCopy; item: SampleCase; day: (iso?: string | null) => string; review: ReactNode }) {
  const t = copy.samples;
  const keys = t.recordKeys as Record<string, string>;
  const egp = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "EGP", maximumFractionDigits: 2 });
  const value = (key: string, raw: string) => key.endsWith("Egp") && raw !== "" && !Number.isNaN(Number(raw)) ? egp.format(Number(raw)) : raw;
  const record = Object.keys(keys).filter((key) => Object.hasOwn(item.record, key)).map((key) => [keys[key], <bdi key={key} dir="ltr">{value(key, item.record[key])}</bdi>] as [string, ReactNode]);
  return <article aria-labelledby={`case-${item.caseId}`} style={{ borderTop: "1px solid var(--cc-line)", paddingTop: 16, marginTop: 16 }}>
    <div className="cc-section-head" style={{ alignItems: "center" }}>
      <div><h3 id={`case-${item.caseId}`} style={{ margin: 0, fontSize: 16 }}><bdi dir="ltr">{item.caseNumber}</bdi></h3>
        <p>{item.closedAt ? fillTemplate(t.closed, { date: day(item.closedAt) }) : null}{item.consultantName ? <> · <bdi>{item.consultantName}</bdi></> : null}{item.facilityName ? <> · <bdi>{item.facilityName}</bdi></> : null}</p></div>
      <StatusBadge tone={REVIEW_TONE[item.reviewStatus] ?? "neutral"}>{word(t.status, item.reviewStatus)}</StatusBadge>
    </div>
    <h4 className="cc-subhead">{t.mismatches}</h4>
    {item.mismatches.length === 0 ? <p className="cc-meta">{t.noMismatches}</p>
      : <ul style={{ margin: "0 0 8px", paddingInlineStart: 20, listStyle: "disc" }}>{item.mismatches.map((m) => <li key={m}>{word(t.mismatchCodes, m)}</li>)}</ul>}
    <h4 className="cc-subhead">{t.record}</h4>
    {record.length ? <Facts items={record} /> : <p className="cc-meta">{t.notOnFile}</p>}
    {item.reviewStatus !== "PENDING" && item.reviewedAt && <p style={{ marginTop: 12 }}><strong>{word(t.status, item.reviewStatus)}</strong> <span className="cc-row-sub">{fillTemplate(t.reviewed, { date: day(item.reviewedAt) })}</span></p>}
    {item.findingNote && <p dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "70ch" }}>{item.findingNote}</p>}
    {item.incidentId && <p className="cc-meta">{t.incident}</p>}
    {review && <div style={{ marginTop: 12 }}>{review}</div>}
  </article>;
}
