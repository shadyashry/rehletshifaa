"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { StatusBadge } from "./cc-ui";
import { journeyCopy, journeyStatusLabel } from "./journey-copy";
import type { Decision, JourneyCutoverStatus, JourneyVersion } from "./journey-types";
import type { JourneyDiffEntry } from "./journey-graph-utils";

/**
 * Approval & publishing — the backend lifecycle, step by step: Check (VALIDATED) → Test (simulation COMPLETED) →
 * Send for approval (PENDING_APPROVAL) → Publish by someone who did not edit the version (backend-enforced). Publishing and
 * retiring each state their real consequences and ask for their own reason. Production intake is a separate deployment
 * setting: this panel reads it (never changes it) and says that publishing does not turn it on.
 */
export function JourneyPublishPanel({
  locale, version, journeyName, versions, materialChanges, can, busy, reason, currentUser, intake, onLoadIntake, onSubmit, onReturnToDraft, onDecide,
}: {
  locale: Locale; version: JourneyVersion; journeyName: string; versions: JourneyVersion[]; materialChanges: JourneyDiffEntry[] | null; can: Decision[]; busy: boolean;
  reason: string; currentUser?: string; intake: JourneyCutoverStatus | "error" | null; onLoadIntake: () => void;
  onSubmit: () => void; onReturnToDraft: () => void; onDecide: (action: "publish" | "retire", reason: string) => Promise<boolean>;
}) {
  const t = journeyCopy[locale];
  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);
  const s = version.status;
  const checked = ["VALIDATED", "SIMULATED", "PENDING_APPROVAL", "PUBLISHED", "RETIRED"].includes(s);
  const tested = version.simulationSummary === "COMPLETED";
  const submitted = ["PENDING_APPROVAL", "PUBLISHED", "RETIRED"].includes(s);
  const isPublished = s === "PUBLISHED" || s === "RETIRED";
  const mayPublish = allowed(t.permission.publish) && allowed(t.permission.approve);
  const canPublishNow = s === "PENDING_APPROVAL" && tested && mayPublish;
  const [dialog, setDialog] = useState<"publish" | "retire" | null>(null);
  const [why, setWhy] = useState("");
  const replacement = versions.filter((v) => v.status === "PUBLISHED" && v.id !== version.id).sort((a, b) => b.number - a.number)[0];
  const open = (d: "publish" | "retire") => { setWhy(""); setDialog(d); if (d === "publish") onLoadIntake(); };
  const confirm = async () => { if (!dialog || !why.trim()) return; if (await onDecide(dialog, why.trim())) setDialog(null); };
  const step = (label: string, done: boolean, doneLabel: string = t.stepDone) => (
    <li><span>{label}</span><StatusBadge tone={done ? "success" : "neutral"}>{done ? doneLabel : t.stepWaiting}</StatusBadge></li>
  );
  const intakeLine = intake === null ? t.loading : intake === "error" ? t.intakeUnknown : intake.productionIntakeEnabled ? t.intakeOn : t.intakeOff;

  return (
    <section aria-labelledby="jd-publish-title">
      <h2 id="jd-publish-title" className="cc-subhead">{t.publishGovernance} <StatusBadge tone={s === "PUBLISHED" ? "success" : s === "PENDING_APPROVAL" ? "warning" : "neutral"}>{journeyStatusLabel(s, locale)}</StatusBadge></h2>
      <ol className="cc-journey-steps" aria-label={t.publishGovernance}>
        {step(`1. ${t.stepCheck}`, checked, t.stepPassed)}
        {step(`2. ${t.stepTest}`, tested || isPublished, t.stepPassed)}
        {step(`3. ${t.stepSubmit}`, submitted)}
        {step(`4. ${t.stepPublish}`, isPublished)}
      </ol>
      <p className="cc-meta">{t.makerChecker}{currentUser && currentUser === version.createdBy && !isPublished ? <> <strong>{t.makerCheckerYou}</strong></> : null}</p>
      {materialChanges && <p className="cc-meta">{t.publishMaterialChanges(materialChanges.length)}</p>}

      <div className="cc-toolbar">
        {s === "SIMULATED" && allowed(t.permission.submit) && <button type="button" disabled={busy || !reason.trim()} onClick={onSubmit}>{t.submit}</button>}
        {s === "PENDING_APPROVAL" && allowed(t.permission.editDraft) && <button type="button" className="cc-secondary" disabled={busy || !reason.trim()} onClick={onReturnToDraft}>{t.returnToDraft}</button>}
        {s === "PENDING_APPROVAL" && <button type="button" disabled={busy || !canPublishNow} onClick={() => open("publish")}>{t.publish}</button>}
        {s === "PUBLISHED" && allowed(t.permission.retire) && <button type="button" className="cc-secondary cc-danger-button" disabled={busy} onClick={() => open("retire")}>{t.retireVersion}…</button>}
      </div>
      {s === "SIMULATED" && allowed(t.permission.submit) && !reason.trim() && <p className="cc-meta">{t.reasonRequired}</p>}
      {s === "PENDING_APPROVAL" && !tested && <p className="cc-meta">{t.publishBlockedValidation}</p>}
      {s === "PENDING_APPROVAL" && tested && !mayPublish && <p className="cc-meta">{t.noPublishPermission}</p>}
      {(s === "DRAFT" || s === "VALIDATED") && <p className="cc-meta">{t.nextStep[s]}</p>}

      {dialog && (
        <FocusTrapDialog label={dialog === "publish" ? t.publishConfirmTitle : t.retireConfirmTitle} onClose={busy ? () => undefined : () => setDialog(null)}>
          <h2>{dialog === "publish" ? t.publishConfirmTitle : t.retireConfirmTitle}</h2>
          <ul className="cc-consequences">
            {dialog === "publish" ? <>
              <li>{t.publishBecomes(version.number, journeyName)}</li>
              <li>{t.publishNewCases}</li>
              <li><strong role="status">{intakeLine}</strong></li>
              <li>{t.publishKeepsCases}</li>
              <li>{t.publishRuntime}</li>
            </> : <>
              <li>{t.retireNoNewCases(version.number)}</li>
              <li>{replacement ? t.retireReplacement(replacement.number) : t.retireNoReplacement}</li>
              <li>{t.retireKeepsCases}</li>
              <li>{t.retireFinal}</li>
            </>}
          </ul>
          <label className="cc-field"><span className="cc-field-label">{dialog === "publish" ? t.publishReason : t.retireReason}</span><span className="cc-field-hint">{t.reasonNotStored}</span>
            <textarea maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          <div className="cc-form-actions">
            <button type="button" className={dialog === "retire" ? "cc-danger-button" : undefined} disabled={busy || !why.trim()} onClick={() => void confirm()}>{dialog === "publish" ? t.confirmPublish : t.retireConfirm}</button>
            <button type="button" className="cc-secondary" disabled={busy} onClick={() => setDialog(null)}>{t.cancel}</button>
          </div>
        </FocusTrapDialog>
      )}
    </section>
  );
}
