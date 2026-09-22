"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { actorTypeLabel, factLabel, journeyCopy, stageTypeLabel } from "./journey-copy";
import type { JourneyCapability, JourneyGraph, JourneyNode, JourneyRegistryMetadata, StageType } from "./journey-types";
import { isControlStage } from "./journey-types";
import { addNode, blankNode, connect, incoming, insertAfter, insertBefore, moveEarlier, moveLater, nextKey, outgoing, removeEdge, removeNode, updateEdge, updateNode } from "./journey-graph-utils";

const STAGE_TYPES: StageType[] = ["STAFF_TASK", "PATIENT_ACTION", "DECISION", "WAIT", "TIMER", "NOTIFICATION", "SYSTEM_ACTION", "END"];

export function JourneyNodeInspector({
  locale, graph, registry, registryMeta, selectedNodeKey, selectedEdgeKey, disabled, onChangeGraph, onSelectNode, onSelectEdge,
}: {
  locale: Locale; graph: JourneyGraph; registry: JourneyCapability[]; registryMeta: JourneyRegistryMetadata | null;
  selectedNodeKey: string | null; selectedEdgeKey: string | null; disabled: boolean;
  onChangeGraph: (g: JourneyGraph) => void; onSelectNode: (key: string | null) => void; onSelectEdge: (key: string | null) => void;
}) {
  const t = journeyCopy[locale];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingType, setAddingType] = useState<StageType>("STAFF_TASK");

  const node = graph.nodes.find((n) => n.key === selectedNodeKey) ?? null;
  const edge = graph.edges.find((e) => e.key === selectedEdgeKey) ?? null;
  const keys = graph.nodes.map((n) => n.key);
  const otherNodes = graph.nodes.filter((n) => n.key !== selectedNodeKey);

  function addStandalone() {
    const key = nextKey(addingType, keys);
    const n = blankNode(key, addingType, stageTypeLabel(addingType, locale));
    onChangeGraph(addNode(graph, n));
    onSelectNode(key);
  }

  if (!node && !edge) {
    return (
      <div className="jd-inspector" aria-label={t.inspector}>
        <h3>{t.inspector}</h3>
        <p className="cc-meta">{t.selectNode}</p>
        {!disabled && (
          <div className="jd-field">
            <label>{t.addStage}
              <select value={addingType} onChange={(e) => setAddingType(e.target.value as StageType)}>
                {STAGE_TYPES.map((s) => <option key={s} value={s}>{stageTypeLabel(s, locale)}</option>)}
              </select>
            </label>
            <button type="button" onClick={addStandalone}>{t.addStage}</button>
          </div>
        )}
      </div>
    );
  }

  if (edge) {
    const from = graph.nodes.find((n) => n.key === edge.from);
    const to = graph.nodes.find((n) => n.key === edge.to);
    const hasCondition = !!edge.condition;
    return (
      <div className="jd-inspector" aria-label={t.inspector}>
        <h3>{t.edges}</h3>
        <p className="cc-meta">{t.transitionFrom}: {from?.label ?? edge.from}</p>
        <p className="cc-meta">{t.transitionTo}: {to?.label ?? edge.to}</p>
        <div className="jd-field">
          <label><input type="checkbox" checked={hasCondition} disabled={disabled} onChange={(e) => onChangeGraph(updateEdge(graph, edge.key, { condition: e.target.checked ? { fact: registryMeta?.conditionFacts[0] ?? "PROPOSAL_ACCEPTED", equalsValue: true } : null }))} /> {t.transitionCondition}</label>
        </div>
        {edge.condition && (
          <div className="jd-inline">
            <label>{t.conditionFact}
              <select disabled={disabled} value={edge.condition.fact} onChange={(e) => onChangeGraph(updateEdge(graph, edge.key, { condition: { fact: e.target.value, equalsValue: edge.condition!.equalsValue } }))}>
                {(registryMeta?.conditionFacts ?? []).map((f) => <option key={f} value={f}>{factLabel(f, locale)}</option>)}
              </select>
            </label>
            <label>{t.conditionEquals}
              <select disabled={disabled} value={String(edge.condition.equalsValue)} onChange={(e) => onChangeGraph(updateEdge(graph, edge.key, { condition: { fact: edge.condition!.fact, equalsValue: e.target.value === "true" } }))}>
                <option value="true">{t.conditionTrue}</option>
                <option value="false">{t.conditionFalse}</option>
              </select>
            </label>
          </div>
        )}
        <div className="jd-field">
          <label>{t.editTransition}
            <select disabled={disabled} value={edge.to} onChange={(e) => onChangeGraph(updateEdge(graph, edge.key, { to: e.target.value }))}>
              {graph.nodes.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
            </select>
          </label>
        </div>
        <div className="cc-toolbar">
          <button type="button" className="cc-secondary" disabled={disabled} onClick={() => { onChangeGraph(removeEdge(graph, edge.key)); onSelectEdge(null); }}>{t.removeTransition}</button>
        </div>
      </div>
    );
  }

  const n = node as JourneyNode;
  const control = isControlStage(n.type);
  const capabilities = registry.filter((c) => c.stage === n.type && (!n.actorType || c.actors.includes(n.actorType as never)));
  const inc = incoming(graph, n.key); const out = outgoing(graph, n.key);
  const canMoveEarlier = inc.length === 1 && graph.nodes.find((x) => x.key === inc[0].from)?.type !== "START";
  const canMoveLater = out.length === 1 && graph.nodes.find((x) => x.key === out[0].to)?.type !== "END";
  const canInsertBefore = inc.length === 1;
  const canInsertAfter = out.length === 1;

  function insertNear(where: "before" | "after") {
    const key = nextKey(n.type, keys);
    const newNode = blankNode(key, n.type, stageTypeLabel(n.type, locale));
    onChangeGraph(where === "before" ? insertBefore(graph, n.key, newNode) : insertAfter(graph, n.key, newNode));
    onSelectNode(key);
  }

  return (
    <div className="jd-inspector" aria-label={t.inspector}>
      <h3>{n.label}</h3>
      <div className="jd-field">
        <label>{t.nodeName}<input disabled={disabled} value={n.label} maxLength={120} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { label: e.target.value }))} /></label>
      </div>
      <div className="jd-field">
        <label>{t.nodeType}
          <select disabled={disabled} value={n.type} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { type: e.target.value as StageType, ...(isControlStage(e.target.value as StageType) ? { actorType: "SYSTEM", action: null } : {}) }))}>
            {(["START", ...STAGE_TYPES] as StageType[]).map((s) => <option key={s} value={s}>{stageTypeLabel(s, locale)}</option>)}
          </select>
        </label>
      </div>

      {!control && (
        <>
          <div className="jd-field">
            <label>{t.actorType}
              <select disabled={disabled} value={n.actorType ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { actorType: e.target.value || null, action: null }))}>
                <option value="">—</option>
                {(registryMeta?.actorTypes ?? []).map((a) => <option key={a} value={a}>{actorTypeLabel(a, locale)}</option>)}
              </select>
            </label>
          </div>
          <div className="jd-field">
            <label>{t.registeredAction}
              <select disabled={disabled} value={n.action ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { action: e.target.value || null }))}>
                <option value="">{t.noAction}</option>
                {capabilities.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="jd-field">
            <label><input type="checkbox" disabled={disabled} checked={n.blocking} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { blocking: e.target.checked }))} /> {t.blocking}</label>
          </div>
        </>
      )}

      {n.type === "TIMER" && (
        <div className="jd-field">
          <label>{t.timerMinutes}<input disabled={disabled} type="number" min={1} max={525600} value={n.timerMinutes ?? 60} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { timerMinutes: Number(e.target.value) }))} /></label>
        </div>
      )}

      {n.type !== "START" && n.type !== "END" && (
        <>
          <div className="jd-field">
            <label>{t.entryCondition}
              <select disabled={disabled} value={n.entry?.fact ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { entry: e.target.value ? { fact: e.target.value, equalsValue: true } : null }))}>
                <option value="">{t.noCondition}</option>
                {(registryMeta?.conditionFacts ?? []).map((f) => <option key={f} value={f}>{factLabel(f, locale)}</option>)}
              </select>
            </label>
            {n.entry && (
              <select disabled={disabled} value={String(n.entry.equalsValue)} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { entry: { fact: n.entry!.fact, equalsValue: e.target.value === "true" } }))}>
                <option value="true">{t.conditionTrue}</option>
                <option value="false">{t.conditionFalse}</option>
              </select>
            )}
          </div>
          <div className="jd-field">
            <label>{t.exitCondition}{n.type === "WAIT" && " *"}
              <select disabled={disabled} value={n.exit?.fact ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { exit: e.target.value ? { fact: e.target.value, equalsValue: true } : null }))}>
                <option value="">{t.noCondition}</option>
                {(registryMeta?.conditionFacts ?? []).map((f) => <option key={f} value={f}>{factLabel(f, locale)}</option>)}
              </select>
            </label>
            {n.exit && (
              <select disabled={disabled} value={String(n.exit.equalsValue)} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { exit: { fact: n.exit!.fact, equalsValue: e.target.value === "true" } }))}>
                <option value="true">{t.conditionTrue}</option>
                <option value="false">{t.conditionFalse}</option>
              </select>
            )}
          </div>
          <details>
            <summary style={{ cursor: "pointer" }}>{t.sla}</summary>
            <div className="jd-inline">
              <label>{t.dueMinutes}<input disabled={disabled} type="number" min={1} max={525600} value={n.sla?.dueMinutes ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { sla: { dueMinutes: e.target.value ? Number(e.target.value) : null, reminderMinutes: n.sla?.reminderMinutes ?? null, escalationMinutes: n.sla?.escalationMinutes ?? null } }))} /></label>
              <label>{t.reminderMinutes}<input disabled={disabled} type="number" min={1} max={525600} value={n.sla?.reminderMinutes ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { sla: { dueMinutes: n.sla?.dueMinutes ?? null, reminderMinutes: e.target.value ? Number(e.target.value) : null, escalationMinutes: n.sla?.escalationMinutes ?? null } }))} /></label>
              <label>{t.escalationMinutes}<input disabled={disabled} type="number" min={1} max={525600} value={n.sla?.escalationMinutes ?? ""} onChange={(e) => onChangeGraph(updateNode(graph, n.key, { sla: { dueMinutes: n.sla?.dueMinutes ?? null, reminderMinutes: n.sla?.reminderMinutes ?? null, escalationMinutes: e.target.value ? Number(e.target.value) : null } }))} /></label>
            </div>
          </details>
        </>
      )}

      {out.length === 0 && n.type !== "END" && !disabled && otherNodes.length > 0 && (
        <div className="jd-field">
          <label>{t.addTransition}
            <select onChange={(e) => { if (e.target.value) onChangeGraph(connect(graph, n.key, e.target.value, null)); }} defaultValue="">
              <option value="" disabled>—</option>
              {otherNodes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {n.type === "DECISION" && !disabled && (
        <details open>
          <summary style={{ cursor: "pointer" }}>{t.insertRecovery}</summary>
          <RecoveryEditor locale={locale} graph={graph} decisionKey={n.key} onChangeGraph={onChangeGraph} />
        </details>
      )}

      {!disabled && (
        <>
          <p className="cc-meta" style={{ marginTop: 14 }}>{t.nonDragToolbar}</p>
          <div className="jd-toolbar" role="group" aria-label={t.nonDragToolbar}>
            <button type="button" className="cc-secondary" disabled={!canInsertBefore} onClick={() => insertNear("before")}>{t.addBefore}</button>
            <button type="button" className="cc-secondary" disabled={!canInsertAfter} onClick={() => insertNear("after")}>{t.addAfter}</button>
            <button type="button" className="cc-secondary" disabled={!canMoveEarlier} onClick={() => onChangeGraph(moveEarlier(graph, n.key))}>{t.moveBefore}</button>
            <button type="button" className="cc-secondary" disabled={!canMoveLater} onClick={() => onChangeGraph(moveLater(graph, n.key))}>{t.moveAfter}</button>
            <button type="button" className="cc-secondary" onClick={() => setConfirmDelete(true)}>{t.deleteNode}</button>
          </div>
        </>
      )}

      {confirmDelete && (
        <div className="cc-dialog-backdrop" role="presentation" onMouseDown={() => setConfirmDelete(false)}>
          <div className="cc-dialog" role="dialog" aria-modal="true" aria-label={t.confirmDeleteTitle} onMouseDown={(e) => e.stopPropagation()}>
            <h2>{t.confirmDeleteTitle}</h2>
            {(inc.length > 0 || out.length > 0) && <p>{t.confirmDeleteBody}</p>}
            <div className="cc-toolbar">
              <button type="button" className="cc-secondary" onClick={() => setConfirmDelete(false)}>{t.cancel}</button>
              <button type="button" onClick={() => { onChangeGraph(removeNode(graph, n.key)); onSelectNode(null); setConfirmDelete(false); }}>{t.confirmDelete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryEditor({ locale, graph, decisionKey, onChangeGraph }: { locale: Locale; graph: JourneyGraph; decisionKey: string; onChangeGraph: (g: JourneyGraph) => void }) {
  const t = journeyCopy[locale];
  const [target, setTarget] = useState("");
  const [fact, setFact] = useState("PROPOSAL_NEEDS_REWORK");
  const candidates = graph.nodes.filter((n) => n.key !== decisionKey && n.type !== "START" && n.type !== "END");
  return (
    <div className="jd-field">
      <label>{t.transitionTo}
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">—</option>
          {candidates.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
      </label>
      <label>{t.conditionFact}
        <select value={fact} onChange={(e) => setFact(e.target.value)}>
          <option value="PROPOSAL_NEEDS_REWORK">{factLabel("PROPOSAL_NEEDS_REWORK", locale)}</option>
          <option value="CLINICAL_ACCEPTED">{factLabel("CLINICAL_ACCEPTED", locale)}</option>
        </select>
      </label>
      <button type="button" disabled={!target} onClick={() => { onChangeGraph(connect(graph, decisionKey, target, { fact, equalsValue: false })); setTarget(""); }}>{t.addTransition}</button>
    </div>
  );
}
