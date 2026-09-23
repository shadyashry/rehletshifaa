"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { journeyCopy } from "./journey-copy";
import type { Decision, JourneyDefinition, JourneyDetail } from "./journey-types";
import "./journey-designer.css";

export function JourneyList({ locale }: { locale: Locale }) {
  const t = journeyCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [journeys, setJourneys] = useState<JourneyDefinition[]>([]);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

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
  }, [user, t, signIn]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if ((decisions as Decision[]).some((d) => d.permission === "journey.view" && d.allowed)) {
        setJourneys(await api<JourneyDefinition[]>(""));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const created = await api<JourneyDetail>("", "POST");
      setCreating(false);
      await refresh();
      window.location.href = `/${locale}/portal/control-center/journeys/${created.definition.id}`;
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const actions = (
    <div className="cc-toolbar" style={{ margin: 0 }}>
      <button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.retry}</button>
      {allowed(t.permission.create) && <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t.newJourney}</button>}
    </div>
  );

  return (
    <ControlCenterShell locale={locale} active="journeys" crumbs={[{ label: locale === "ar" ? "مركز التحكم" : "Control Center", href: `/${locale}/portal/control-center` }, { label: t.breadcrumbJourneys }]} title={t.journeyList} intro={t.intro} actions={actions}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && !allowed(t.permission.view) && <p>{t.denied}</p>}
      {!authLoading && user && !loading && allowed(t.permission.view) && (
        <>
          {creating && (
            <form className="cc-card" onSubmit={submitCreate} style={{ marginBottom: 20 }} aria-label={t.newJourney}>
              <p className="cc-meta">{locale === "ar" ? "سيُنشئ هذا رحلة جديدة بمسودة فارغة يمكنك تسميتها وتصميمها بعد ذلك." : "This creates a new journey with an empty draft you can name and design next."}</p>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setCreating(false)}>{t.cancel}</button>
                <button disabled={busy}>{t.createJourney}</button>
              </div>
            </form>
          )}
          {!journeys.length ? (
            <p className="cc-empty">{t.journeyListEmpty}</p>
          ) : (
            <ul className="cc-cards">
              {journeys.map((j) => (
                <li key={j.id} className="cc-card">
                  <Link className="cc-card-link" href={`/${locale}/portal/control-center/journeys/${j.id}`}>
                    <div>
                      <h3>{j.name || j.key}</h3>
                      <p className="cc-meta">{t.journeyKey}: <bdi dir="ltr">{j.key}</bdi></p>
                      <p className="cc-meta">{t.createdAt}: {new Date(j.createdAt).toLocaleString(locale)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ControlCenterShell>
  );
}
