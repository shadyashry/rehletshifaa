"use client";

import { useEffect, useState } from "react";
import { coordCopy, pathLabel } from "./coordination-copy";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { Locale } from "@/lib/i18n";
import type { Candidate, CaseFacts, CoordinationApi, CoordinationDecision, QueueItem, Team } from "./coordination-types";

function ManualAssignmentDialog({ locale, api, allowed, teams, caseId, onClose, onDone }: {
  locale: Locale; api: CoordinationApi; allowed: (k: string) => boolean; teams: Team[]; caseId: string; onClose: () => void; onDone: () => void;
}) {
  const t = coordCopy[locale];
  const [facts, setFacts] = useState<CaseFacts | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [target, setTarget] = useState("");
  const [team, setTeam] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [f, h] = await Promise.all([api(`/cases/${caseId}`) as Promise<CaseFacts>, api(`/cases/${caseId}/history`) as Promise<CoordinationDecision[]>]);
        if (live) { setFacts(f); setCandidates(h[0]?.candidates ?? []); }
      } catch (e) { if (live) setError(e instanceof Error ? e.message : t.caseNotFound); } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const eligible = candidates.filter((c) => c.exclusions.length === 0);
  const isReassign = !!facts?.owner;
  const targetCandidate = eligible.find((c) => c.subject === target);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!facts) return; setBusy(true); setError(""); setNotice("");
    try {
      const action = isReassign ? "REASSIGN" : "ASSIGN";
      await api(`/cases/${caseId}/commands`, "POST", { key: crypto.randomUUID(), revision: facts.revision, action, target, team: team || null, reason, source: "ADMIN_WEB" });
      onDone(); onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : t.error;
      setError(message.includes("changed") ? t.staleWarning : message.includes("not eligible") ? t.ineligibleTarget : message);
    } finally { setBusy(false); }
  };

  return (
    <FocusTrapDialog label={isReassign ? t.manualReassign : t.manualAssign} onClose={onClose}>
      <h2>{isReassign ? t.manualReassign : t.manualAssign}</h2>
      {loading && <p role="status">{t.loading}</p>}
      {error && <p role="alert" className="cc-message">{error}</p>}
      {notice && <p role="status" className="cc-message">{notice}</p>}
      {facts && (
        <>
          <p className="cc-meta">{t.currentMode}: {facts.mode === "LIVE" ? t.modeLive : t.modeShadow} · {t.currentRevision}: {facts.revision}</p>
          <p className="cc-meta" dir="ltr">{t.currentOwner}: {facts.owner ?? t.caseUnassigned}</p>
          <p className="cc-meta">{t.caseOwnerNote}</p>
          {!(allowed(isReassign ? "assignment.reassign" : "assignment.manual_assign")) ? <p className="cc-empty">{t.denied}</p> : (
            <form onSubmit={submit}>
              <label>{t.chooseTarget}
                <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">{t.chooseTarget}</option>
                  {eligible.map((c) => <option key={c.subject} value={c.subject}>{c.subject}</option>)}
                </select>
              </label>
              {!eligible.length && <p className="cc-empty">{t.noneEligible}</p>}
              <label>{t.chooseTeam}
                <select value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">{t.none}</option>
                  {(targetCandidate?.teams ?? []).map((id) => <option key={id} value={id}>{teams.find((x) => x.id === id)?.name ?? id}</option>)}
                </select>
              </label>
              <label>{t.reason}<textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={onClose}>{t.cancel}</button>
                <button disabled={busy || !target || !reason.trim()}>{isReassign ? t.confirmReassign : t.confirmAssign}</button>
              </div>
            </form>
          )}
        </>
      )}
    </FocusTrapDialog>
  );
}

export function AssignmentQueue({ locale, api, allowed, queue, teams, onChanged }: {
  locale: Locale; api: CoordinationApi; allowed: (k: string) => boolean; queue: QueueItem[]; teams: Team[]; onChanged: () => void; subject: string;
}) {
  const t = coordCopy[locale];
  const [dialogCase, setDialogCase] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [lookedUp, setLookedUp] = useState("");

  const teamName = (id: string | null) => teams.find((x) => x.id === id)?.name ?? (id ?? t.none);

  return (
    <section>
      <p className="cc-meta">{t.queueIntro}</p>
      {!queue.length ? <p className="cc-empty">{t.noQueue}</p> : (
        <ul className="cc-table">
          {queue.map((q) => (
            <li key={q.taskId}>
              <span dir="ltr">{q.caseId}</span>
              <span className="cc-meta">{teamName(q.team)} · {t.queueReason}: {q.reason ? pathLabel(q.reason, locale) : t.none}</span>
              <span className="cc-meta">{q.dueAt ? `${t.dueAt}: ${new Date(q.dueAt).toLocaleString(locale)}` : ""}</span>
              {allowed("assignment.manual_assign") && <button type="button" className="cc-secondary" onClick={() => setDialogCase(q.caseId)}>{t.manualAssign}</button>}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 24 }}>{t.lookupCase}</h3>
      <form className="cc-toolbar" onSubmit={(e) => { e.preventDefault(); setLookedUp(lookupId.trim()); }}>
        <label>{t.caseId}<input required dir="ltr" value={lookupId} onChange={(e) => setLookupId(e.target.value)} /></label>
        <button>{t.lookUp}</button>
      </form>
      {lookedUp && allowed("assignment.reassign") && (
        <button type="button" onClick={() => setDialogCase(lookedUp)}>{t.manualReassign}</button>
      )}

      {dialogCase && (
        <ManualAssignmentDialog locale={locale} api={api} allowed={allowed} teams={teams} caseId={dialogCase}
          onClose={() => setDialogCase(null)} onDone={onChanged} />
      )}
    </section>
  );
}
