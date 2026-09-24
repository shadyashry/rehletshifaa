"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorNotice, Field, Section, StatusBadge, SuccessNotice } from "./cc-ui";
import { CARE_AREAS, careAreaLabel, formatDate } from "./admin-labels";
import { coordCopy, exclusionLabel, LANGUAGES, languageLabel, pathLabel } from "./coordination-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { CoordinationContext } from "./CareCoordinationWorkspace";
import type { CaseFacts, ConsultantRouting, CoordinationDecision, CoordinationOverview, DecisionEntry, Policy, QueueItem, SimulationResult } from "./coordination-types";

const when = (iso: string | null, locale: string) => (iso ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");

/**
 * Advanced: diagnostics for people who configure routing. Every block is separately capability-gated, and nothing
 * here is labelled Assign/Reassign/Transfer except the live-routing queue, whose command is authoritative.
 */
export function CoordinationAdvanced(ctx: CoordinationContext & { overview: CoordinationOverview | null }) {
  const { locale, can, overview } = ctx;
  const t = coordCopy[locale];
  return <>
    <p className="cc-meta">{t.advancedIntro}</p>
    {can("assignment.simulate") && <PreviewRouting {...ctx} />}
    {can("assignment.audit.view") && <DecisionHistory {...ctx} />}
    {can("assignment.queue.manage") && (overview?.liveQueue ?? 0) + (overview?.liveCases ?? 0) > 0 && <LiveRoutingQueue {...ctx} />}
    {can("assignment.policy.view") && <TechnicalConfiguration {...ctx} />}
  </>;
}

/** Preview routing recommendation — the engine's ephemeral simulation (`POST /simulate`): never saved, never assigns. */
function PreviewRouting(ctx: CoordinationContext) {
  const { locale, api, base, can, people, teams, personName, teamName } = ctx;
  const t = coordCopy[locale];
  const [clinicians, setClinicians] = useState<ConsultantRouting[]>([]);
  const [clinician, setClinician] = useState("");
  const [careArea, setCareArea] = useState("");
  const [language, setLanguage] = useState("");
  const [coordinator, setCoordinator] = useState("");
  const [team, setTeam] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (can("assignment.policy.view")) void api<ConsultantRouting[]>(`${base}/consultants`).then(setClinicians).catch(() => setClinicians([])); }, [api, base, can]);
  const run = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setResult(null);
    try {
      setResult(await api<SimulationResult>(`${base}/simulate`, { method: "POST", body: { consultantId: clinician || null, careArea: careArea || null, language: language || null, preferredCoordinator: coordinator || null, preferredTeam: team || null } }));
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const chosen = result?.selection.subject ?? null;
  const others = (result?.selection.scores ?? []).filter((s) => s.candidate.subject !== chosen);
  const excluded = (result?.candidates ?? []).filter((c) => c.exclusions.length > 0);
  const candidate = result?.candidates.find((c) => c.subject === chosen);
  return <Section id="routing-preview" title={t.previewTitle} description={t.previewIntro}>
    <p className="cc-notice cc-notice-info" role="note">{t.previewCopy}</p>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={run}>
      <div className="cc-form-grid">
        {clinicians.length > 0 && <Field label={t.previewClinician}><select value={clinician} onChange={(e) => setClinician(e.target.value)}><option value="">{t.previewAnyClinician}</option>{clinicians.map((c) => <option key={c.consultantId} value={c.consultantId}>{c.name ?? t.unnamed}</option>)}</select></Field>}
        <Field label={t.previewCareArea}><select value={careArea} onChange={(e) => setCareArea(e.target.value)}><option value="">{t.previewAny}</option>{CARE_AREAS.map((a) => <option key={a} value={a}>{careAreaLabel(a, locale)}</option>)}</select></Field>
        <Field label={t.previewLanguage}><select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">{t.previewAny}</option>{Object.keys(LANGUAGES).map((l) => <option key={l} value={l}>{languageLabel(l, locale)}</option>)}</select></Field>
      </div>
      <details className="cc-technical"><summary>{t.whatIf}</summary>
        <p className="cc-meta">{t.whatIfHint}</p>
        <div className="cc-form-grid">
          <Field label={t.whatIfCoordinator}><select value={coordinator} onChange={(e) => setCoordinator(e.target.value)}><option value="">{t.none}</option>{people.filter((p) => p.account === "ACTIVE").map((p) => <option key={p.subject} value={p.subject}>{p.name ?? t.unnamed}</option>)}</select></Field>
          <Field label={t.whatIfTeam}><select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">{t.none}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        </div>
      </details>
      <div className="cc-form-actions"><button disabled={busy}>{t.runPreview}</button></div>
    </form>
    <div aria-live="polite">
      {result && <section aria-label={t.recommended} className="cc-card cc-result">
        <p className="cc-meta">{t.previewCopy}</p>
        {chosen ? <>
          <h3>{t.recommended}: <bdi>{personName(chosen)}</bdi>{result.selection.team ? <> · <span className="cc-meta">{t.viaTeam(teamName(result.selection.team))}</span></> : null}</h3>
          <p><strong>{t.why}:</strong> {pathLabel(result.selection.path, locale)}{candidate ? <> · {t.caseloadLabel}: {candidate.workload}/{candidate.maximum} · {candidate.languageMatch ? t.languageMatch : t.noLanguageMatch}</> : null}</p>
        </> : <h3><StatusBadge tone="warning">{t.noRecommendation}</StatusBadge></h3>}
        {others.length > 0 && <><h4 className="cc-subhead">{t.otherCandidates}</h4><ul className="cc-checklist">{others.map((s) => <li key={s.candidate.subject}><span><bdi>{personName(s.candidate.subject)}</bdi> · {t.caseloadLabel}: {s.candidate.workload}/{s.candidate.maximum} · {s.candidate.languageMatch ? t.languageMatch : t.noLanguageMatch}</span></li>)}</ul></>}
        {excluded.length > 0 && <><h4 className="cc-subhead">{t.notEligible}</h4><ul className="cc-checklist">{excluded.map((c) => <li key={c.subject}><span><bdi>{personName(c.subject)}</bdi> — {c.exclusions.map((x) => exclusionLabel(x, locale)).join(" · ")}</span></li>)}</ul></>}
        <p className="cc-meta">{t.previewRules(result.policyVersion)}</p>
      </section>}
    </div>
  </Section>;
}

