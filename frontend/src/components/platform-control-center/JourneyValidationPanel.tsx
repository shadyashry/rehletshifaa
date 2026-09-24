"use client";

import type { Locale } from "@/lib/i18n";
import { issueMessage, journeyCopy } from "./journey-copy";
import type { JourneyGraph, JourneyIssue, JourneyValidation } from "./journey-types";

/**
 * Check: runs the backend validator and shows its findings in plain words, each linked to the step it concerns.
 * The rules live only in JourneyGraphValidator; this panel never re-checks anything itself.
 */
export function JourneyValidationPanel({
  locale, validation, graph, busy, disabled, blockedHint, onRun, onFocusIssue,
}: {
  locale: Locale; validation: JourneyValidation | null; graph?: JourneyGraph | null; busy: boolean; disabled: boolean; blockedHint?: string;
  onRun: () => void; onFocusIssue: (nodeKey: string | null) => void;
}) {
  const t = journeyCopy[locale];
  const label = (key: string | null) => (key ? graph?.nodes.find((n) => n.key === key)?.label ?? key : undefined);
  const issue = (i: JourneyIssue, index: number, warning: boolean) => {
    const step = label(i.nodeKey);
    return (
      <li className={"jd-issue" + (warning ? " jd-warning" : "")} key={index}>
        <div>{issueMessage(i, locale, step)}</div>
        {step && <div className="cc-meta">{t.issueIn}: <bdi>{step}</bdi></div>}
        {i.nodeKey && <button type="button" className="cc-secondary cc-small" onClick={() => onFocusIssue(i.nodeKey)}>{t.focusOnGraph}<span className="cc-sr">: {step}</span></button>}
        <div className="cc-row-sub">{t.issueCode}: <bdi dir="ltr">{i.code}</bdi></div>
      </li>
    );
  };
  return (
    <section aria-label={t.validation}>
      <p className="cc-meta">{t.checkIntro}</p>
      <div className="jd-toolbar">
        <button type="button" disabled={busy || disabled} onClick={onRun}>{t.runValidation}</button>
        {disabled && blockedHint && <span className="cc-meta">{blockedHint}</span>}
      </div>
      <div role="status" aria-live="polite">
        {validation && !validation.errors.length && <p className="cc-badge cc-ready">{t.validationClean}</p>}
        {validation && !!validation.errors.length && <p><strong>{t.issueSummary(validation.errors.length)}</strong></p>}
      </div>
      {validation && !!validation.errors.length && (
        <>
          <h3>{t.validationErrors} ({validation.errors.length})</h3>
          <ul className="jd-issue-list">{validation.errors.map((i, n) => issue(i, n, false))}</ul>
        </>
      )}
      {validation && !!validation.warnings.length && (
        <>
          <h3>{t.validationWarnings} ({validation.warnings.length})</h3>
          <ul className="jd-issue-list">{validation.warnings.map((i, n) => issue(i, n, true))}</ul>
        </>
      )}
    </section>
  );
}
