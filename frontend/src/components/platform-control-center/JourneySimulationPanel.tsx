"use client";

import type { Locale } from "@/lib/i18n";
import { actorTypeLabel, factLabel, journeyCopy, simulationOutcomeLabel } from "./journey-copy";
import type { JourneyRegistryMetadata, JourneySimulation } from "./journey-types";

/** Test journey: the backend's side-effect-free simulation. Never publishes, never touches the live journey or real cases. */
export function JourneySimulationPanel({
  locale, registryMeta, facts, simulation, busy, disabled, blockedHint, onChangeFacts, onRun,
}: {
  locale: Locale; registryMeta: JourneyRegistryMetadata | null; facts: Record<string, boolean>;
  simulation: JourneySimulation | null; busy: boolean; disabled: boolean; blockedHint?: string;
  onChangeFacts: (facts: Record<string, boolean>) => void; onRun: () => void;
}) {
  const t = journeyCopy[locale];
  return (
    <section aria-labelledby="jd-test-title">
      <h2 id="jd-test-title" className="cc-subhead">{t.testTitle}</h2>
      <p className="cc-notice cc-notice-info" role="note">{t.simulationSideEffectFree}</p>
      <fieldset className="jd-list" style={{ border: 0, padding: 0 }}>
        <legend><strong>{t.simulationFacts}</strong></legend>
        {(registryMeta?.conditionFacts ?? []).map((f) => (
          <label key={f} style={{ display: "block" }}>
            <input type="checkbox" checked={!!facts[f]} onChange={(e) => onChangeFacts({ ...facts, [f]: e.target.checked })} />
            {" "}{factLabel(f, locale)}
          </label>
        ))}
      </fieldset>
      <div className="jd-toolbar">
        <button type="button" disabled={busy || disabled} onClick={onRun}>{t.runSimulation}</button>
        {disabled && blockedHint && <span className="cc-meta">{blockedHint}</span>}
      </div>
      <div role="status" aria-live="polite">
        {!simulation ? <p className="cc-meta">{t.noSimulationYet}</p> : <p><span className="cc-badge">{t.simulationOutcome}: {simulationOutcomeLabel(simulation.outcome, locale)}</span></p>}
      </div>
      {simulation && (
        <>
          <h3>{t.simulationPath}</h3>
          <ol className="jd-sim-steps">
            {simulation.steps.map((s, i) => (
              <li key={i}>
                <span>{i + 1}. <bdi>{s.label}</bdi></span>
                <span className="cc-meta">{actorTypeLabel(s.actorType, locale)} · {t.stepStates[s.state] ?? s.state.toLowerCase()}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
