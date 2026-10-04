"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutList, Network } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { journeyCopy, journeyStatusLabel, stageTypeLabel } from "./journey-copy";
import type { JourneyCapability, JourneyCutoverStatus, JourneyDetail, JourneyGraph, JourneyRegistryMetadata, JourneySimulation, JourneyValidation, JourneyVersion } from "./journey-types";
import { JourneyGraphCanvas, STAGE_DRAG_TYPE } from "./JourneyGraphCanvas";
import { JourneyNodeInspector } from "./JourneyNodeInspector";
import { JourneyValidationPanel } from "./JourneyValidationPanel";
import { JourneySimulationPanel } from "./JourneySimulationPanel";
import { JourneyVersionDiffPanel } from "./JourneyVersionDiffPanel";
import { JourneyPublishPanel } from "./JourneyPublishPanel";
import { addNode, blankNode, computeJourneyDiff, computeLayout, nextKey } from "./journey-graph-utils";
import "./journey-designer.css";

type Tab = "designer" | "validation" | "simulation" | "diff" | "publish";

class ApiCodeError extends Error { code?: string; constructor(message: string, code?: string) { super(message); this.code = code; } }

export function JourneyDesigner({ locale, definitionId, versionId, initialTab }: { locale: Locale; definitionId: string; versionId: string; initialTab?: Tab }) {
  const t = journeyCopy[locale];
  const { user, me, loading: authLoading, signIn } = useAuth();

  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [savedGraph, setSavedGraph] = useState<JourneyGraph | null>(null);
  const [graph, setGraph] = useState<JourneyGraph | null>(null);
  const [registry, setRegistry] = useState<JourneyCapability[]>([]);
  const [registryMeta, setRegistryMeta] = useState<JourneyRegistryMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab ?? "designer");
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [validation, setValidation] = useState<JourneyValidation | null>(null);
  const [simulation, setSimulation] = useState<JourneySimulation | null>(null);
  const [simFacts, setSimFacts] = useState<Record<string, boolean>>({});
  const [compareId, setCompareId] = useState("");
  const [listMode, setListMode] = useState(false);

  const allowed = (key: string) => !!me?.permissions.includes(key);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/journeys" + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === REAUTHENTICATION_REQUIRED) { await requestReauthentication(signIn); throw new ApiCodeError(reauthenticationCopy[locale].required, data.code); }
      throw new ApiCodeError(data.message || (response.status === 403 ? t.denied : t.error), data.code);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn]);

  const version = detail?.versions.find((v) => v.id === versionId) ?? null;
  const editable = version ? ["DRAFT", "VALIDATED", "SIMULATED"].includes(version.status) : false;

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (!me) return; // wait for /api/v1/me before deciding what the caller may read
    setLoading(true); setError(""); setStale(false);
    try {
      if (me?.permissions.includes("JOURNEY_READ")) {
        const [d, reg, meta] = await Promise.all([
          api<JourneyDetail>("/" + definitionId),
          api<JourneyCapability[]>("/registry"),
          api<JourneyRegistryMetadata>("/registry/metadata"),
        ]);
        setDetail(d); setRegistry(reg); setRegistryMeta(meta);
        const v = d.versions.find((x) => x.id === versionId);
        if (v) { setSavedGraph(v.graph); setGraph(v.graph); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, me, t.error, definitionId, versionId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const dirty = useMemo(() => JSON.stringify(graph) !== JSON.stringify(savedGraph), [graph, savedGraph]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); }
    catch (e) {
      if (e instanceof ApiCodeError && e.code === "STALE_JOURNEY") { setStale(true); setError(e.message); }
      else setError(e instanceof Error ? e.message : t.error);
    } finally { setBusy(false); }
  };

  const saveDraft = () => run(async () => {
    if (!version || !graph) return;
    const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId, "PUT", { revision: version.revision, reason, graph });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
    setSavedGraph(saved.graph); setGraph(saved.graph);
    setNotice(t.saved);
  });

  const runValidate = () => run(async () => {
    if (!version) return;
    const result = await api<{ version: JourneyVersion; result: JourneyValidation }>("/" + definitionId + "/versions/" + versionId + "/validate", "POST", { revision: version.revision, reason });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === result.version.id ? result.version : v)) } : d);
    setValidation(result.result);
    setTab("validation");
  });

  const runSimulate = () => run(async () => {
    if (!version) return;
    const result = await api<{ version: JourneyVersion; result: JourneySimulation }>("/" + definitionId + "/versions/" + versionId + "/simulate", "POST", { revision: version.revision, reason, facts: simFacts });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === result.version.id ? result.version : v)) } : d);
    setSimulation(result.result);
  });

  const submit = () => run(async () => {
    if (!version) return;
    const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId + "/submit", "POST", { revision: version.revision, reason });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
    setNotice(t.submitted);
  });
  const returnToDraft = () => run(async () => {
    if (!version) return;
    const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId + "/return-to-draft", "POST", { revision: version.revision, reason });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
    setNotice(t.returned);
  });
  // Publish and retire ask for their own reason in their confirmation; both resolve true only when the backend accepted.
  const decide = async (action: "publish" | "retire", why: string) => {
    if (!version) return false;
    let ok = false;
    await run(async () => {
      const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId + "/" + action, "POST", { revision: version.revision, reason: why });
      setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
      setNotice(action === "publish" ? t.published : t.retiredDone); ok = true;
    });
    return ok;
  };
  const [intake, setIntake] = useState<JourneyCutoverStatus | "error" | null>(null);
  /** Production intake status for the publish confirmation (read-only; journey.view). Loaded when the dialog opens. */
  const loadIntake = async () => {
    if (intake || !user) return;
    try { const r = await apiFetchAs(user.access_token, "/admin/journey-cutover"); setIntake(r.ok ? await r.json() : "error"); } catch { setIntake("error"); }
  };

  const compareVersion = detail?.versions.find((v) => v.id === compareId) ?? null;
  const diff = useMemo(() => (version && compareVersion ? computeJourneyDiff(compareVersion.graph, version.graph) : null), [version, compareVersion]);

  const previousPublished = useMemo(() => {
    if (!detail || !version) return null;
    return detail.versions.filter((v) => v.status === "PUBLISHED" && v.number < version.number).sort((a, b) => b.number - a.number)[0] ?? null;
  }, [detail, version]);
  const materialChanges = useMemo(() => (version && previousPublished ? computeJourneyDiff(previousPublished.graph, version.graph) : null), [version, previousPublished]);

  const orderedNodeKeys = useMemo(() => (graph ? Object.entries(computeLayout(graph).positions).sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([k]) => k) : []), [graph]);

  // One primary action in the header. Check, Test and publishing live in their own tabs (no duplicate controls).
  const actions = editable && allowed(t.permission.editDraft) ? (
    <div className="jd-head-actions">
      <button type="button" disabled={busy || !dirty || !reason.trim()} onClick={() => void saveDraft()}>{t.saveDraft}</button>
    </div>
  ) : undefined;

  return (
    <ControlCenterShell
      locale={locale} active="journeys"
      crumbs={[{ label: detail?.definition.name ?? t.journey, href: `/${locale}/portal/control-center/journeys/${definitionId}` }, { label: version ? `${t.versionNumber} ${version.number}` : t.breadcrumbDesigner }]}
      title={detail?.definition.name ?? t.journey}
      intro={version ? `${t.versionNumber} ${version.number} · ${journeyStatusLabel(version.status, locale)}` : undefined}
      actions={actions}
    >
      {error && <p role="alert" className="cc-message">{error}</p>}
      {notice && <p role="status" className="cc-message">{notice}</p>}
      {stale && (
        <p role="alert" className="cc-message">{t.staleMessage} <button type="button" onClick={() => void refresh()}>{t.reload}</button></p>
      )}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && !allowed(t.permission.view) && <p>{t.denied}</p>}
      {!authLoading && user && !loading && detail && version && graph && allowed(t.permission.view) && (
        <>
          <div className="jd-head">
            <div className="jd-head-meta">
              {editable && <span className={dirty ? "jd-unsaved" : "jd-saved"} role="status">{dirty ? t.unsaved : t.saved}</span>}
              {!editable && <span className="cc-meta">{t.cloneToEdit}</span>}
            </div>
            {(editable || version.status === "PENDING_APPROVAL") && <div className="jd-field" style={{ minWidth: 260 }}>
              <label>{t.reason}<input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="jd-reason-hint" /></label>
              <span id="jd-reason-hint" className="cc-field-hint">{t.reasonHint}</span>
            </div>}
          </div>

          <div className="cc-tabs" role="tablist">
            {(["designer", "validation", "simulation", "diff", "publish"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
                {k === "designer" ? t.designer : k === "validation" ? t.validation : k === "simulation" ? t.testTitle : k === "diff" ? t.diff : t.publishGovernance}
              </button>
            ))}
          </div>

          {tab === "designer" && (
            <>
              <div className="jd-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setListMode((v) => !v)}>
                  {listMode ? <Network size={16} aria-hidden /> : <LayoutList size={16} aria-hidden />} {listMode ? t.switchToGraph : t.switchToList}
                </button>
              </div>
              <div className="jd-layout">
                <div className="jd-palette">
                  <h3>{t.palette}</h3>
                  {editable && allowed(t.permission.editDraft) ? (
                    <>
                      <p className="cc-meta">{t.paletteHint}</p>
                      <ul className="jd-palette-items" aria-label={t.palette}>
                        {(registryMeta?.stageTypes ?? []).filter((type) => type !== "START").map((type) => (
                          <li key={type}>
                            <button type="button" className="cc-secondary jd-palette-item" draggable
                              onDragStart={(e) => { e.dataTransfer.setData(STAGE_DRAG_TYPE, type); e.dataTransfer.effectAllowed = "copy"; }}
                              onClick={() => { const key = nextKey(type, graph.nodes.map((n) => n.key)); setGraph(addNode(graph, blankNode(key, type, stageTypeLabel(type, locale)))); setSelectedNodeKey(key); setSelectedEdgeKey(null); }}>
                              {stageTypeLabel(type, locale)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : <p className="cc-meta">{t.selectNode}</p>}
                </div>
                {listMode ? (
                  <div className="jd-canvas-wrap" style={{ height: "auto", padding: 12, overflow: "auto" }}>
                    <ol className="jd-list" aria-label={t.stageList}>
                      {orderedNodeKeys.map((key) => {
                        const n = graph.nodes.find((x) => x.key === key)!;
                        return (
                          <li key={key} className={selectedNodeKey === key ? "jd-selected" : ""}>
                            <button type="button" className="cc-secondary" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { setSelectedNodeKey(key); setSelectedEdgeKey(null); }}>
                              {n.label} — {stageTypeLabel(n.type, locale)}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : (
                  <div className="jd-canvas-wrap">
                    <JourneyGraphCanvas
                      locale={locale} graph={graph} selectedNodeKey={selectedNodeKey} selectedEdgeKey={selectedEdgeKey}
                      issues={validation?.errors ?? []} warnings={validation?.warnings ?? []} simVisited={simulation ? new Set(simulation.steps.map((s) => s.nodeKey)) : undefined}
                      simCurrent={simulation ? simulation.steps[simulation.steps.length - 1]?.nodeKey ?? null : null}
                      onSelectNode={(k) => { setSelectedNodeKey(k); if (k) setSelectedEdgeKey(null); }}
                      onSelectEdge={(k) => { setSelectedEdgeKey(k); if (k) setSelectedNodeKey(null); }}
                      editable={editable && allowed(t.permission.editDraft)} onChangeGraph={(g) => { setGraph(g); setNotice(""); }}
                      defaultFact={registryMeta?.conditionFacts[0]} onRefused={(r) => setNotice(t.connectRefused[r])}
                    />
                  </div>
                )}
                <JourneyNodeInspector
                  locale={locale} graph={graph} registry={registry} registryMeta={registryMeta}
                  selectedNodeKey={selectedNodeKey} selectedEdgeKey={selectedEdgeKey} disabled={!editable}
                  onChangeGraph={setGraph} onSelectNode={setSelectedNodeKey} onSelectEdge={setSelectedEdgeKey}
                />
              </div>
            </>
          )}

          {tab === "validation" && (
            <JourneyValidationPanel
              locale={locale} validation={validation} graph={graph} busy={busy} disabled={!editable || dirty || !reason.trim() || !allowed(t.permission.validate)}
              blockedHint={!editable ? t.cloneToEdit : dirty ? t.unsaved : !reason.trim() ? t.reasonRequired : undefined}
              onRun={() => void runValidate()} onFocusIssue={(k) => { setSelectedNodeKey(k); setSelectedEdgeKey(null); setTab("designer"); }}
            />
          )}

          {tab === "simulation" && (
            <JourneySimulationPanel
              locale={locale} registryMeta={registryMeta} facts={simFacts} simulation={simulation} busy={busy}
              disabled={!editable || dirty || !reason.trim() || !allowed(t.permission.simulate)}
              blockedHint={!editable ? t.cloneToEdit : dirty ? t.unsaved : !reason.trim() ? t.reasonRequired : undefined}
              onChangeFacts={setSimFacts} onRun={() => void runSimulate()}
            />
          )}

          {tab === "diff" && (
            <JourneyVersionDiffPanel locale={locale} versions={detail.versions} currentVersion={version} compareId={compareId} onChangeCompareId={setCompareId} diff={diff} />
          )}

          {tab === "publish" && (
            <JourneyPublishPanel
              locale={locale} version={version} journeyName={detail.definition.name} versions={detail.versions} materialChanges={materialChanges} permissions={me?.permissions ?? []} busy={busy}
              reason={reason} currentUser={user?.profile?.sub} intake={intake} onLoadIntake={() => void loadIntake()}
              onSubmit={() => void submit()} onReturnToDraft={() => void returnToDraft()} onDecide={decide}
            />
          )}

          <p className="cc-meta" style={{ marginTop: 20 }}>
            <Link href={`/${locale}/portal/control-center/journeys/${definitionId}`}>{t.backToVersions}</Link>
          </p>
        </>
      )}
    </ControlCenterShell>
  );
}
