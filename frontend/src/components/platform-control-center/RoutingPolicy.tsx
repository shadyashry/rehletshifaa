"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { coordCopy } from "./coordination-copy";
import type { CoordinationApi, Policy, Team } from "./coordination-types";

export function RoutingPolicy({ locale, api, allowed, teams }: { locale: Locale; api: CoordinationApi; allowed: (k: string) => boolean; teams: Team[] }) {
  const t = coordCopy[locale];
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState({
    capacityWeight: "80", languageWeight: "20", requireOnDuty: true, mandatoryLanguage: false, queueHours: "24",
    providerTeam: "", defaultTeam: "", fallbackTeam: "", effectiveFrom: "",
  });

  const load = useCallback(async () => { setError(""); try { setPolicies(await api("/policies") as Policy[]); } catch (e) { setError(e instanceof Error ? e.message : t.error); } }, [api, t.error]);
  useEffect(() => { void load(); }, [load]);

  const current = policies[0] ?? null;
  const teamName = (id: string | null) => teams.find((x) => x.id === id)?.name ?? (id ? id : t.none);

  const openCreate = () => {
    if (current) setForm({ capacityWeight: String(current.configuration.capacityWeight), languageWeight: String(current.configuration.languageWeight), requireOnDuty: current.configuration.requireOnDuty, mandatoryLanguage: current.configuration.mandatoryLanguage, queueHours: String(current.configuration.queueHours), providerTeam: current.configuration.providerTeam ?? "", defaultTeam: current.configuration.defaultTeam ?? "", fallbackTeam: current.configuration.fallbackTeam ?? "", effectiveFrom: "" });
    setCreating(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const capacityWeight = Number(form.capacityWeight), languageWeight = Number(form.languageWeight);
      await api("/policies", "POST", {
        expectedVersion: current?.version ?? 0,
        from: new Date(form.effectiveFrom || Date.now()).toISOString(), to: null,
        configuration: { capacityWeight, languageWeight, requireOnDuty: form.requireOnDuty, mandatoryLanguage: form.mandatoryLanguage, providerTeam: form.providerTeam || null, careAreaTeams: current?.configuration.careAreaTeams ?? {}, defaultTeam: form.defaultTeam || null, fallbackTeam: form.fallbackTeam || null, queueHours: Number(form.queueHours) },
        reason: t.publishPolicy,
      });
      setCreating(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  return (
    <section>
      {error && <p role="alert" className="cc-message">{error}</p>}
      <p className="cc-meta">{t.policyIntro}</p>

      {!current ? <p className="cc-empty">{t.noPolicy}</p> : (
        <>
          <h3>{t.currentPolicy} · v{current.version}</h3>
          <p className="cc-meta">{new Date(current.effectiveFrom).toLocaleDateString(locale)}{current.effectiveTo ? ` – ${new Date(current.effectiveTo).toLocaleDateString(locale)}` : ""}</p>
          <h4>{t.waterfall}</h4>
          <ol className="cc-checklist">
            <li>{t.step1}</li>
            <li>{t.step2}</li>
            <li>{t.step3}</li>
            <li>{t.step4}</li>
            <li>{t.step5}</li>
          </ol>
          <p className="cc-meta">{t.capacityWeight}: {current.configuration.capacityWeight} · {t.languageWeight}: {current.configuration.languageWeight}</p>
          <p className="cc-meta">{t.requireOnDuty}: {current.configuration.requireOnDuty ? t.teamActive : t.teamInactive} · {t.mandatoryLanguage}: {current.configuration.mandatoryLanguage ? t.teamActive : t.teamInactive} · {t.queueHours}: {current.configuration.queueHours}</p>
          <p className="cc-meta">{t.providerTeam}: {teamName(current.configuration.providerTeam)} · {t.defaultTeam}: {teamName(current.configuration.fallbackTeam)}</p>
          <button type="button" className="cc-secondary" onClick={() => setAdvanced((v) => !v)}>{t.advanced}</button>
          {advanced && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5 }} dir="ltr">{JSON.stringify(current.configuration, null, 2)}</pre>}
        </>
      )}

      {allowed("assignment.policy.manage") && !creating && <button type="button" onClick={openCreate} style={{ marginTop: 14 }}>{t.publishPolicy}</button>}

      {creating && (
        <form className="cc-card" onSubmit={submit} style={{ margin: "16px 0" }} aria-label={t.publishPolicy}>
          <label>{t.effectiveFrom}<input required type="date" dir="ltr" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} /></label>
          <div className="cc-toolbar">
            <label>{t.capacityWeight}<input required type="number" min="0" max="100" dir="ltr" value={form.capacityWeight} onChange={(e) => setForm((f) => ({ ...f, capacityWeight: e.target.value }))} /></label>
            <label>{t.languageWeight}<input required type="number" min="0" max="100" dir="ltr" value={form.languageWeight} onChange={(e) => setForm((f) => ({ ...f, languageWeight: e.target.value }))} /></label>
          </div>
          <p className="cc-meta">{t.weightsNote}</p>
          <div className="cc-toolbar">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.requireOnDuty} onChange={(e) => setForm((f) => ({ ...f, requireOnDuty: e.target.checked }))} />{t.requireOnDuty}</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.mandatoryLanguage} onChange={(e) => setForm((f) => ({ ...f, mandatoryLanguage: e.target.checked }))} />{t.mandatoryLanguage}</label>
          </div>
          <label>{t.queueHours}<input required type="number" min="1" max="720" dir="ltr" value={form.queueHours} onChange={(e) => setForm((f) => ({ ...f, queueHours: e.target.value }))} /></label>
          <div className="cc-toolbar">
            <label>{t.providerTeam}<select value={form.providerTeam} onChange={(e) => setForm((f) => ({ ...f, providerTeam: e.target.value }))}><option value="">{t.none}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>{t.defaultTeam}<select value={form.defaultTeam} onChange={(e) => setForm((f) => ({ ...f, defaultTeam: e.target.value }))}><option value="">{t.none}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>{t.fallbackTeam}<select value={form.fallbackTeam} onChange={(e) => setForm((f) => ({ ...f, fallbackTeam: e.target.value }))}><option value="">{t.none}</option>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </div>
          <div className="cc-toolbar">
            <button type="button" className="cc-secondary" onClick={() => setCreating(false)}>{t.cancel}</button>
            <button disabled={busy || Number(form.capacityWeight) + Number(form.languageWeight) !== 100}>{t.save}</button>
          </div>
        </form>
      )}
    </section>
  );
}
