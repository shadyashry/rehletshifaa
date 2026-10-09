"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { StatusBadge } from "./cc-ui";
import { journeyCopy, journeyStatusLabel } from "./journey-copy";
import type { JourneyDetail, JourneySummary } from "./journey-types";
import "./journey-designer.css";

const when = (iso: string | null, locale: Locale) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "—");

/**
 * Care Journeys list: per journey what is published, what is being changed and whether anything needs review — from one
 * bounded read (`/admin/journeys/summaries`). No usage, performance or SLA figures: none exist.
 */
export function JourneyList({ locale }: { locale: Locale }) {
  const t = journeyCopy[locale];
  const { user, me, loading: authLoading, signIn } = useAuth();
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  // Loading is what is not known yet: nothing while signed out, /me first (it decides what may be read), then the page.
  const [fetching, setLoading] = useState(true);
  const canRead = !!me?.permissions.includes("JOURNEY_READ");
  const loading = !!user && (!me || (canRead && fetching));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const allowed = (key: string) => !!me?.permissions.includes(key);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/journeys" + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === REAUTHENTICATION_REQUIRED) { await requestReauthentication(signIn); throw new Error(reauthenticationCopy[locale].required); }
      throw new Error(data.message || (response.status === 403 ? t.denied : t.error));
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn, locale]);

  const load = useCallback(() => api<JourneySummary[]>("/summaries").then(setJourneys), [api]);
  const failed = useCallback((e: unknown) => { setJourneys([]); setError(e instanceof Error ? e.message : t.error); }, [t.error]);
  // Retry and after an action: a visible reload.
  const refresh = useCallback(async () => {
    if (!canRead) return;
    setLoading(true); setError("");
    try { await load(); } catch (e) { failed(e); } finally { setLoading(false); }
  }, [canRead, load, failed]);
  useEffect(() => {
    if (!user || !canRead) return;
    let live = true;
    load().catch((e) => { if (live) failed(e); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user, canRead, load, failed]);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const created = await api<JourneyDetail>("", "POST");
      setCreating(false);
      window.location.href = `/${locale}/portal/control-center/journeys/${created.definition.id}`;
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  // The backend supports exactly one care journey (create refuses a second), so creation is offered only before it exists.
  const canCreate = !loading && allowed(t.permission.create) && journeys.length === 0 && !error;
  const actions = canCreate && !creating ? <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t.newJourney}</button> : undefined;

  return (
    <ControlCenterShell locale={locale} active="journeys" title={t.title} intro={t.intro} actions={actions}>
      {error && <p role="alert" className="cc-message">{error} <button type="button" className="cc-secondary cc-small" onClick={() => void refresh()}>{t.retry}</button></p>}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && !allowed(t.permission.view) && <p>{t.denied}</p>}
      {!authLoading && user && !loading && allowed(t.permission.view) && (
        <>
          {creating && (
            <form className="cc-card" onSubmit={submitCreate} style={{ marginBottom: 20 }} aria-label={t.newJourney}>
              <p className="cc-meta">{t.createIntro}</p>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setCreating(false)}>{t.cancel}</button>
                <button disabled={busy}>{t.createJourney}</button>
              </div>
            </form>
          )}
          {!journeys.length ? (!error && <p className="cc-empty">{t.journeyListEmpty}</p>) : (
            <ul className="cc-cards" aria-label={t.journeyList}>
              {journeys.map((j) => {
                const attention = j.draftStatus ? t.attention[j.draftStatus] : undefined;
                return (
                  <li key={j.id} className="cc-card">
                    <Link className="cc-card-link" href={`/${locale}/portal/control-center/journeys/${j.id}`}>
                      <div>
                        <h3>{j.name || j.key}{attention && <> <StatusBadge tone="warning">{attention}</StatusBadge></>}</h3>
                        <dl className="cc-journey-facts">
                          <div><dt>{t.liveNow}</dt><dd>{j.liveVersion ? `${t.versionNumber} ${j.liveVersion} · ${t.publishedOn} ${when(j.livePublishedAt, locale)}` : t.noLive}</dd></div>
                          <div><dt>{t.changeInProgress}</dt><dd>{j.draftVersion && j.draftStatus ? `${t.versionNumber} ${j.draftVersion} · ${journeyStatusLabel(j.draftStatus, locale)}` : t.noChange}</dd></div>
                          <div><dt>{t.lastActivity}</dt><dd>{when(j.lastActivityAt ?? j.createdAt, locale)}</dd></div>
                        </dl>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </ControlCenterShell>
  );
}
