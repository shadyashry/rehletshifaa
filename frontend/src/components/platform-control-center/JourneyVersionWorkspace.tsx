"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, History as HistoryIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { journeyCopy, journeyStatusLabel } from "./journey-copy";
import type { Decision, JourneyDetail, JourneyHistoryEntry, JourneyReadiness, JourneyVersion } from "./journey-types";
import "./journey-designer.css";

function statusBadgeClass(status: string): string {
  if (status === "PUBLISHED") return "cc-badge cc-status-verified";
  if (status === "RETIRED") return "cc-badge cc-status-blocked";
  if (status === "PENDING_APPROVAL") return "cc-badge cc-status-needsaction";
  return "cc-badge";
}

export function JourneyVersionWorkspace({ locale, definitionId }: { locale: Locale; definitionId: string }) {
  const t = journeyCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [readiness, setReadiness] = useState<Record<string, JourneyReadiness | "error">>({});
  const [history, setHistory] = useState<JourneyHistoryEntry[] | null>(null);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cloning, setCloning] = useState<JourneyVersion | null>(null);
  const [reason, setReason] = useState("");

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/journeys" + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "REAUTHENTICATION_REQUIRED") { await signIn(true); throw new Error(t.denied); }
      throw new Error(data.message || (response.status === 403 ? t.denied : t.error));
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if ((decisions as Decision[]).some((d) => d.permission === "journey.view" && d.allowed)) {
        const d = await api<JourneyDetail>("/" + definitionId);
        setDetail(d);
        const entries = await Promise.all(d.versions.map(async (v) => {
          try { return [v.id, await api<JourneyReadiness>("/" + definitionId + "/versions/" + v.id + "/runtime")] as const; }
          catch { return [v.id, "error"] as const; }
        }));
        setReadiness(Object.fromEntries(entries));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error, definitionId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const loadHistory = async () => {
    setBusy(true); setError("");
    try { setHistory(await api<JourneyHistoryEntry[]>("/" + definitionId + "/history?offset=0")); }
    catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const submitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloning) return;
    await run(async () => {
      const created = await api<JourneyVersion>("/" + definitionId + "/versions/" + cloning.id + "/clone", "POST", { revision: cloning.revision, reason });
      setCloning(null); setReason("");
      window.location.href = `/${locale}/portal/control-center/journeys/${definitionId}/versions/${created.id}`;
    });
  };

  const versions = [...(detail?.versions ?? [])].sort((a, b) => b.number - a.number);
  const published = versions.find((v) => v.status === "PUBLISHED");
  const draft = versions.find((v) => v.status !== "PUBLISHED" && v.status !== "RETIRED");

  const actions = (
    <div className="cc-toolbar" style={{ margin: 0 }}>
      <button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.retry}</button>
    </div>
  );

  return (
    <ControlCenterShell locale={locale} active="journeys" crumbs={[{ label: locale === "ar" ? "مركز التحكم" : "Control Center", href: `/${locale}/portal/control-center` }, { label: t.breadcrumbJourneys, href: `/${locale}/portal/control-center/journeys` }, { label: detail?.definition.name ?? t.breadcrumbVersions }]} title={detail?.definition.name ?? t.versions} intro={t.intro} actions={actions}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {notice && <p role="status" className="cc-message">{notice}</p>}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && !allowed(t.permission.view) && <p>{t.denied}</p>}
      {!authLoading && user && !loading && detail && allowed(t.permission.view) && (
        <>
          <div className="cc-cards" style={{ marginBottom: 20, gridTemplateColumns: "1fr 1fr" }}>
            <div className="cc-card"><h3>{t.currentPublished}</h3>{published ? <p className="cc-meta">{t.versionNumber} {published.number} · {published.publishedAt && new Date(published.publishedAt).toLocaleString(locale)}</p> : <p className="cc-meta">{t.noPublished}</p>}</div>
            <div className="cc-card"><h3>{t.currentDraft}</h3>{draft ? <p className="cc-meta">{t.versionNumber} {draft.number} · {journeyStatusLabel(draft.status, locale)}</p> : <p className="cc-meta">{t.noDraft}</p>}</div>
          </div>

          {cloning && (
            <form className="cc-card" onSubmit={submitClone} style={{ marginBottom: 20 }} aria-label={t.cloneVersion}>
              <p className="cc-meta">{t.cloneVersion} — {t.versionNumber} {cloning.number}</p>
              <label>{t.reason}<textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setCloning(null)}>{t.cancel}</button>
                <button disabled={busy || !reason.trim()}>{t.cloneVersion}</button>
              </div>
            </form>
          )}

          <ul className="cc-table" aria-label={t.versions}>
            {!versions.length && <li className="cc-empty">{t.noVersions}</li>}
            {versions.map((v) => {
              const rt = readiness[v.id];
              const canEdit = v.status === "DRAFT" || v.status === "VALIDATED" || v.status === "SIMULATED";
              return (
                <li key={v.id}>
                  <div>
                    <strong>{t.versionNumber} {v.number}</strong>
                    <small>{v.createdBy}</small>
                  </div>
                  <span className={statusBadgeClass(v.status)}>{journeyStatusLabel(v.status, locale)}</span>
                  <span className="cc-meta">
                    {rt === "error" ? "—" : rt ? (rt.status === "DEPLOYED" ? <span className="cc-badge cc-ready">{t.deployed}</span> : <span className="cc-badge">{t.notDeployed}</span>) : "…"}
                  </span>
                  <div className="cc-step-actions">
                    <Link className="cc-secondary" style={{ display: "inline-flex" }} href={`/${locale}/portal/control-center/journeys/${definitionId}/versions/${v.id}`}>{canEdit ? t.openDesigner : t.openDesigner}</Link>
                    {(v.status === "PUBLISHED" || v.status === "RETIRED") && allowed(t.permission.create) && (
                      <button type="button" className="cc-secondary" onClick={() => setCloning(v)}>{t.cloneVersion}</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}><HistoryIcon size={14} aria-hidden style={{ verticalAlign: "middle" }} /> {t.history}</summary>
            {!history && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void loadHistory()} style={{ marginTop: 10 }}>{t.history}</button>}
            {history && (
              !history.length ? <p className="cc-empty">{t.historyEmpty}</p> : (
                <ul className="cc-table" aria-label={t.history}>
                  {history.map((h, i) => (
                    <li key={i}>
                      <div><strong>{h.action}</strong><small>{h.actor}</small></div>
                      <span className="cc-meta">{h.outcome}</span>
                      <span className="cc-meta">{h.reason ?? ""}</span>
                      <span className="cc-meta">{new Date(h.occurredAt).toLocaleString(locale)}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </details>
        </>
      )}
    </ControlCenterShell>
  );
}
