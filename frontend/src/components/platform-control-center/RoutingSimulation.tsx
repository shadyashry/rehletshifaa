"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { coordCopy, exclusionLabel, pathLabel } from "./coordination-copy";
import type { CoordinationApi, SimulationResult } from "./coordination-types";

export function RoutingSimulation({ locale, api, allowed }: { locale: Locale; api: CoordinationApi; allowed: (k: string) => boolean }) {
  const t = coordCopy[locale];
  const [form, setForm] = useState({ consultantId: "", careArea: "", language: "", preferredCoordinator: "", preferredTeam: "" });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const r = await api("/simulate", "POST", {
        consultantId: form.consultantId || null, careArea: form.careArea || null, language: form.language || null,
        preferredCoordinator: form.preferredCoordinator || null, preferredTeam: form.preferredTeam || null,
      });
      setResult(r as SimulationResult);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  if (!allowed("assignment.simulate")) return <p className="cc-empty">{t.denied}</p>;

  const eligible = result?.candidates.filter((c) => c.exclusions.length === 0) ?? [];
  const excluded = result?.candidates.filter((c) => c.exclusions.length > 0) ?? [];

  return (
    <section>
      <p className="cc-meta">{t.simulationIntro}</p>
      {error && <p role="alert" className="cc-message">{error}</p>}
      <form className="cc-card" onSubmit={run} aria-label={t.runSimulation}>
        <div className="cc-toolbar">
          <label>{t.simConsultant}<input dir="ltr" value={form.consultantId} onChange={(e) => setForm((f) => ({ ...f, consultantId: e.target.value }))} /></label>
          <label>{t.simCareArea}<input dir="ltr" value={form.careArea} onChange={(e) => setForm((f) => ({ ...f, careArea: e.target.value }))} /></label>
          <label>{t.simLanguage}<input dir="ltr" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} /></label>
        </div>
        <div className="cc-toolbar">
          <label>{t.simPreferredCoordinator}<input dir="ltr" value={form.preferredCoordinator} onChange={(e) => setForm((f) => ({ ...f, preferredCoordinator: e.target.value }))} /></label>
          <label>{t.simPreferredTeam}<input dir="ltr" value={form.preferredTeam} onChange={(e) => setForm((f) => ({ ...f, preferredTeam: e.target.value }))} /></label>
        </div>
        <button disabled={busy}>{t.runSimulation}</button>
      </form>

      {result && (
        <section style={{ marginTop: 20 }}>
          <h3>{t.simResult}</h3>
          <p className="cc-meta">{locale === "ar" ? "السياسة" : "Policy"} v{result.policyVersion} · {result.algorithm}</p>
          <p>
            <span className={"cc-badge" + (result.selection.subject ? " cc-ready" : " cc-blocked")}>
              {result.selection.subject ? `${t.selectedCandidate}: ${result.selection.subject}` : t.noCandidateSelected}
            </span>
            {" "}<span className="cc-badge">{t.selectionPathLabel}: {pathLabel(result.selection.path, locale)}</span>
          </p>

          <h4>{t.eligibleCandidates}</h4>
          {!eligible.length ? <p className="cc-empty">{t.noneEligible}</p> : (
            <ul className="cc-table">
              {result.selection.scores.map((s) => (
                <li key={s.candidate.subject}>
                  <span dir="ltr">{s.candidate.subject}</span>
                  <span className="cc-meta">{t.scoreLabel}: {Number(s.score).toFixed(2)}</span>
                  <span className="cc-meta">{t.capacityFactor}: {Number(s.capacityFactor).toFixed(2)} · {t.languageFactor}: {s.candidate.languageMatch ? "✓" : "—"}</span>
                </li>
              ))}
            </ul>
          )}

          <h4>{t.excludedCandidates}</h4>
          {!excluded.length ? <p className="cc-empty">{t.none}</p> : (
            <ul className="cc-table">
              {excluded.map((c) => (
                <li key={c.subject}>
                  <span dir="ltr">{c.subject}</span>
                  <span className="cc-meta">{c.exclusions.map((x) => exclusionLabel(x, locale)).join(" · ")}</span>
                  <span />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
