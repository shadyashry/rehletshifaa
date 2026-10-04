"use client";

import { useCallback, useMemo, useState, type DragEvent } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, type Node as FlowNode, type Edge as FlowEdge, type NodeProps, type NodeChange, type Connection,
  Handle, Position, ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { actorTypeLabel, journeyCopy, stageTypeLabel } from "./journey-copy";
import type { JourneyGraph, JourneyIssue, StageType } from "./journey-types";
import { addNode, blankNode, computeLayout, connectByDrag, nextKey, removeEdge, removeNode, type ConnectRefusal } from "./journey-graph-utils";

/** The drag payload a palette item carries onto the map (a stage type). */
export const STAGE_DRAG_TYPE = "application/x-rehletshifaa-journey-stage";

type NodeData = {
  label: string; type: string; actorType: string | null; blocking: boolean; hasSla: boolean;
  severity: "error" | "warning" | null; selected: boolean; simVisited: boolean; simCurrent: boolean; locale: Locale;
};

function JourneyNodeView({ data }: NodeProps & { data: NodeData }) {
  const d = data;
  const classes = ["jd-node"];
  if (d.selected) classes.push("jd-selected");
  if (d.severity === "error") classes.push("jd-has-error");
  if (d.severity === "warning") classes.push("jd-has-warning");
  if (["START", "END", "DECISION", "WAIT", "TIMER"].includes(d.type)) classes.push("jd-control");
  if (d.simVisited) classes.push("jd-sim-visited");
  if (d.simCurrent) classes.push("jd-sim-current");
  return (
    <div className={classes.join(" ")} role="button" tabIndex={0} aria-selected={d.selected} aria-label={`${d.label} (${stageTypeLabel(d.type, d.locale)}${d.actorType ? ", " + actorTypeLabel(d.actorType, d.locale) : ""})`}>
      {d.type !== "START" && <Handle type="target" position={Position.Top} />}
      <div className="jd-node-head">{d.severity === "error" && <AlertTriangle size={13} color="#9a2f2f" aria-hidden />}{d.label}</div>
      <div className="jd-node-actor">{stageTypeLabel(d.type, d.locale)}{d.actorType ? " · " + actorTypeLabel(d.actorType, d.locale) : ""}</div>
      <div className="jd-node-badges">
        {d.blocking && <span className="jd-badge-blocking">●</span>}
        {d.hasSla && <span className="jd-badge-sla">SLA</span>}
      </div>
      {d.type !== "END" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}

const nodeTypes = { journeyNode: JourneyNodeView };

type CanvasProps = {
  locale: Locale; graph: JourneyGraph; selectedNodeKey: string | null; selectedEdgeKey: string | null;
  issues: JourneyIssue[]; warnings?: JourneyIssue[]; simVisited?: Set<string>; simCurrent?: string | null;
  onSelectNode: (key: string | null) => void; onSelectEdge: (key: string | null) => void;
  /** Present only while the version is editable: the map then supports drop, connect, move and delete. */
  editable?: boolean; onChangeGraph?: (graph: JourneyGraph) => void; defaultFact?: string;
  onRefused?: (reason: ConnectRefusal) => void;
};

/**
 * The journey map. Drag and drop is the primary editor (blueprint §31.3); the step inspector keeps the full
 * non-drag path. Every gesture goes through the same graph functions as the inspector, and positions are a view
 * concern only — the saved journey has no coordinates, so the automatic layout returns on reload.
 */
export function JourneyGraphCanvas(props: CanvasProps) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}

function Canvas({
  locale, graph, selectedNodeKey, selectedEdgeKey, issues, warnings = [], simVisited, simCurrent, onSelectNode, onSelectEdge,
  editable = false, onChangeGraph, defaultFact = "CLINICAL_ACCEPTED", onRefused,
}: CanvasProps) {
  const t = journeyCopy[locale];
  const flow = useReactFlow();
  const { positions, backEdgeKeys } = useMemo(() => computeLayout(graph), [graph]);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const canEdit = editable && !!onChangeGraph;

  const severityByNode = useMemo(() => {
    const map: Record<string, "error" | "warning"> = {};
    for (const w of warnings) if (w.nodeKey) map[w.nodeKey] = "warning";
    for (const i of issues) if (i.nodeKey) map[i.nodeKey] = "error";
    return map;
  }, [issues, warnings]);

  const flowNodes: FlowNode[] = graph.nodes.map((n) => ({
    id: n.key,
    type: "journeyNode",
    position: moved[n.key] ?? positions[n.key] ?? { x: 0, y: 0 },
    deletable: canEdit && n.type !== "START",
    data: {
      label: n.label, type: n.type, actorType: n.actorType, blocking: n.blocking, hasSla: !!n.sla,
      severity: severityByNode[n.key] ?? null, selected: n.key === selectedNodeKey,
      simVisited: !!simVisited?.has(n.key), simCurrent: n.key === simCurrent, locale,
    } satisfies NodeData,
  }));

  const flowEdges: FlowEdge[] = graph.edges.map((e) => {
    const recovery = backEdgeKeys.has(e.key);
    const label = e.condition ? `${e.condition.fact} = ${e.condition.equalsValue ? t.conditionTrue : t.conditionFalse}` : undefined;
    return {
      id: e.key, source: e.from, target: e.to, label, selected: e.key === selectedEdgeKey, deletable: canEdit,
      className: recovery ? "jd-edge-recovery" : undefined, animated: recovery,
      style: e.key === selectedEdgeKey ? { stroke: "#27665e", strokeWidth: 2.5 } : recovery ? { stroke: "#976128" } : undefined,
      labelBgStyle: { fill: "#f7faf8" },
    };
  });

  /** Moving a step is a view change: keep where it was dropped for this session. */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const next: Record<string, { x: number; y: number }> = {};
    for (const c of changes) if (c.type === "position" && c.position) next[c.id] = c.position;
    if (Object.keys(next).length) setMoved((m) => ({ ...m, ...next }));
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!canEdit || !c.source || !c.target) return;
    const result = connectByDrag(graph, c.source, c.target, defaultFact);
    if (result.refused) onRefused?.(result.refused);
    else onChangeGraph!(result.graph);
  }, [canEdit, graph, defaultFact, onChangeGraph, onRefused]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const type = event.dataTransfer.getData(STAGE_DRAG_TYPE) as StageType;
    if (!canEdit || !type) return;
    event.preventDefault();
    const key = nextKey(type, graph.nodes.map((n) => n.key));
    setMoved((m) => ({ ...m, [key]: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) }));
    onChangeGraph!(addNode(graph, blankNode(key, type, stageTypeLabel(type, locale))));
    onSelectNode(key);
  }, [canEdit, graph, flow, locale, onChangeGraph, onSelectNode]);

  return (
    <div style={{ width: "100%", height: "100%" }} onDragOver={(e) => { if (canEdit) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }} onDrop={onDrop}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesConnectable={canEdit}
        nodesFocusable
        edgesFocusable
        deleteKeyCode={canEdit ? ["Delete", "Backspace"] : null}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onDelete={({ nodes, edges }) => {
          // One callback for a step and the links that go with it, so they are removed from the same graph.
          if (!canEdit) return;
          let g = graph;
          for (const e of edges) g = removeEdge(g, e.id);
          for (const n of nodes) g = removeNode(g, n.id);
          onChangeGraph!(g); onSelectNode(null); onSelectEdge(null);
        }}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onPaneClick={() => { onSelectNode(null); onSelectEdge(null); }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable ariaLabel={t.canvas} />
      </ReactFlow>
    </div>
  );
}
