import type { Condition, JourneyEdge, JourneyGraph, JourneyNode, StageType } from "./journey-types";

function cloneGraph(graph: JourneyGraph): JourneyGraph {
  return { nodes: graph.nodes.map((n) => ({ ...n })), edges: graph.edges.map((e) => ({ ...e })) };
}

export function nextKey(base: string, existing: string[]): string {
  const slug = (base || "stage").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]/, "s$&").slice(0, 40) || "stage";
  if (!existing.includes(slug)) return slug;
  let i = 2;
  while (existing.includes(`${slug}_${i}`)) i++;
  return `${slug}_${i}`;
}

export function nextEdgeKey(existing: string[]): string {
  let i = existing.length + 1;
  while (existing.includes(`edge_${i}`)) i++;
  return `edge_${i}`;
}

export function blankNode(key: string, type: StageType, label: string): JourneyNode {
  return { key, label, type, actorType: type === "STAFF_TASK" || type === "PATIENT_ACTION" ? null : "SYSTEM", action: null, entry: null, exit: type === "WAIT" ? { fact: "CONSULTANT_ACCEPTED", equalsValue: true } : null, sla: null, timerMinutes: type === "TIMER" ? 60 : null, blocking: type === "STAFF_TASK" || type === "PATIENT_ACTION" };
}

export function addNode(graph: JourneyGraph, node: JourneyNode): JourneyGraph {
  const g = cloneGraph(graph); g.nodes.push(node); return g;
}
export function updateNode(graph: JourneyGraph, key: string, patch: Partial<JourneyNode>): JourneyGraph {
  const g = cloneGraph(graph); g.nodes = g.nodes.map((n) => (n.key === key ? { ...n, ...patch } : n)); return g;
}
export function removeNode(graph: JourneyGraph, key: string): JourneyGraph {
  const g = cloneGraph(graph);
  g.nodes = g.nodes.filter((n) => n.key !== key);
  g.edges = g.edges.filter((e) => e.from !== key && e.to !== key);
  return g;
}
export function addEdge(graph: JourneyGraph, edge: JourneyEdge): JourneyGraph {
  const g = cloneGraph(graph); g.edges.push(edge); return g;
}
export function updateEdge(graph: JourneyGraph, key: string, patch: Partial<JourneyEdge>): JourneyGraph {
  const g = cloneGraph(graph); g.edges = g.edges.map((e) => (e.key === key ? { ...e, ...patch } : e)); return g;
}
export function removeEdge(graph: JourneyGraph, key: string): JourneyGraph {
  const g = cloneGraph(graph); g.edges = g.edges.filter((e) => e.key !== key); return g;
}

export function outgoing(graph: JourneyGraph, key: string): JourneyEdge[] { return graph.edges.filter((e) => e.from === key); }
export function incoming(graph: JourneyGraph, key: string): JourneyEdge[] { return graph.edges.filter((e) => e.to === key); }

/** Insert a new plain-chain node after `afterKey`. Only valid when afterKey has exactly one outgoing edge. */
export function insertAfter(graph: JourneyGraph, afterKey: string, node: JourneyNode): JourneyGraph {
  const out = outgoing(graph, afterKey);
  let g = addNode(graph, node);
  if (out.length === 1) {
    const old = out[0];
    g = updateEdge(g, old.key, { from: node.key });
    g = addEdge(g, { key: nextEdgeKey(g.edges.map((e) => e.key)), from: afterKey, to: node.key, condition: null });
  } else {
    g = addEdge(g, { key: nextEdgeKey(g.edges.map((e) => e.key)), from: afterKey, to: node.key, condition: null });
  }
  return g;
}

/** Insert a new plain-chain node before `beforeKey`. Only valid when beforeKey has exactly one incoming edge. */
export function insertBefore(graph: JourneyGraph, beforeKey: string, node: JourneyNode): JourneyGraph {
  const inc = incoming(graph, beforeKey);
  let g = addNode(graph, node);
  if (inc.length === 1) {
    const old = inc[0];
    g = updateEdge(g, old.key, { to: node.key });
    g = addEdge(g, { key: nextEdgeKey(g.edges.map((e) => e.key)), from: node.key, to: beforeKey, condition: null });
  } else {
    g = addEdge(g, { key: nextEdgeKey(g.edges.map((e) => e.key)), from: node.key, to: beforeKey, condition: null });
  }
  return g;
}

/** Swap a node with its single predecessor in a plain (non-branching) chain. */
export function moveEarlier(graph: JourneyGraph, key: string): JourneyGraph {
  const inc = incoming(graph, key);
  if (inc.length !== 1) return graph;
  const predKey = inc[0].from;
  const pred = graph.nodes.find((n) => n.key === predKey);
  if (!pred || pred.type === "START") return graph;
  const beforePred = incoming(graph, predKey);
  const afterNode = outgoing(graph, key);
  let g = cloneGraph(graph);
  if (beforePred.length === 1) g = updateEdge(g, beforePred[0].key, { to: key });
  g = updateEdge(g, inc[0].key, { from: key, to: predKey });
  if (afterNode.length === 1) g = updateEdge(g, afterNode[0].key, { from: predKey });
  return g;
}

/** Swap a node with its single successor in a plain (non-branching) chain. */
export function moveLater(graph: JourneyGraph, key: string): JourneyGraph {
  const out = outgoing(graph, key);
  if (out.length !== 1) return graph;
  const succKey = out[0].to;
  const succ = graph.nodes.find((n) => n.key === succKey);
  if (!succ || succ.type === "END") return graph;
  return moveEarlier(graph, succKey);
}

