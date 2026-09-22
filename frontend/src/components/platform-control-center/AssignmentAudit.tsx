"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { coordCopy, pathLabel } from "./coordination-copy";
import type { CoordinationApi, CoordinationDecision, Team } from "./coordination-types";

export function AssignmentAudit({ locale, api, allowed, teams }: { locale: Locale; api: CoordinationApi; allowed: (k: string) => boolean; teams: Team[] }) {
  const t = coordCopy[locale];
  const [caseId, setCaseId] = useState("");
  const [history, setHistory] = useState<CoordinationDecision[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const teamName = (id: string | null) => teams.find((x) => x.id === id)?.name ?? (id ?? t.none);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setHistory(null);
    try { setHistory(await api(`/cases/${caseId.trim()}/history`) as CoordinationDecision[]); }
    catch (e) { setError(e instanceof Error ? e.message : t.caseNotFound); } finally { setBusy(false); }
  };

  if (!allowed("assignment.audit.view")) return <p className="cc-empty">{t.denied}</p>;

  return (
    <section>
      <p className="cc-meta">{t.auditIntro}</p>
      <form className="cc-toolbar" onSubmit={lookup}>
        <label>{t.caseId}<input required dir="ltr" value={caseId} onChange={(e) => setCaseId(e.target.value)} /></label>
        <button disabled={busy}>{t.lookUp}</button>
      </form>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {history && (!history.length ? <p className="cc-empty">{t.noHistory}</p> : (
        <ul className="cc-stepper">
          {history.map((d) => (
            <li className="cc-step" key={d.id}>
              <div className="cc-step-head">
                <h3>{pathLabel(d.path, locale)}</h3>
                <span className={"cc-badge" + (d.mode === "LIVE" ? " cc-ready" : "")}>{d.mode === "LIVE" ? t.modeLive : t.modeShadow}</span>
              </div>
              <p className="cc-meta">{t.decisionAt}: {new Date(d.evaluatedAt).toLocaleString(locale)} · {t.decisionSource}: {d.source}</p>
              <p className="cc-meta" dir="ltr">{t.previousOwner}: {d.previousOwner ?? t.caseUnassigned} → {t.selectedOwner}: {d.selectedOwner ?? t.caseUnassigned}{d.team ? ` (${teamName(d.team)})` : ""}</p>
              <p>{d.explanation}</p>
              {d.reason && <p className="cc-meta">{t.reason}: {d.reason}</p>}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
