"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { useAuth } from "@/components/AuthProvider";
import type { Dictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import type { AdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, StatusBadge } from "./cc-ui";
import { WorkforcePage, json, useRead } from "./workforce-ui";

export type IncidentCopy = Dictionary["portalWork"]["safety"]["incidents"];
/** An incident as managers and Compliance read it (the summary and the resolution note are decrypted for them only). */
export type Incident = {
  id: string; caseId: string; caseNumber: string; type: string; severity: string; status: string; source: string; caseStage?: string | null;
  summary?: string | null; raisedAt: string; raisedByRole?: string | null; ownerSubject?: string | null; ownerAssignedAt?: string | null;
  resolution?: string | null; resolutionNote?: string | null; resolvedBy?: string | null; resolvedAt?: string | null; updatedAt?: string | null;
};
const STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED"] as const;
const TYPES = ["COMPLAINT", "DISPUTE", "ADVERSE_EVENT", "DEATH"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const RESOLUTIONS = ["NO_ACTION_NEEDED", "EXPLAINED_TO_PATIENT", "CORRECTIVE_ACTION", "REFERRED_TO_PROVIDER", "REFERRED_TO_AUTHORITY", "WITHDRAWN_BY_PATIENT"] as const;
type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const label = (map: Record<string, string>, code?: string | null) => (code ? map[code] ?? code : "—");

/**
 * Reviews & Safety › Incidents (P1-13, A-06). Care Coordination Managers (INCIDENT_MANAGE) work incidents here: take one, start
 * the review, change its severity, resolve it with a typed outcome and a note. Compliance (INCIDENT_READ only) reads the same list
 * and detail without a single control. Only the owner may review, re-grade or resolve; the backend enforces every rule.
 */
export function IncidentsPage({ locale, copy }: { locale: Locale; copy: IncidentCopy }) {
  return <WorkforcePage locale={locale} active="incidents" title={copy.title} intro={copy.intro} allowed={(a) => a.can("INCIDENT_READ")}>
    {({ access, api }) => <Incidents locale={locale} copy={copy} api={api} canManage={access.can("INCIDENT_MANAGE")} />}
  </WorkforcePage>;
}

export function Incidents({ locale, copy, api, canManage }: { locale: Locale; copy: IncidentCopy; api: AdminApi; canManage: boolean }) {
  const { user } = useAuth();
  const me = user?.profile?.sub;
  const [filters, setFilters] = useState({ status: "", type: "", mine: false });
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams({ ...(filters.status ? { status: filters.status } : {}), ...(filters.type ? { type: filters.type } : {}), ...(filters.mine ? { mine: "true" } : {}) });
  const { data, error, reload } = useRead<Incident[]>(api, `/incidents?${query}`);
  const date = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const owner = (incident: Incident) => !incident.ownerSubject ? copy.unowned : incident.ownerSubject === me ? copy.you : copy.otherManager;

  if (selected) return <IncidentDetail locale={locale} copy={copy} api={api} id={selected} me={me} canManage={canManage} owner={owner}
    onBack={() => { setSelected(null); reload(); }} />;

  return <>
    {!canManage && <p className="cc-meta">{copy.readOnly}</p>}
    <div className="cc-filterbar" role="search" aria-label={copy.filters.label}>
      <label>{copy.filters.status}
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">{copy.filters.any}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{copy.status[s]}</option>)}
        </select>
      </label>
      <label>{copy.filters.type}
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">{copy.filters.any}</option>
          {TYPES.map((s) => <option key={s} value={s}>{copy.types[s]}</option>)}
        </select>
      </label>
      {canManage && <label className="cc-choice"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} />{copy.filters.mine}</label>}
    </div>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />
    {!data ? (!error && <p role="status">{copy.loading}</p>) : !data.length ? <EmptyState title={copy.empty} /> :
      <ul className="cc-list">
        <li className="cc-list-head" aria-hidden><span>{copy.case}</span><span>{copy.severityLabel}</span><span>{copy.owner}</span><span /></li>
        {data.map((incident) => <li key={incident.id}>
          <span><strong dir="ltr">{incident.caseNumber}</strong><span className="cc-row-sub">{label(copy.types, incident.type)} · {date.format(new Date(incident.raisedAt))}</span></span>
          <span><StatusBadge tone={severityTone(incident.severity)}>{label(copy.severity, incident.severity)}</StatusBadge><span className="cc-row-sub">{label(copy.status, incident.status)}</span></span>
          <span className="cc-meta">{owner(incident)}</span>
          <span><button type="button" className="cc-secondary" aria-label={fillTemplate(copy.open, { caseNumber: incident.caseNumber })} onClick={() => setSelected(incident.id)}>{copy.view}</button></span>
        </li>)}
      </ul>}
  </>;
}

function IncidentDetail({ locale, copy, api, id, me, canManage, owner, onBack }: {
  locale: Locale; copy: IncidentCopy; api: AdminApi; id: string; me?: string; canManage: boolean; owner: (incident: Incident) => string; onBack: () => void;
}) {
  const formId = useId();
  const { data: loaded, error: loadError, reload } = useRead<Incident>(api, `/incidents/${id}`);
  // What an action answered replaces what was loaded; the severity draft starts from the incident until it is changed.
  const [updated, setIncident] = useState<Incident | null>(null);
  const incident = updated ?? loaded;
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [severityDraft, setSeverity] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [incident?.id]);
  const date = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);

  const back = <button type="button" className="cc-secondary" onClick={onBack}>{copy.back}</button>;
  if (!incident) return <>{back}<ErrorNotice error={loadError} locale={locale} action="load" onRetry={reload} />{!loadError && <p role="status">{copy.loading}</p>}</>;

  const severity = severityDraft ?? incident.severity;
  const mine = !!me && incident.ownerSubject === me;
  const open = incident.status !== "RESOLVED";
  async function act(path: string, body?: unknown) {
    setBusy(true); setError(null);
    try { setIncident(await api<Incident>(`/incidents/${id}/${path}`, json("POST", body ?? {}))); return true; }
    catch (e) { setError(e); return false; }
    finally { setBusy(false); }
  }
  async function resolve(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!resolution || !note.trim()) return;
    if (await act("resolve", { resolution, note: note.trim() })) { setNote(""); setTouched(false); }
  }

  return <>
    {back}
    <section className="cc-section" aria-labelledby={`${formId}-title`} style={{ marginTop: 16 }}>
      <div className="cc-section-head">
        <h2 id={`${formId}-title`} ref={heading} tabIndex={-1}>{fillTemplate(copy.detailTitle, { caseNumber: `⁨${incident.caseNumber}⁩` })}</h2>
        <StatusBadge tone={incident.status === "RESOLVED" ? "success" : incident.status === "UNDER_REVIEW" ? "info" : "warning"}>{label(copy.status, incident.status)}</StatusBadge>
      </div>
      <dl className="cc-facts">
        <div><dt>{copy.filters.type}</dt><dd>{label(copy.types, incident.type)}</dd></div>
        <div><dt>{copy.severityLabel}</dt><dd><StatusBadge tone={severityTone(incident.severity)}>{label(copy.severity, incident.severity)}</StatusBadge></dd></div>
        <div><dt>{copy.raisedBy}</dt><dd>{label(copy.source, incident.source)}</dd></div>
        <div><dt>{copy.raisedOn}</dt><dd>{date.format(new Date(incident.raisedAt))}</dd></div>
        {incident.caseStage && <div><dt>{copy.stage}</dt><dd dir="ltr">{incident.caseStage}</dd></div>}
        <div><dt>{copy.owner}</dt><dd>{owner(incident)}</dd></div>
      </dl>
      <h3 className="cc-subhead">{copy.reported}</h3>
      <p dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "70ch" }}>{incident.summary ?? "—"}</p>
      {incident.status === "RESOLVED" && <>
        <h3 className="cc-subhead">{copy.resolutionLabel}</h3>
        <p><strong>{label(copy.resolution, incident.resolution)}</strong>{incident.resolvedAt && <span className="cc-row-sub">{fillTemplate(copy.resolvedOn, { date: date.format(new Date(incident.resolvedAt)) })}</span>}</p>
        {incident.resolutionNote && <p dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "70ch" }}>{incident.resolutionNote}</p>}
      </>}
    </section>

    <ErrorNotice error={error} locale={locale} />
    {!canManage ? <p className="cc-meta">{copy.readOnly}</p> : open && (!mine
      ? <div className="cc-section">
          <p className="cc-meta">{copy.ownerOnly}</p>
          <div className="cc-form-actions"><button type="button" disabled={busy || !me} onClick={() => void act("assign", { ownerSubject: me })}>{copy.takeIt}</button></div>
        </div>
      : <div className="cc-section">
          {incident.status === "OPEN" && <div className="cc-form-actions"><button type="button" disabled={busy} onClick={() => void act("review")}>{copy.startReview}</button></div>}
          <div className="cc-filterbar" style={{ marginTop: 16 }}>
            <label>{copy.severityLabel}
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={incident.type === "DEATH"}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{copy.severity[s]}</option>)}
              </select>
            </label>
            <button type="button" className="cc-secondary" disabled={busy || severity === incident.severity} onClick={() => void act("severity", { severity })}>{copy.changeSeverity}</button>
          </div>
          <form onSubmit={(e) => void resolve(e)} noValidate aria-labelledby={`${formId}-resolve`}>
            <h3 id={`${formId}-resolve`} className="cc-subhead">{copy.resolveTitle}</h3>
            <label className={"cc-field" + (touched && !resolution ? " cc-field-invalid" : "")}>
              <span className="cc-field-label">{copy.resolutionLabel}<span className="cc-required" aria-hidden> *</span></span>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)} aria-invalid={touched && !resolution ? true : undefined}
                      aria-describedby={touched && !resolution ? `${formId}-resolution-error` : undefined}>
                <option value="" />
                {RESOLUTIONS.map((r) => <option key={r} value={r}>{copy.resolution[r]}</option>)}
              </select>
              {touched && !resolution && <span id={`${formId}-resolution-error`} className="cc-field-error">{copy.chooseResolution}</span>}
            </label>
            <label className={"cc-field" + (touched && !note.trim() ? " cc-field-invalid" : "")}>
              <span className="cc-field-label">{copy.noteLabel}<span className="cc-required" aria-hidden> *</span></span>
              <span className="cc-field-hint" id={`${formId}-note-hint`}>{copy.noteHelp}</span>
              <textarea rows={4} dir="auto" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={touched && !note.trim() ? true : undefined}
                        aria-describedby={`${formId}-note-hint${touched && !note.trim() ? ` ${formId}-note-error` : ""}`} />
              {touched && !note.trim() && <span id={`${formId}-note-error`} className="cc-field-error">{copy.writeNote}</span>}
            </label>
            <div className="cc-form-actions"><button type="submit" disabled={busy}>{copy.resolve}</button></div>
          </form>
        </div>)}
  </>;
}

function severityTone(severity: string): Tone {
  return severity === "CRITICAL" ? "danger" : severity === "HIGH" ? "warning" : severity === "MEDIUM" ? "info" : "neutral";
}
