"use client";

import type { Locale } from "@/lib/i18n";
import { journeyCopy, journeyStatusLabel } from "./journey-copy";
import type { JourneyVersion } from "./journey-types";
import type { JourneyDiffEntry } from "./journey-graph-utils";

export function JourneyVersionDiffPanel({
  locale, versions, currentVersion, compareId, onChangeCompareId, diff,
}: {
  locale: Locale; versions: JourneyVersion[]; currentVersion: JourneyVersion;
  compareId: string; onChangeCompareId: (id: string) => void; diff: JourneyDiffEntry[] | null;
}) {
  const t = journeyCopy[locale];
  const candidates = versions.filter((v) => v.id !== currentVersion.id);
  return (
    <section aria-label={t.diff}>
      <div className="jd-field">
        <label>{t.compareWith}
          <select value={compareId} onChange={(e) => onChangeCompareId(e.target.value)}>
            <option value="">—</option>
            {candidates.map((v) => <option key={v.id} value={v.id}>{t.versionNumber} {v.number} ({journeyStatusLabel(v.status, locale)})</option>)}
          </select>
        </label>
      </div>
      {!compareId && <p className="cc-meta">{t.selectCompareVersion}</p>}
      {compareId && diff && (
        !diff.length ? <p className="cc-meta">{t.diffNoChanges}</p> : (
          <ul className="jd-diff-list">
            {diff.map((e, i) => (
              <li key={i} className={e.kind === "added" ? "jd-diff-added" : e.kind === "removed" ? "jd-diff-removed" : "jd-diff-changed"}>
                <strong>{e.subject === "node" ? (e.kind === "added" ? t.diffStageAdded : e.kind === "removed" ? t.diffStageRemoved : t.diffChanged) : (e.kind === "added" ? t.diffTransitionAdded : e.kind === "removed" ? t.diffTransitionRemoved : t.diffChanged)}</strong>
                {" — "}{e.key}: {e.messages.join(", ")}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