/** Routing decision history: recommendations (evaluation only) kept visually apart from decisions applied to a case. */
function DecisionHistory(ctx: CoordinationContext) {
  const { locale, api, base, teamName } = ctx;
  const t = coordCopy[locale];
  const [rows, setRows] = useState<DecisionEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<DecisionEntry[]>(`${base}/decisions?limit=50`).then((next) => { if (live) { setRows(next); setError(null); } }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, base, attempt]);
  const name = (n: string | null, subject: string | null) => (subject ? <bdi>{n ?? t.unnamed}</bdi> : t.nobody);
  const kind = (d: DecisionEntry) => d.mode === "SHADOW" ? t.entry.recommendation : d.path.startsWith("MANUAL_") ? (d.path === "MANUAL_QUEUE" ? t.entry.queued : t.entry.manual) : d.selectedOwner ? t.entry.automatic : t.entry.queued;
  return <Section id="routing-decisions" title={t.historyTitle} description={t.historyIntro}>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
    {rows === null ? (!error && <p role="status">{t.loading}</p>) : !rows.length ? <EmptyState title={t.historyEmpty} /> : (
      <ol className="cc-stepper">
        {rows.map((d) => <li className="cc-step" key={d.id}>
          <div className="cc-step-head">
            <h3>{kind(d)} · <bdi dir="ltr">{d.caseNumber}</bdi></h3>
            <StatusBadge tone={d.mode === "LIVE" ? "success" : "neutral"}>{d.mode === "LIVE" ? t.entry.applied : t.entry.evaluationOnly}</StatusBadge>
          </div>
          <p className="cc-meta"><time dateTime={d.evaluatedAt}>{when(d.evaluatedAt, locale)}</time>{d.actorName ? <> · {t.by} <bdi>{d.actorName}</bdi></> : null}</p>
          {d.mode === "SHADOW"
            ? <p>{t.recommendedPerson}: {name(d.selectedOwnerName, d.selectedOwner)}{d.team ? <> ({<bdi>{teamName(d.team)}</bdi>})</> : null} · {d.legacyMatches ? t.matched : t.differed}</p>
            : <p>{t.from}: {name(d.previousOwnerName, d.previousOwner)} → {t.to}: {name(d.selectedOwnerName, d.selectedOwner)}{d.team ? <> ({<bdi>{teamName(d.team)}</bdi>})</> : null}</p>}
          <p className="cc-meta">{t.why}: {pathLabel(d.path, locale)}</p>
          {d.reason && <p className="cc-meta">{t.reasonLabel}: {d.reason}</p>}
        </li>)}
      </ol>
    )}
  </Section>;
}

/**
 * Cases adopted into live routing that routing could not place. Only these cannot be handled in the Staff Portal (its
 * take/transfer is refused for live-routed cases), so the one authoritative command is offered here, with its effects.
 */
