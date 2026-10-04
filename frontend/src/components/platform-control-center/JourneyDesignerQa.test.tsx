import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { JourneyDesigner } from "./JourneyDesigner";
import { JourneyGraphCanvas, STAGE_DRAG_TYPE } from "./JourneyGraphCanvas";
import { connectByDrag } from "./journey-graph-utils";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import type { JourneyGraph } from "./journey-types";
import { meWith } from "./test-support";

/** QA deep pass (2026-10-04): journey designer permissions and the drag-and-drop map (QA-07, QA-08). */
const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "maker" } }, me: null as Me | null, loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const flowProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));
vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown> & { children?: ReactNode }) => { flowProps.last = props; return <div data-testid="flow">{props.children}</div>; },
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: (p: { x: number; y: number }) => p }),
  Background: () => null, Controls: () => null, MiniMap: () => null, Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
}));

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  global.ResizeObserver = RO as unknown as typeof ResizeObserver;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); flowProps.last = null; });

const node = (key: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ key, label: key, type, actorType: "SYSTEM", action: null, entry: null, exit: null, sla: null, timerMinutes: null, blocking: false, ...extra });
const graph = {
  nodes: [node("start", "START"), node("assign", "STAFF_TASK", { label: "Assign Consultant", actorType: "COORDINATOR", action: "ASSIGN_CONSULTANT", blocking: true }), node("gate", "DECISION"), node("end", "END"), node("end2", "END")],
  edges: [{ key: "e1", from: "start", to: "assign", condition: null }, { key: "e2", from: "assign", to: "end", condition: null }],
} as unknown as JourneyGraph;

function mockApi(status: string, permissions: string[]) {
  const version = { id: "v-1", definitionId: "def-1", number: 2, status, revision: 4, createdBy: "someone-else", graph, graphHash: "h", validationSummary: "{}",
    simulationSummary: "COMPLETED", publishedAt: null, retiredAt: null, runtimeDeployment: "NOT_DEPLOYED" };
  auth.me = meWith(permissions);
  vi.mocked(apiFetchAs).mockImplementation(async (_t, path) => {
    if (path === "/admin/journeys/def-1") return new Response(JSON.stringify({ definition: { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z" }, versions: [version] }));
    if (path === "/admin/journeys/registry") return new Response(JSON.stringify([{ key: "ASSIGN_CONSULTANT", label: "Assign Consultant", actors: ["COORDINATOR"], stage: "STAFF_TASK", sourceContract: "x", permissionReferences: [], requires: [], advises: [] }]));
    if (path === "/admin/journeys/registry/metadata") return new Response(JSON.stringify({ actorTypes: ["COORDINATOR", "SYSTEM"], stageTypes: ["START", "STAFF_TASK", "DECISION", "END"], conditionFacts: ["CLINICAL_ACCEPTED"], maxNodes: 200, maxEdges: 400, cyclePolicy: "GOVERNED_RECOVERY_LOOPS", runtimeDeployment: "NOT_DEPLOYED", slaSupported: false }));
    return new Response(JSON.stringify({}));
  });
}

async function open(tab: "designer" | "publish") {
  render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" initialTab={tab} />);
  await screen.findByRole("heading", { name: "International Care Journey" });
}

function canvas(editable: boolean) {
  const onChangeGraph = vi.fn(); const onRefused = vi.fn(); const onSelectNode = vi.fn();
  render(<JourneyGraphCanvas locale="en" graph={graph} selectedNodeKey={null} selectedEdgeKey={null} issues={[]} onSelectNode={onSelectNode} onSelectEdge={() => {}}
    editable={editable} onChangeGraph={onChangeGraph} defaultFact="CLINICAL_ACCEPTED" onRefused={onRefused} />);
  return { onChangeGraph, onRefused, onSelectNode, props: flowProps.last! };
}

describe("Journey designer — permissions", () => {
  it("a Journey Manager cannot publish: the button is present but disabled without JOURNEY_APPROVE", async () => {
    mockApi("PENDING_APPROVAL", ["JOURNEY_READ", "JOURNEY_EDIT"]);
    await open("publish");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText("Publishing needs both the publish and approve permissions.")).toBeVisible();
  });

  it("a published version offers no editing controls and no draggable palette", async () => {
    mockApi("PUBLISHED", ["JOURNEY_READ", "JOURNEY_EDIT", "JOURNEY_APPROVE"]);
    await open("designer");
    expect(screen.queryByRole("list", { name: "Steps" })).toBeNull();
    expect(flowProps.last!.nodesConnectable).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Switch to list view/ }));
    fireEvent.click(screen.getByRole("button", { name: /Assign Consultant/ }));
    expect(screen.queryByRole("button", { name: "Delete step" })).toBeNull();
    expect(screen.getByLabelText("Display name")).toBeDisabled();
  });

  it("QA-07 fixed: Return to draft is offered to approvers only, matching the backend", async () => {
    mockApi("PENDING_APPROVAL", ["JOURNEY_READ", "JOURNEY_EDIT"]);
    await open("publish");
    expect(screen.queryByRole("button", { name: "Return to draft" })).toBeNull();
    cleanup();
    mockApi("PENDING_APPROVAL", ["JOURNEY_READ", "JOURNEY_APPROVE"]);
    await open("publish");
    expect(screen.getByRole("button", { name: "Return to draft" })).toBeInTheDocument();
  });
});

