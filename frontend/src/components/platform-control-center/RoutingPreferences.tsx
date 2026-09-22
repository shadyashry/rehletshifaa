"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { coordCopy } from "./coordination-copy";
import type { CoordinationApi, Preference, Team } from "./coordination-types";

/**
 * Reusable editor for one Consultant's routing preference (master-implementation-spec.md §9.14). Used
 * both as the Care Coordination "Routing preferences" tab (consultant looked up by id — Care Coordination
 * Managers typically hold no provider.view to browse a consultant picker) and, separately, linked from a
 * Consultant's own row in RoleManagement.tsx for provider.view holders who can already browse consultants.
 */
export function RoutingPreferenceEditor({ locale, consultantId, api, allowed, teams }: {
  locale: Locale; consultantId: string; api: CoordinationApi; allowed: (k: string) => boolean; teams: Team[];
}) {
  const t = coordCopy[locale];
  const [history, setHistory] = useState<Preference[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ mode: "inherit" as "inherit" | "coordinator" | "team", coordinator: "", team: "", fallbackTeam: "", effectiveFrom: "" });

  const load = useCallback(async () => {
    setError("");
    try { setHistory(await api(`/consultants/${consultantId}/preferences`) as Preference[]); }
    catch (e) { setError(e instanceof Error ? e.message : t.error); }
  }, [api, consultantId, t.error]);
  useEffect(() => { void load(); }, [load]);

  const current = history?.[0] ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/consultants/${consultantId}/preferences`, "POST", {
        expectedVersion: current?.version ?? 0,
        from: new Date(form.effectiveFrom || Date.now()).toISOString(),
        to: null,
        coordinator: form.mode === "coordinator" ? form.coordinator : null,
        team: form.mode === "coordinator" || form.mode === "team" ? (form.team || null) : null,
        fallbackTeam: form.fallbackTeam || null,
        reason: t.savePreference,
      });
      setForm({ mode: "inherit", coordinator: "", team: "", fallbackTeam: "", effectiveFrom: "" }); await load();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const teamName = (id: string | null) => teams.find((x) => x.id === id)?.name ?? id ?? t.none;

  return (
    <section>
      {error && <p role="alert" className="cc-message">{error}</p>}
      <p className="cc-meta">{t.preferenceNote}</p>
      <h3>{t.currentPreference}</h3>
      {!current || (!current.coordinator && !current.team) ? <p className="cc-empty">{t.noPreference}</p> : (
        <ul className="cc-checklist">
          {current.coordinator && <li><span dir="ltr">{t.preferredCoordinator}: {current.coordinator}</span></li>}
          {current.team && <li><span>{t.preferredTeam}: {teamName(current.team)}</span></li>}
          {current.fallbackTeam && <li><span>{t.fallbackTeam}: {teamName(current.fallbackTeam)}</span></li>}
        </ul>
      )}

      {allowed("assignment.preference.manage") && (
        <form className="cc-card" onSubmit={submit} style={{ marginTop: 14 }} aria-label={t.savePreference}>
          <label>{t.effectiveFrom}<input required type="date" dir="ltr" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></label>
          <label>{locale === "ar" ? "نوع التفضيل" : "Preference type"}
            <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as typeof f.mode }))}>
              <option value="inherit">{t.inheritDefault}</option>
              <option value="coordinator">{t.preferredCoordinator}</option>
              <option value="team">{t.preferredTeam}</option>
            </select>
          </label>
          {form.mode === "coordinator" && <label>{t.preferredCoordinator}<input required dir="ltr" value={form.coordinator} onChange={(e) => setForm((f) => ({ ...f, coordinator: e.target.value }))} /></label>}
          {(form.mode === "coordinator" || form.mode === "team") && (
            <label>{t.preferredTeam}
              <select required={form.mode === "team"} value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}>
                <option value="">{t.none}</option>
                {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
          )}
          <label>{t.fallbackTeam}
            <select value={form.fallbackTeam} onChange={(e) => setForm((f) => ({ ...f, fallbackTeam: e.target.value }))}>
              <option value="">{t.none}</option>
              {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <button disabled={busy}>{t.savePreference}</button>
        </form>
      )}

      <h3 style={{ marginTop: 20 }}>{t.preferenceHistory}</h3>
      {!history || history.length <= 1 ? <p className="cc-empty">{t.noPreferenceHistory}</p> : (
        <ul className="cc-table">
          {history.map((p) => (
            <li key={p.id}>
              <span>v{p.version}</span>
              <span dir="ltr">{p.coordinator ?? (p.team ? teamName(p.team) : t.none)}</span>
              <span className="cc-meta">{new Date(p.effectiveFrom).toLocaleDateString(locale)}{p.effectiveTo ? ` – ${new Date(p.effectiveTo).toLocaleDateString(locale)}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RoutingPreferences({ locale, api, allowed, teams }: { locale: Locale; orgId: string; api: CoordinationApi; allowed: (k: string) => boolean; teams: Team[] }) {
  const t = coordCopy[locale];
  const [consultantId, setConsultantId] = useState("");
  const [active, setActive] = useState("");

  return (
    <section>
      <p className="cc-meta">{t.choosePreferenceConsultant}</p>
      <form className="cc-toolbar" onSubmit={(e) => { e.preventDefault(); setActive(consultantId.trim()); }}>
        <label>{t.consultants} — ID<input required dir="ltr" value={consultantId} onChange={(e) => setConsultantId(e.target.value)} /></label>
        <button>{t.lookUp}</button>
      </form>
      {active && <RoutingPreferenceEditor locale={locale} consultantId={active} api={api} allowed={allowed} teams={teams} />}
    </section>
  );
}
