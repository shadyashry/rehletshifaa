"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { JourneyAdmissionPolicyPanel } from "./JourneyAdmissionPolicyPanel";
import { Section, StatusBadge } from "./cc-ui";
import type { Tone } from "./admin-labels";
import { historyActionLabel, journeyCopy, journeyStatusLabel } from "./journey-copy";
import type { JourneyCutoverStatus, JourneyDetail, JourneyHistoryEntry, JourneyReadiness, JourneyVersion } from "./journey-types";
import "./journey-designer.css";

const TONE: Record<string, Tone> = { PUBLISHED: "success", RETIRED: "neutral", PENDING_APPROVAL: "warning", SIMULATED: "info", VALIDATED: "info", DRAFT: "neutral" };
/** Governed actions that ask the person for a reason (J-1: stored with the action since V52; older entries have none). */
const REASONED = new Set(["JOURNEY_VERSION_CREATED", "JOURNEY_DRAFT_UPDATED", "JOURNEY_VALIDATED", "JOURNEY_SIMULATED", "JOURNEY_SUBMITTED", "JOURNEY_RETURNED", "JOURNEY_PUBLISHED", "JOURNEY_RETIRED"]);
const when = (iso: string | null | undefined, locale: Locale) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—");

/**
 * One Care Journey: what is published, what is being changed (and its next step), whether new patient cases use Care
 * Journeys at all (production intake, read-only), versions and history, and — only when opened — technical runtime detail.
 * Reads: capability read + journey detail + cutover status; runtime detail per version only inside Advanced.
 */
