"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node as FlowNode, type Edge as FlowEdge, type NodeProps, Handle, Position, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { actorTypeLabel, journeyCopy, stageTypeLabel } from "./journey-copy";
import type { JourneyGraph, JourneyIssue } from "./journey-types";
import { computeLayout } from "./journey-graph-utils";

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
      <Handle type="target" position={Position.Top} />
      <div className="jd-node-head">{d.severity === "error" && <AlertTriangle size={13} color="#9a2f2f" aria-hidden />}{d.label}</div>
      <div className="jd-node-actor">{stageTypeLabel(d.type, d.locale)}{d.actorType ? " · " + actorTypeLabel(d.actorType, d.locale) : ""}</div>
      <div className="jd-node-badges">
        {d.blocking && <span className="jd-badge-blocking">{d.type === "PATIENT_ACTION" ? "●" : "●"}</span>}
        {d.hasSla && <span className="jd-badge-sla">SLA</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { journeyNode: JourneyNodeView };

export function JourneyGraphCanvas({
  locale, graph, selectedNodeKey, selectedEdgeKey, issues, simVisited, simCurrent, onSelectNode, onSelectEdge,
}: {
  locale: Locale; graph: JourneyGraph; selectedNodeKey: string | null; selectedEdgeKey: string | null;
  issues: JourneyIssue[]; simVisited?: Set<string>; simCurrent?: string | null;
  onSelectNode: (key: string | null) => void; onSelectEdge: (key: string | null) => void;
}) {
  const t = journeyCopy[locale];
  const { positions, backEdgeKeys } = useMemo(() => computeLayout(graph), [graph]);

  const severityByNode = useMemo(() => {
    const map: Record<string, "error" | "warning"> = {};
    for (const i of issues) if (i.nodeKey) map[i.nodeKey] = "error";
    return map;
  }, [issues]);

  const flowNodes: FlowNode[] = graph.nodes.map((n) => ({
    id: n.key,
    type: "journeyNode",
    position: positions[n.key] ?? { x: 0, y: 0 },
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
      id: e.key, source: e.from, target: e.to, label, selected: e.key === selectedEdgeKey,
      className: recovery ? "jd-edge-recovery" : undefined, animated: recovery,
      style: e.key === selectedEdgeKey ? { stroke: "#27665e", strokeWidth: 2.5 } : recovery ? { stroke: "#976128" } : undefined,
      labelBgStyle: { fill: "#f7faf8" },
    };
  });

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable
        nodesFocusable
        edgesFocusable
        deleteKeyCode={null}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
        onPaneClick={() => { onSelectNode(null); onSelectEdge(null); }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable ariaLabel={t.canvas} />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
