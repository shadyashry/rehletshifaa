"use client";

import type { Locale } from "@/lib/i18n";
import { factLabel, journeyCopy, simulationOutcomeLabel } from "./journey-copy";
import type { JourneyRegistryMetadata, JourneySimulation } from "./journey-types";

export function JourneySimulationPanel({
  locale, registryMeta, facts, simulation, busy, disabled, onChangeFacts, onRun,
}: {
  locale: Locale; registryMeta: JourneyRegistryMetadata | null; facts: Record<string, boolean>;
  simulation: JourneySimulation | null; busy: boolean; disabled: boolean;
  onChangeFacts: (facts: Record<string, boolean>) => void; onRun: () => void;
}) {
  const t = journeyCopy[locale];
  return (
    <section aria-label={t.simulation}>
      <p className="cc-meta">{t.simulationSideEffectFree}</p>
      <h3>{t.simulationFacts}</h3>
      <ul className="jd-list">
        {(registryMeta?.conditionFacts ?? []).map((f) => (
          <li key={f}>
            <label>
              <input type="checkbox" checked={!!facts[f]} onChange={(e) => onChangeFacts({ ...facts, [f]: e.target.checked })} />
              {" "}{factLabel(f, locale)}
            </label>
          </li>
        ))}
      </ul>
      <div className="jd-toolbar">
        <button type="button" disabled={busy || disabled} onClick={onRun}>{t.runSimulation}</button>
      </div>
      {!simulation && <p className="cc-meta">{t.noSimulationYet}</p>}
      {simulation && (
        <>
          <p><span className="cc-badge">{t.simulationOutcome}: {simulationOutcomeLabel(simulation.outcome, locale)}</span></p>
          <h3>{t.simulationPath}</h3>
          <ol className="jd-sim-steps">
            {simulation.steps.map((s, i) => (
              <li key={i}>
                <span>{i + 1}. {s.label}{s.action ? ` — ${s.action}` : ""}</span>
                <span className="cc-meta">{s.actorType} · {s.state}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
