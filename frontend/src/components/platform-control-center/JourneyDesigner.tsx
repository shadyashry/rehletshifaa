"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutList, Network, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { journeyCopy, journeyStatusLabel, stageTypeLabel } from "./journey-copy";
import type { Decision, JourneyCapability, JourneyDetail, JourneyGraph, JourneyReadiness, JourneyRegistryMetadata, JourneySimulation, JourneyValidation, JourneyVersion } from "./journey-types";
import { JourneyGraphCanvas } from "./JourneyGraphCanvas";
import { JourneyNodeInspector } from "./JourneyNodeInspector";
import { JourneyValidationPanel } from "./JourneyValidationPanel";
import { JourneySimulationPanel } from "./JourneySimulationPanel";
import { JourneyVersionDiffPanel } from "./JourneyVersionDiffPanel";
import { JourneyPublishPanel } from "./JourneyPublishPanel";
import { computeJourneyDiff, computeLayout } from "./journey-graph-utils";
import "./journey-designer.css";

type Tab = "designer" | "validation" | "simulation" | "diff" | "publish";

class ApiCodeError extends Error { code?: string; constructor(message: string, code?: string) { super(message); this.code = code; } }

export function JourneyDesigner({ locale, definitionId, versionId, initialTab }: { locale: Locale; definitionId: string; versionId: string; initialTab?: Tab }) {
  const t = journeyCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();

  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [savedGraph, setSavedGraph] = useState<JourneyGraph | null>(null);
  const [graph, setGraph] = useState<JourneyGraph | null>(null);
  const [registry, setRegistry] = useState<JourneyCapability[]>([]);
  const [registryMeta, setRegistryMeta] = useState<JourneyRegistryMetadata | null>(null);
  const [runtime, setRuntime] = useState<JourneyReadiness | null>(null);
  const [can, setCan] = useState<Decision[]>([]);
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

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/journeys" + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "REAUTHENTICATION_REQUIRED") { await signIn(true); throw new ApiCodeError(t.denied, data.code); }
      throw new ApiCodeError(data.message || (response.status === 403 ? t.denied : t.error), data.code);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn]);

  const version = detail?.versions.find((v) => v.id === versionId) ?? null;
  const editable = version ? ["DRAFT", "VALIDATED", "SIMULATED"].includes(version.status) : false;

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError(""); setStale(false);
    try {
      const decisions = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if ((decisions as Decision[]).some((d) => d.permission === "journey.view" && d.allowed)) {
        const [d, reg, meta] = await Promise.all([
          api<JourneyDetail>("/" + definitionId),
          api<JourneyCapability[]>("/registry"),
          api<JourneyRegistryMetadata>("/registry/metadata"),
        ]);
        setDetail(d); setRegistry(reg); setRegistryMeta(meta);
        const v = d.versions.find((x) => x.id === versionId);
        if (v) { setSavedGraph(v.graph); setGraph(v.graph); }
        try { setRuntime(await api<JourneyReadiness>("/" + definitionId + "/versions/" + versionId + "/runtime")); } catch { setRuntime(null); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error, definitionId, versionId]);
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
  });
  const returnToDraft = () => run(async () => {
    if (!version) return;
    const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId + "/return-to-draft", "POST", { revision: version.revision, reason });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
  });
  const publish = () => run(async () => {
    if (!version) return;
    const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId + "/publish", "POST", { revision: version.revision, reason });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
    setNotice(t.publish);
  });
  const retire = () => run(async () => {
    if (!version) return;
    const saved = await api<JourneyVersion>("/" + definitionId + "/versions/" + versionId + "/retire", "POST", { revision: version.revision, reason });
    setDetail((d) => d ? { ...d, versions: d.versions.map((v) => (v.id === saved.id ? saved : v)) } : d);
  });

  const compareVersion = detail?.versions.find((v) => v.id === compareId) ?? null;
  const diff = useMemo(() => (version && compareVersion ? computeJourneyDiff(compareVersion.graph, version.graph) : null), [version, compareVersion]);

  const previousPublished = useMemo(() => {
    if (!detail || !version) return null;
    return detail.versions.filter((v) => v.status === "PUBLISHED" && v.number < version.number).sort((a, b) => b.number - a.number)[0] ?? null;
  }, [detail, version]);
  const materialChanges = useMemo(() => (version && previousPublished ? computeJourneyDiff(previousPublished.graph, version.graph) : null), [version, previousPublished]);

  const issues = validation ? [...validation.errors, ...validation.warnings] : [];

  const orderedNodeKeys = useMemo(() => (graph ? Object.entries(computeLayout(graph).positions).sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([k]) => k) : []), [graph]);

  const actions = (
    <div className="jd-head-actions">
      <button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.retry}</button>
      {editable && <button type="button" disabled={busy || !dirty || !reason.trim()} onClick={() => void saveDraft()}>{t.saveDraft}</button>}
      {editable && <button type="button" className="cc-secondary" disabled={busy || dirty || !reason.trim() || !allowed(t.permission.validate)} onClick={() => void runValidate()}>{t.validate}</button>}
      {editable && <button type="button" className="cc-secondary" disabled={busy || dirty || !reason.trim() || !allowed(t.permission.simulate)} onClick={() => void runSimulate()}>{t.simulate}</button>}
    </div>
  );

  return (
    <ControlCenterShell
      locale={locale} active="journeys"
      crumbs={[{ label: t.breadcrumbJourneys, href: `/${locale}/portal/journeys` }, { label: detail?.definition.name ?? t.breadcrumbVersions, href: `/${locale}/portal/journeys/${definitionId}` }, { label: version ? `${t.versionNumber} ${version.number}` : t.breadcrumbDesigner }]}
      title={detail?.definition.name ?? t.designer}
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
              <span className={dirty ? "jd-unsaved" : "jd-saved"}>{dirty ? t.unsaved : t.saved}</span>
              {runtime && <span className="cc-badge">{runtime.status === "DEPLOYED" ? t.deployed : t.notDeployed}</span>}
              {!editable && <span className="cc-meta">{t.cloneToEdit}</span>}
            </div>
            <div className="jd-field" style={{ minWidth: 260 }}>
              <label>{t.reason}<input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.reasonHint} /></label>
            </div>
          </div>

          <div className="cc-tabs" role="tablist">
            {(["designer", "validation", "simulation", "diff", "publish"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
                {k === "designer" ? t.designer : k === "validation" ? t.validation : k === "simulation" ? t.simulation : k === "diff" ? t.diff : t.publishGovernance}
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
                  <p className="cc-meta">{t.selectNode}</p>
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
                      issues={issues} simVisited={simulation ? new Set(simulation.steps.map((s) => s.nodeKey)) : undefined}
                      simCurrent={simulation ? simulation.steps[simulation.steps.length - 1]?.nodeKey ?? null : null}
                      onSelectNode={(k) => { setSelectedNodeKey(k); if (k) setSelectedEdgeKey(null); }}
                      onSelectEdge={(k) => { setSelectedEdgeKey(k); if (k) setSelectedNodeKey(null); }}
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
              locale={locale} validation={validation} busy={busy} disabled={!editable || dirty || !reason.trim() || !allowed(t.permission.validate)}
              onRun={() => void runValidate()} onFocusIssue={(k) => { setSelectedNodeKey(k); setSelectedEdgeKey(null); setTab("designer"); }}
            />
          )}

          {tab === "simulation" && (
            <JourneySimulationPanel
              locale={locale} registryMeta={registryMeta} facts={simFacts} simulation={simulation} busy={busy}
              disabled={!editable || dirty || !reason.trim() || !allowed(t.permission.simulate)}
              onChangeFacts={setSimFacts} onRun={() => void runSimulate()}
            />
          )}

          {tab === "diff" && (
            <JourneyVersionDiffPanel locale={locale} versions={detail.versions} currentVersion={version} compareId={compareId} onChangeCompareId={setCompareId} diff={diff} />
          )}

          {tab === "publish" && (
            <JourneyPublishPanel
              locale={locale} version={version} materialChanges={materialChanges} can={can} busy={busy}
              reason={reason}
              onSubmit={() => void submit()} onReturnToDraft={() => void returnToDraft()} onPublish={() => void publish()} onRetire={() => void retire()}
            />
          )}

          <p className="cc-meta" style={{ marginTop: 20 }}>
            <Link href={`/${locale}/portal/journeys/${definitionId}`}>{t.backToVersions}</Link>
          </p>
        </>
      )}
    </ControlCenterShell>
  );
}
