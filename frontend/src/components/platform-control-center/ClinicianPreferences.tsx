"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorNotice, Field, Section, SuccessNotice } from "./cc-ui";
import { formatDate } from "./admin-labels";
import { coordCopy } from "./coordination-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { CoordinationContext } from "./CareCoordinationWorkspace";
import type { ConsultantRouting, Preference } from "./coordination-types";
import { earliestStart, plusYear, versionEnd, versionStart } from "./coordination-dates";


/**
 * Clinician Preferences: whom routing should try first for a clinician's cases. Only the fields the backend models —
 * a preferred coordinator, a preferred team and a fallback team — and only as preferences: eligibility always applies.
 * One read for the whole list (names and the preference in effect); history loads only when a preference is edited.
 */
export function ClinicianPreferences(ctx: CoordinationContext) {
  const { locale, api, base, can, personName, teamName } = ctx;
  const t = coordCopy[locale];
  const [rows, setRows] = useState<ConsultantRouting[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<ConsultantRouting | null>(null);
  const [notice, setNotice] = useState("");
  // One read per attempt; a retry or a saved change bumps the attempt.
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<ConsultantRouting[]>(`${base}/consultants`).then((next) => { if (live) { setRows(next); setError(null); } }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, base, attempt]);
  const manage = can("assignment.preference.manage");
  const [now] = useState(() => Date.now());

  return <Section id="clinician-preferences" title={t.sections.preferences} description={t.prefIntro}>
    <SuccessNotice>{notice}</SuccessNotice>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
    {rows === null ? (!error && <p role="status">{t.loading}</p>) : !rows.length ? <EmptyState title={t.noConsultants} /> : (
      <ul className="cc-cards">
        {rows.map((row) => {
          const p = row.current;
          const empty = !p || (!p.coordinator && !p.team && !p.fallbackTeam);
          const scheduled = row.latest && row.latest.id !== p?.id && new Date(row.latest.effectiveFrom).getTime() > now ? row.latest : null;
          return <li className="cc-card" key={row.consultantId}>
            <h3><bdi>{row.name ?? t.unnamed}</bdi></h3>
            {empty ? <p className="cc-meta">{t.prefNone}</p> : (
              <dl className="cc-facts">
                {p.coordinator && <div><dt>{t.prefCoordinator}</dt><dd><bdi>{personName(p.coordinator)}</bdi></dd></div>}
                {p.team && <div><dt>{t.prefTeam}</dt><dd><bdi>{teamName(p.team)}</bdi></dd></div>}
                {p.fallbackTeam && <div><dt>{t.prefFallback}</dt><dd><bdi>{teamName(p.fallbackTeam)}</bdi></dd></div>}
              </dl>
            )}
            {p?.effectiveTo && <p className="cc-meta">{t.prefUntil(formatDate(p.effectiveTo, locale))}</p>}
            {scheduled && <p className="cc-meta">{t.prefScheduled(formatDate(scheduled.effectiveFrom, locale))}</p>}
            {manage && <div className="cc-step-actions"><button type="button" className="cc-secondary" onClick={() => { setNotice(""); setEditing(row); }}>{t.editPreference}</button></div>}
          </li>;
        })}
      </ul>
    )}
    {editing && <PreferenceDialog ctx={ctx} row={editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); setNotice(t.done.preference); await load(); }} />}
  </Section>;
}

function PreferenceDialog({ ctx, row, onClose, onDone }: { ctx: CoordinationContext; row: ConsultantRouting; onClose: () => void; onDone: () => void }) {
  const { locale, api, base, people, teams, personName, teamName } = ctx;
  const t = coordCopy[locale];
  const latest = row.latest;
  // Versions cannot overlap: a new one starts when the latest ends (or today, if that has passed).
  const [earliest] = useState(() => earliestStart(latest?.effectiveTo));
  const [now] = useState(() => Date.now());
  const [coordinator, setCoordinator] = useState(row.current?.coordinator ?? "");
  const [team, setTeam] = useState(row.current?.team ?? "");
  const [fallback, setFallback] = useState(row.current?.fallbackTeam ?? "");
  const [from, setFrom] = useState(earliest);
  const [to, setTo] = useState(plusYear(earliest));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [history, setHistory] = useState<Preference[] | null>(null);
  const coordinators = people.filter((p) => p.account === "ACTIVE" && p.member);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`${base}/consultants/${row.consultantId}/preferences`, { method: "POST", body: { expectedVersion: latest?.version ?? 0, from: versionStart(from, latest?.effectiveTo), to: versionEnd(to), coordinator: coordinator || null, team: team || null, fallbackTeam: fallback || null, reason } });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const loadHistory = async () => { if (history) return; try { setHistory(await api<Preference[]>(`${base}/consultants/${row.consultantId}/preferences`)); } catch { setHistory([]); } };
  const title = t.preferenceFor(row.name ?? t.unnamed);
  return <FocusTrapDialog label={title} onClose={onClose}>
    <h2><bdi>{title}</bdi></h2>
    <p className="cc-meta">{t.prefIntro}</p>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={submit}>
      <Field label={t.prefCoordinator} optionalLabel={locale === "ar" ? "اختياري" : "optional"}><select value={coordinator} onChange={(e) => setCoordinator(e.target.value)}><option value="">{t.none}</option>{coordinators.map((p) => <option key={p.subject} value={p.subject}>{p.name ?? t.unnamed}</option>)}</select></Field>
      <Field label={t.prefTeam} optionalLabel={locale === "ar" ? "اختياري" : "optional"}><select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">{t.none}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label={t.prefFallback} optionalLabel={locale === "ar" ? "اختياري" : "optional"}><select value={fallback} onChange={(e) => setFallback(e.target.value)}><option value="">{t.none}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <p className="cc-meta">{t.versionedHint}{latest?.effectiveTo && new Date(latest.effectiveTo).getTime() > now ? ` ${t.nextStartsAfter(formatDate(latest.effectiveTo, locale))}` : ""}</p>
      <div className="cc-form-grid">
        <Field label={t.effectiveFrom} required><input type="date" required dir="ltr" min={earliest} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t.effectiveTo} required><input type="date" required dir="ltr" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Field label={t.reason} hint={t.reasonHint} required><textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <details className="cc-technical" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void loadHistory(); }}>
        <summary>{t.history}</summary>
        {history === null ? <p role="status">{t.loading}</p> : !history.length ? <p className="cc-meta">{t.noHistory}</p> : (
          <ol className="cc-checklist">{history.map((h) => <li key={h.id}><span>{formatDate(h.effectiveFrom, locale)} – {formatDate(h.effectiveTo, locale)}: {h.coordinator ? <bdi>{personName(h.coordinator)}</bdi> : h.team ? <bdi>{teamName(h.team)}</bdi> : t.prefNone}</span></li>)}</ol>
        )}
      </details>
      <div className="cc-form-actions"><button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button><button disabled={busy || !reason.trim() || to <= from}>{t.save}</button></div>
    </form>
  </FocusTrapDialog>;
}