function LiveRoutingQueue(ctx: CoordinationContext) {
  const { locale, api, base, can, teamName } = ctx;
  const t = coordCopy[locale];
  const [rows, setRows] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [assigning, setAssigning] = useState<QueueItem | null>(null);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<QueueItem[]>(`${base}/queue`).then((next) => { if (live) { setRows(next); setError(null); } }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, base, attempt]);
  return <Section id="live-routing-queue" title={t.liveQueueTitle} description={t.liveQueueIntro}>
    <SuccessNotice>{notice}</SuccessNotice>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
    {rows === null ? (!error && <p role="status">{t.loading}</p>) : !rows.length ? <EmptyState title={t.liveQueueEmpty} /> : (
      <ul className="cc-cards">{rows.map((q) => <li className="cc-card" key={q.taskId}>
        <h3><bdi dir="ltr">{q.caseNumber}</bdi></h3>
        <p className="cc-meta">{q.team ? <bdi>{teamName(q.team)}</bdi> : null}{q.reason ? <> · {pathLabel(q.reason, locale)}</> : null}</p>
        <p className="cc-meta">{t.waitingSince}: {when(q.queuedAt, locale)} · {t.deadline}: {when(q.dueAt, locale)}</p>
        {can("assignment.manual_assign") && <div className="cc-step-actions"><button type="button" className="cc-secondary" onClick={() => { setNotice(""); setAssigning(q); }}>{t.assign}</button></div>}
      </li>)}</ul>
    )}
    {assigning && <AssignDialog ctx={ctx} item={assigning} onClose={() => setAssigning(null)} onDone={async () => { setAssigning(null); setNotice(t.assignDone); await load(); }} />}
  </Section>;
}

function AssignDialog({ ctx, item, onClose, onDone }: { ctx: CoordinationContext; item: QueueItem; onClose: () => void; onDone: () => void }) {
  const { locale, api, base, personName } = ctx;
  const t = coordCopy[locale];
  const [facts, setFacts] = useState<CaseFacts | null>(null);
  const [eligible, setEligible] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([api<CaseFacts>(`${base}/cases/${item.caseId}`), api<CoordinationDecision[]>(`${base}/cases/${item.caseId}/history`)])
      .then(([f, h]) => { if (live) { setFacts(f); setEligible((h[0]?.candidates ?? []).filter((c) => c.exclusions.length === 0).map((c) => c.subject)); } })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, base, item.caseId]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!facts) return; setBusy(true); setError(null);
    try {
      await api(`${base}/cases/${item.caseId}/commands`, { method: "POST", body: { key: crypto.randomUUID(), revision: facts.revision, action: facts.owner ? "REASSIGN" : "ASSIGN", target, team: null, reason, source: "ADMIN_WEB" } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = t.assignTitle(item.caseNumber);
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2><bdi>{title}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <ul className="cc-checklist"><li>{t.assignChanges}</li><li>{t.assignKeeps}</li></ul>
    {!facts ? (!error && <p role="status">{t.loading}</p>) : !eligible.length ? <><p className="cc-empty">{t.assignNone}</p><div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.close}</button></div></> : (
      <form onSubmit={submit}>
        <fieldset className="cc-choices"><legend className="cc-field-label">{t.assignEligible}</legend>
          {eligible.map((s) => <label key={s} className="cc-choice"><input type="radio" name="live-assignee" required checked={target === s} onChange={() => setTarget(s)} /><span><bdi>{personName(s)}</bdi></span></label>)}
        </fieldset>
        <Field label={t.reason} hint={t.reasonHint} required><textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !target || !reason.trim()}>{t.assignConfirm}</button></div>
      </form>
    )}
  </FocusTrapDialog>;
}

/** The stored configuration and internal identifiers, collapsed — for support, never primary content. */
function TechnicalConfiguration(ctx: CoordinationContext) {
  const { locale, api, base, orgId, teams } = ctx;
  const t = coordCopy[locale];
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const open = async () => { if (policies) return; try { setPolicies(await api<Policy[]>(`${base}/policies`)); } catch { setPolicies([]); } };
  return <Section id="routing-technical" title={t.technicalTitle} description={t.technicalIntro}>
    <details className="cc-technical" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void open(); }}>
      <summary>{t.technicalTitle}</summary>
      <pre dir="ltr" style={{ whiteSpace: "pre-wrap", fontSize: 12.5, overflowWrap: "anywhere" }}>{JSON.stringify({
        organizationId: orgId,
        teams: teams.map((x) => ({ id: x.id, name: x.name, revision: x.revision })),
        policies: (policies ?? []).map((p) => ({ id: p.id, version: p.version, effectiveFrom: formatDate(p.effectiveFrom, "en"), effectiveTo: formatDate(p.effectiveTo, "en"), configuration: p.configuration })),
      }, null, 2)}</pre>
    </details>
  </Section>;
}
