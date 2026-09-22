"use client";

import type { Locale } from "@/lib/i18n";
import { journeyCopy } from "./journey-copy";
import type { JourneyValidation } from "./journey-types";

export function JourneyValidationPanel({
  locale, validation, busy, disabled, onRun, onFocusIssue,
}: {
  locale: Locale; validation: JourneyValidation | null; busy: boolean; disabled: boolean;
  onRun: () => void; onFocusIssue: (nodeKey: string | null) => void;
}) {
  const t = journeyCopy[locale];
  return (
    <section aria-label={t.validation}>
      <div className="jd-toolbar">
        <button type="button" disabled={busy || disabled} onClick={onRun}>{t.runValidation}</button>
      </div>
      {validation && (
        <>
          {!validation.errors.length && !validation.warnings.length && (
            <p className="cc-badge cc-ready">{t.validationClean}</p>
          )}
          {!validation.errors.length && !!validation.warnings.length && (
            <p className="cc-badge cc-ready">{t.validationCanPublish}</p>
          )}
          {!!validation.errors.length && (
            <>
              <h3>{t.validationErrors} ({validation.errors.length})</h3>
              <ul className="jd-issue-list">
                {validation.errors.map((issue, i) => (
                  <li className="jd-issue" key={i}>
                    <div><strong>{issue.code}</strong></div>
                    <div>{issue.message}</div>
                    {issue.nodeKey && <button type="button" className="cc-secondary" onClick={() => onFocusIssue(issue.nodeKey)}>{t.focusOnGraph}</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!!validation.warnings.length && (
            <>
              <h3>{t.validationWarnings} ({validation.warnings.length})</h3>
              <ul className="jd-issue-list">
                {validation.warnings.map((issue, i) => (
                  <li className="jd-issue jd-warning" key={i}>
                    <div><strong>{issue.code}</strong></div>
                    <div>{issue.message}</div>
                    {issue.nodeKey && <button type="button" className="cc-secondary" onClick={() => onFocusIssue(issue.nodeKey)}>{t.focusOnGraph}</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