export function JourneyVersionWorkspace({ locale, definitionId }: { locale: Locale; definitionId: string }) {
  const t = journeyCopy[locale];
  const { user, me, loading: authLoading, signIn } = useAuth();
  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [intake, setIntake] = useState<JourneyCutoverStatus | "error" | null>(null);
  const [runtime, setRuntime] = useState<Record<string, JourneyReadiness | "error"> | null>(null);
  const [history, setHistory] = useState<JourneyHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cloning, setCloning] = useState<JourneyVersion | null>(null);
  const [reason, setReason] = useState("");

  const allowed = (key: string) => !!me?.permissions.includes(key);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === REAUTHENTICATION_REQUIRED) { await requestReauthentication(signIn); throw new Error(reauthenticationCopy[locale].required); }
      throw new Error(data.message || (response.status === 403 ? t.denied : t.error));
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn, locale]);
  const base = "/admin/journeys/" + definitionId;

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (!me) return; // wait for /api/v1/me before deciding what the caller may read
    setLoading(true); setError(""); setRuntime(null);
    try {
      if (me?.permissions.includes("JOURNEY_READ")) {
        const [d, cutover] = await Promise.all([api<JourneyDetail>(base), api<JourneyCutoverStatus>("/admin/journey-cutover").catch(() => "error" as const)]);
        setDetail(d); setIntake(cutover);
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, me, t.error, base]);
  useEffect(() => { void refresh(); }, [refresh]);

  const loadHistory = async () => {
    setBusy(true); setError("");
    try { setHistory(await api<JourneyHistoryEntry[]>(base + "/history?offset=0")); }
    catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };
  const loadRuntime = async (versions: JourneyVersion[]) => {
    setBusy(true);
    const entries = await Promise.all(versions.filter((v) => v.status === "PUBLISHED" || v.status === "RETIRED").map(async (v) => {
      try { return [v.id, await api<JourneyReadiness>(`${base}/versions/${v.id}/runtime`)] as const; } catch { return [v.id, "error"] as const; }
    }));
    setRuntime(Object.fromEntries(entries)); setBusy(false);
  };

  const submitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloning || !reason.trim()) return;
    setBusy(true); setError("");
    try {
      const created = await api<JourneyVersion>(`${base}/versions/${cloning.id}/clone`, "POST", { revision: cloning.revision, reason: reason.trim() });
      window.location.href = `/${locale}/portal/control-center/journeys/${definitionId}/versions/${created.id}`;
    } catch (err) { setError(err instanceof Error ? err.message : t.error); setBusy(false); }
  };

  const versions = [...(detail?.versions ?? [])].sort((a, b) => b.number - a.number);
  const published = versions.find((v) => v.status === "PUBLISHED");
  const draft = versions.find((v) => v.status !== "PUBLISHED" && v.status !== "RETIRED");
  const designerHref = (v: JourneyVersion) => `/${locale}/portal/control-center/journeys/${definitionId}/versions/${v.id}`;
  const copySource = !draft ? published ?? versions.find((v) => v.status === "RETIRED") : undefined;

  return (
    <ControlCenterShell locale={locale} active="journeys" crumbs={[{ label: detail?.definition.name ?? t.journey }]} title={detail?.definition.name ?? t.journey} intro={t.intro}
      actions={copySource && allowed(t.permission.create) && !loading ? <button type="button" onClick={() => { setCloning(copySource); setReason(""); }}>{t.cloneVersion}</button> : undefined}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && !allowed(t.permission.view) && <p>{t.denied}</p>}
      {!authLoading && user && !loading && detail && allowed(t.permission.view) && (
        <>
          <div className="cc-journey-overview">
            <section className="cc-card" aria-labelledby="journey-live">
              <h2 id="journey-live" className="cc-subhead" style={{ marginTop: 0 }}>{t.currentPublished}</h2>
              {published ? <><p><strong>{t.versionNumber} {published.number}</strong> <StatusBadge tone="success">{journeyStatusLabel("PUBLISHED", locale)}</StatusBadge></p>
                <p className="cc-meta">{t.publishedOn} {when(published.publishedAt, locale)}</p>
                <Link className="cc-secondary cc-small" href={designerHref(published)}>{t.viewVersion}</Link></> : <p className="cc-meta">{t.noPublished}</p>}
            </section>
            <section className="cc-card" aria-labelledby="journey-draft">
              <h2 id="journey-draft" className="cc-subhead" style={{ marginTop: 0 }}>{t.currentDraft}</h2>
              {draft ? <><p><strong>{t.versionNumber} {draft.number}</strong> <StatusBadge tone={TONE[draft.status] ?? "neutral"}>{journeyStatusLabel(draft.status, locale)}</StatusBadge></p>
                <p className="cc-meta">{t.nextStep[draft.status]}</p>
                <Link className="cc-primary cc-small" href={designerHref(draft) + (draft.status === "PENDING_APPROVAL" ? "?tab=publish" : "")}>{draft.status === "PENDING_APPROVAL" ? t.reviewDraft : t.openDraft}</Link></> : <p className="cc-meta">{t.noDraft}</p>}
            </section>
            <section className="cc-card" aria-labelledby="journey-intake">
              <h2 id="journey-intake" className="cc-subhead" style={{ marginTop: 0 }}>{t.intakeTitle}</h2>
              <p className="cc-meta" role="status">{intake === "error" || intake === null ? t.intakeUnknown : intake.productionIntakeEnabled ? t.intakeOn : t.intakeOff}</p>
            </section>
          </div>

          <JourneyAdmissionPolicyPanel locale={locale} definitionId={definitionId} versions={versions} permissions={me?.permissions ?? []} currentUser={user.profile.sub} api={api} onChanged={refresh} />

          <Section title={t.versions} id="journey-versions">
            <ul className="cc-journey-steps" aria-label={t.versions}>
              {!versions.length && <li className="cc-empty">{t.noVersions}</li>}
              {versions.map((v) => (
                <li key={v.id}>
                  <div>
                    <strong>{t.versionNumber} {v.number}</strong> <StatusBadge tone={TONE[v.status] ?? "neutral"}>{journeyStatusLabel(v.status, locale)}</StatusBadge>
                    <span className="cc-row-sub">{v.status === "RETIRED" ? `${t.retiredOn} ${when(v.retiredAt, locale)}` : v.publishedAt ? `${t.publishedOn} ${when(v.publishedAt, locale)}` : t.nextStep[v.status] ?? ""}</span>
                  </div>
                  <Link className="cc-secondary cc-small" href={designerHref(v) + (v.status === "PENDING_APPROVAL" ? "?tab=publish" : "")}>{v.status === "PENDING_APPROVAL" ? t.reviewDraft : v === draft ? t.openDraft : t.viewVersion}<span className="cc-sr"> — {t.versionNumber} {v.number}</span></Link>
                </li>
              ))}
            </ul>
            <details className="cc-technical" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !history) void loadHistory(); }}>
              <summary>{t.history}</summary>
              {!history ? <p role="status">{t.loading}</p> : !history.length ? <p className="cc-empty">{t.historyEmpty}</p> : (
                <ul className="cc-journey-steps" aria-label={t.history}>
                  {history.map((h, i) => {
                    const version = versions.find((v) => v.id === h.entity);
                    return (
                      <li key={i}>
                        <div><strong>{historyActionLabel(h.action, locale)}</strong>{version && <> · {t.versionNumber} {version.number}</>}{h.outcome !== "SUCCESS" && <> · <span className="cc-meta">{t.historyOutcome[h.outcome] ?? h.outcome}</span></>}</div>
                        <span className="cc-meta">{when(h.occurredAt, locale)}</span>
                        {REASONED.has(h.action) && <span className="cc-row-sub">{h.changeReason ? <>{t.historyReason}: <bdi>{h.changeReason}</bdi></> : t.reasonNotRecorded}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </Section>

          <details className="cc-technical" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !runtime) void loadRuntime(versions); }}>
            <summary>{t.advanced}</summary>
            <p className="cc-meta">{t.advancedIntro}</p>
            <dl>
              <div><dt>{t.journeyKey}</dt><dd><bdi dir="ltr">{detail.definition.key}</bdi></dd></div>
              <div><dt>{t.journeyId}</dt><dd><bdi dir="ltr">{detail.definition.id}</bdi></dd></div>
              {versions.map((v) => {
                const rt = runtime?.[v.id];
                return (
                  <div key={v.id}><dt>{t.versionNumber} {v.number}</dt><dd><bdi dir="ltr">
                    {v.status} · {t.versionId} {v.id} · {t.graphHash} {v.graphHash ?? "—"} · {t.createdBy} {v.createdBy}
                    {rt && rt !== "error" && <> · {t.runtimeStatus} {rt.status === "DEPLOYED" ? t.deployed : t.notDeployed}{rt.compilerVersion ? ` · ${t.compilerVersion} ${rt.compilerVersion}` : ""}{rt.artifactHash ? ` · ${t.artifactHash} ${rt.artifactHash}` : ""}</>}
                  </bdi></dd></div>
                );
              })}
            </dl>
            {history && <dl>{history.map((h, i) => <div key={i}><dt>{h.action} · {h.outcome}</dt><dd><bdi dir="ltr">{h.actor} · {h.reason ?? ""}</bdi></dd></div>)}</dl>}
          </details>

          {cloning && (
            <FocusTrapDialog label={t.cloneVersion} onClose={busy ? () => undefined : () => setCloning(null)}>
              <form onSubmit={submitClone}>
                <h2>{t.cloneVersion}</h2>
                <p>{t.cloneIntro(cloning.number)}</p>
                <label className="cc-field"><span className="cc-field-label">{t.copyReason}</span><span className="cc-field-hint">{t.reasonNotStored}</span>
                  <textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <div className="cc-form-actions"><button disabled={busy || !reason.trim()}>{t.cloneVersion}</button><button type="button" className="cc-secondary" onClick={() => setCloning(null)}>{t.cancel}</button></div>
              </form>
            </FocusTrapDialog>
          )}
        </>
      )}
    </ControlCenterShell>
  );
}
