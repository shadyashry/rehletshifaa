"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { journeyCopy, journeyStatusLabel } from "./journey-copy";
import type { Decision, JourneyVersion } from "./journey-types";
import type { JourneyDiffEntry } from "./journey-graph-utils";

export function JourneyPublishPanel({
  locale, version, materialChanges, can, busy, reason, onSubmit, onReturnToDraft, onPublish, onRetire,
}: {
  locale: Locale; version: JourneyVersion; materialChanges: JourneyDiffEntry[] | null; can: Decision[]; busy: boolean;
  reason: string;
  onSubmit: () => void; onReturnToDraft: () => void; onPublish: () => void; onRetire: () => void;
}) {
  const t = journeyCopy[locale];
  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);
  const validationOk = version.status === "VALIDATED" || version.status === "SIMULATED" || version.status === "PENDING_APPROVAL" || version.status === "PUBLISHED";
  const simulationOk = version.simulationSummary === "COMPLETED";
  const canPublishNow = version.status === "PENDING_APPROVAL" && simulationOk && allowed(t.permission.publish) && allowed(t.permission.approve);
  const [confirmRetire, setConfirmRetire] = useState(false);

  return (
    <section aria-label={t.publishGovernance}>
      <p className="cc-badge">{journeyStatusLabel(version.status, locale)}</p>
      <ul className="jd-publish-checks">
        <li><span>{t.publishValidationState}</span><span className={"cc-badge " + (validationOk ? "cc-ready" : "cc-blocked")}>{validationOk ? "✓" : "…"}</span></li>
        <li><span>{t.publishSimulationState}</span><span className={"cc-badge " + (simulationOk ? "cc-ready" : "cc-blocked")}>{version.simulationSummary ?? "…"}</span></li>
      </ul>

      {materialChanges && (
        <>
          <h3>{t.publishMaterialChanges}</h3>
          <p className="cc-meta">{materialChanges.length}</p>
        </>
      )}

      <p className="cc-message">{t.publishImmutableWarning}</p>
      <p className="cc-message">{t.publishPinningWarning}</p>
      <p className="cc-meta">{t.runtimeDeploymentImplication}</p>

      <div className="cc-toolbar">
        {version.status === "SIMULATED" && allowed(t.permission.submit) && (
          <button type="button" disabled={busy || !reason.trim()} onClick={onSubmit}>{t.submit}</button>
        )}
        {version.status === "PENDING_APPROVAL" && allowed(t.permission.editDraft) && (
          <button type="button" className="cc-secondary" disabled={busy || !reason.trim()} onClick={onReturnToDraft}>{t.returnToDraft}</button>
        )}
        {version.status === "PENDING_APPROVAL" && (
          <button type="button" disabled={busy || !reason.trim() || !canPublishNow} onClick={onPublish} title={!simulationOk ? t.publishBlockedValidation : undefined}>{t.publish}</button>
        )}
        {version.status === "PUBLISHED" && allowed(t.permission.retire) && (
          <button type="button" className="cc-secondary cc-danger-button" disabled={busy || !reason.trim()} onClick={() => setConfirmRetire(true)}>{t.retireVersion}…</button>
        )}
      </div>
      {confirmRetire && version.status === "PUBLISHED" && (
        <div className="cc-card" role="group" aria-label={t.retireConfirmTitle}>
          <p><strong>{t.retireConfirmTitle}</strong></p>
          <p>{t.retireConfirmBody}</p>
          <div className="cc-toolbar"><button type="button" className="cc-danger-button" disabled={busy || !reason.trim()} onClick={() => { setConfirmRetire(false); onRetire(); }}>{t.retireConfirm}</button><button type="button" className="cc-secondary" onClick={() => setConfirmRetire(false)}>{t.cancel}</button></div>
        </div>
      )}
      {version.status === "PENDING_APPROVAL" && !simulationOk && <p className="cc-meta">{t.publishBlockedValidation}</p>}
    </section>
  );
}