export function connect(graph: JourneyGraph, from: string, to: string, condition: Condition | null): JourneyGraph {
  return addEdge(graph, { key: nextEdgeKey(graph.edges.map((e) => e.key)), from, to, condition });
}

export type LayoutResult = { positions: Record<string, { x: number; y: number }>; backEdgeKeys: Set<string> };

const COL_WIDTH = 220; const ROW_HEIGHT = 130;

export function computeLayout(graph: JourneyGraph): LayoutResult {
  const start = graph.nodes.find((n) => n.type === "START");
  const level: Record<string, number> = {};
  const order: string[] = [];
  if (start) {
    level[start.key] = 0; order.push(start.key);
    const queue = [start.key];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of outgoing(graph, cur)) {
        if (level[e.to] === undefined) {
          level[e.to] = level[cur] + 1; order.push(e.to); queue.push(e.to);
        }
      }
    }
  }
  for (const n of graph.nodes) if (level[n.key] === undefined) { level[n.key] = order.length ? Math.max(...Object.values(level)) + 1 : 0; order.push(n.key); }
  const perLevel: Record<number, number> = {};
  const positions: Record<string, { x: number; y: number }> = {};
  for (const key of order) {
    const lvl = level[key];
    const idx = perLevel[lvl] ?? 0; perLevel[lvl] = idx + 1;
    positions[key] = { x: idx * COL_WIDTH, y: lvl * ROW_HEIGHT };
  }
  const backEdgeKeys = new Set<string>();
  for (const e of graph.edges) {
    if ((level[e.to] ?? 0) <= (level[e.from] ?? 0)) backEdgeKeys.add(e.key);
  }
  return { positions, backEdgeKeys };
}

export type JourneyDiffEntry = { kind: "added" | "removed" | "changed"; subject: "node" | "edge"; key: string; messages: string[] };

export function computeJourneyDiff(base: JourneyGraph, next: JourneyGraph): JourneyDiffEntry[] {
  const entries: JourneyDiffEntry[] = [];
  const baseNodes = new Map(base.nodes.map((n) => [n.key, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.key, n]));
  for (const [key, n] of nextNodes) if (!baseNodes.has(key)) entries.push({ kind: "added", subject: "node", key, messages: [n.label] });
  for (const [key, n] of baseNodes) if (!nextNodes.has(key)) entries.push({ kind: "removed", subject: "node", key, messages: [n.label] });
  for (const [key, a] of baseNodes) {
    const b = nextNodes.get(key);
    if (!b) continue;
    const messages: string[] = [];
    if (a.label !== b.label) messages.push(`label:${a.label}->${b.label}`);
    if (a.actorType !== b.actorType) messages.push(`actor:${a.actorType}->${b.actorType}`);
    if (a.action !== b.action) messages.push(`action:${a.action}->${b.action}`);
    if (JSON.stringify(a.sla) !== JSON.stringify(b.sla)) messages.push("sla");
    if (messages.length) entries.push({ kind: "changed", subject: "node", key, messages });
  }
  const baseEdges = new Map(base.edges.map((e) => [e.key, e]));
  const nextEdges = new Map(next.edges.map((e) => [e.key, e]));
  for (const [key, e] of nextEdges) if (!baseEdges.has(key)) entries.push({ kind: "added", subject: "edge", key, messages: [`${e.from} -> ${e.to}`] });
  for (const [key, e] of baseEdges) if (!nextEdges.has(key)) entries.push({ kind: "removed", subject: "edge", key, messages: [`${e.from} -> ${e.to}`] });
  for (const [key, a] of baseEdges) {
    const b = nextEdges.get(key);
    if (!b) continue;
    if (a.to !== b.to || a.from !== b.from || JSON.stringify(a.condition) !== JSON.stringify(b.condition)) {
      entries.push({ kind: "changed", subject: "edge", key, messages: [`${a.from}->${a.to}` + (JSON.stringify(a.condition) !== JSON.stringify(b.condition) ? " (condition)" : "")] });
    }
  }
  return entries;
}

/** Why a drawn connection was not applied (the graph is returned unchanged). */
export type ConnectRefusal = "SELF" | "FROM_END" | "INTO_START" | "DUPLICATE" | "DECISION_FULL";

/**
 * A connection drawn on the map (drag from a step's handle to another step). It follows the same rules the
 * validator enforces, so drawing never produces a shape the form editor could not: a Decision gets its Yes path
 * first and the complementary No path second; any other step has one next step, so drawing again re-points it.
 */
export function connectByDrag(graph: JourneyGraph, from: string, to: string, defaultFact: string): { graph: JourneyGraph; refused?: ConnectRefusal } {
  const source = graph.nodes.find((n) => n.key === from);
  const target = graph.nodes.find((n) => n.key === to);
  if (!source || !target || from === to) return { graph, refused: "SELF" };
  if (source.type === "END") return { graph, refused: "FROM_END" };
  if (target.type === "START") return { graph, refused: "INTO_START" };
  const out = outgoing(graph, from);
  if (out.some((e) => e.to === to)) return { graph, refused: "DUPLICATE" };
  if (source.type === "DECISION") {
    if (out.length >= 2) return { graph, refused: "DECISION_FULL" };
    const first = out[0]?.condition;
    return { graph: connect(graph, from, to, first ? { fact: first.fact, equalsValue: !first.equalsValue } : { fact: defaultFact, equalsValue: true }) };
  }
  if (out.length > 0) return { graph: updateEdge(graph, out[0].key, { to, condition: null }) };
  return { graph: connect(graph, from, to, null) };
}