describe("Journey map — drag and drop (QA-08 fixed)", () => {
  it("drawing a connection between two steps changes the graph through the shared rules", () => {
    const { props, onChangeGraph } = canvas(true);
    expect(props.nodesConnectable).toBe(true);
    act(() => (props.onConnect as (c: unknown) => void)({ source: "gate", target: "end2", sourceHandle: null, targetHandle: null }));
    const next = onChangeGraph.mock.calls[0][0] as JourneyGraph;
    expect(next.edges).toContainEqual(expect.objectContaining({ from: "gate", to: "end2", condition: { fact: "CLINICAL_ACCEPTED", equalsValue: true } }));
  });

  it("an impossible drawn connection is refused with a reason and changes nothing", () => {
    const { props, onChangeGraph, onRefused } = canvas(true);
    act(() => (props.onConnect as (c: unknown) => void)({ source: "end", target: "assign" }));
    expect(onRefused).toHaveBeenCalledWith("FROM_END");
    expect(onChangeGraph).not.toHaveBeenCalled();
  });

  it("dropping a palette step on the map adds it and selects it", () => {
    const { onChangeGraph, onSelectNode } = canvas(true);
    const data = new Map<string, string>([[STAGE_DRAG_TYPE, "STAFF_TASK"]]);
    fireEvent.drop(screen.getByTestId("flow").parentElement!, { dataTransfer: { getData: (k: string) => data.get(k) ?? "", dropEffect: "" }, clientX: 40, clientY: 60 });
    const next = onChangeGraph.mock.calls[0][0] as JourneyGraph;
    expect(next.nodes.map((n) => n.key)).toContain("staff_task");
    expect(onSelectNode).toHaveBeenCalledWith("staff_task");
  });

  it("deleting a step and its links on the map removes them together; Start is never deletable", () => {
    const { props, onChangeGraph } = canvas(true);
    act(() => (props.onDelete as (d: unknown) => void)({ nodes: [{ id: "assign" }], edges: [{ id: "e1" }, { id: "e2" }] }));
    const next = onChangeGraph.mock.calls[0][0] as JourneyGraph;
    expect(next.nodes.map((n) => n.key)).not.toContain("assign");
    expect(next.edges).toHaveLength(0);
    expect((props.nodes as { id: string; deletable: boolean }[]).find((n) => n.id === "start")!.deletable).toBe(false);
  });

  it("a read-only map neither connects, deletes nor accepts drops", () => {
    const { props, onChangeGraph } = canvas(false);
    expect(props.nodesConnectable).toBe(false);
    expect(props.deleteKeyCode).toBeNull();
    act(() => (props.onConnect as (c: unknown) => void)({ source: "gate", target: "end2" }));
    expect(onChangeGraph).not.toHaveBeenCalled();
  });

  it("the palette adds a step by click as the keyboard path", async () => {
    mockApi("DRAFT", ["JOURNEY_READ", "JOURNEY_EDIT"]);
    await open("designer");
    const palette = screen.getByRole("list", { name: "Steps" });
    fireEvent.click(palette.querySelector("button")!);
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });
});

describe("connectByDrag rules", () => {
  it("a decision gets Yes first, then the complementary No, then refuses a third path", () => {
    const one = connectByDrag(graph, "gate", "end", "CLINICAL_ACCEPTED").graph;
    const two = connectByDrag(one, "gate", "end2", "CLINICAL_ACCEPTED").graph;
    expect(two.edges.filter((e) => e.from === "gate").map((e) => e.condition)).toEqual([
      { fact: "CLINICAL_ACCEPTED", equalsValue: true }, { fact: "CLINICAL_ACCEPTED", equalsValue: false }]);
    expect(connectByDrag(two, "gate", "assign", "CLINICAL_ACCEPTED").refused).toBe("DECISION_FULL");
  });

  it("an ordinary step is re-pointed instead of gaining a second next step", () => {
    const next = connectByDrag(graph, "assign", "gate", "CLINICAL_ACCEPTED").graph;
    expect(next.edges.filter((e) => e.from === "assign")).toEqual([{ key: "e2", from: "assign", to: "gate", condition: null }]);
  });

  it("refuses self links, links into Start and duplicates", () => {
    expect(connectByDrag(graph, "assign", "assign", "X").refused).toBe("SELF");
    expect(connectByDrag(graph, "assign", "start", "X").refused).toBe("INTO_START");
    expect(connectByDrag(graph, "start", "assign", "X").refused).toBe("DUPLICATE");
  });
});
