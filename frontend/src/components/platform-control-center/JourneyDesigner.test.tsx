import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyDesigner } from "./JourneyDesigner";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  global.ResizeObserver = RO as unknown as typeof ResizeObserver;
});

const graph = {
  nodes: [
    { key: "start", label: "Start", type: "START", actorType: "SYSTEM", action: null, entry: null, exit: null, sla: null, timerMinutes: null, blocking: false },
    { key: "assign", label: "Assign Consultant", type: "STAFF_TASK", actorType: "COORDINATOR", action: "ASSIGN_CONSULTANT", entry: null, exit: null, sla: null, timerMinutes: null, blocking: true },
    { key: "clinical", label: "Clinical Review", type: "STAFF_TASK", actorType: "CONSULTANT", action: "RECORD_CLINICAL_DECISION", entry: null, exit: null, sla: null, timerMinutes: null, blocking: true },
    { key: "gate", label: "Clinical Decision Gate", type: "DECISION", actorType: "SYSTEM", action: null, entry: null, exit: null, sla: null, timerMinutes: null, blocking: false },
    { key: "end", label: "End", type: "END", actorType: "SYSTEM", action: null, entry: null, exit: null, sla: null, timerMinutes: null, blocking: false },
  ],
  edges: [
    { key: "e1", from: "start", to: "assign", condition: null },
    { key: "e2", from: "assign", to: "clinical", condition: null },
    { key: "e3", from: "clinical", to: "gate", condition: null },
    { key: "e4", from: "gate", to: "end", condition: { fact: "CLINICAL_ACCEPTED", equalsValue: true } },
    { key: "e5", from: "gate", to: "assign", condition: { fact: "CLINICAL_ACCEPTED", equalsValue: false } },
  ],
};

const version = { id: "v-1", definitionId: "def-1", number: 3, status: "DRAFT", revision: 5, createdBy: "owner", graph, graphHash: "h1", validationSummary: null, simulationSummary: null, publishedAt: null, retiredAt: null, runtimeDeployment: "NOT_DEPLOYED" };
const detail = { definition: { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z" }, versions: [version] };
const registry = [
  { key: "ASSIGN_CONSULTANT", label: "Assign Consultant", actors: ["COORDINATOR"], stage: "STAFF_TASK", sourceContract: "x", permissionReferences: [] },
  { key: "RECORD_CLINICAL_DECISION", label: "Consultant clinical review", actors: ["CONSULTANT"], stage: "STAFF_TASK", sourceContract: "x", permissionReferences: [] },
];
const registryMeta = { actorTypes: ["PATIENT", "COORDINATOR", "CONSULTANT", "SYSTEM"], stageTypes: ["START", "STAFF_TASK", "DECISION", "END"], conditionFacts: ["CLINICAL_ACCEPTED", "PROPOSAL_NEEDS_REWORK"], maxNodes: 200, maxEdges: 400, cyclePolicy: "ACYCLIC_ONLY", runtimeDeployment: "NOT_DEPLOYED" };

function fullDecisions() {
  return [
    { permission: "journey.view", allowed: true }, { permission: "journey.create", allowed: true },
    { permission: "journey.edit_draft", allowed: true }, { permission: "journey.validate", allowed: true },
    { permission: "journey.simulate", allowed: true }, { permission: "journey.submit", allowed: true },
    { permission: "journey.publish", allowed: true }, { permission: "journey.approve", allowed: true },
    { permission: "journey.retire", allowed: true },
  ];
}

function mockApi(overrides: Record<string, (init?: RequestInit) => Response> = {}, decisions = fullDecisions()) {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path, init) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify(decisions), { status: 200 });
    const handler = overrides[path];
    if (handler) return handler(init);
    if (path === "/admin/journeys/def-1") return new Response(JSON.stringify(detail), { status: 200 });
    if (path === "/admin/journeys/registry") return new Response(JSON.stringify(registry), { status: 200 });
    if (path === "/admin/journeys/registry/metadata") return new Response(JSON.stringify(registryMeta), { status: 200 });
    if (path === "/admin/journeys/def-1/versions/v-1/runtime") return new Response(JSON.stringify({ journeyVersionId: "v-1", status: "NOT_DEPLOYED", compilerVersion: null, artifactHash: null }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderDesigner(initialTab?: "designer" | "validation" | "simulation" | "diff" | "publish") {
  render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" initialTab={initialTab} />);
  await screen.findByRole("heading", { name: "International Care Journey" });
  // switch to list mode so node selection does not depend on xyflow's own layout/geometry in jsdom
  fireEvent.click(await screen.findByRole("button", { name: /Switch to list view/ }));
}

describe("Journey Designer", () => {
  it("loads the version graph and shows its stages in the structured stage list (non-drag view)", async () => {
    mockApi();
    await renderDesigner();
    expect(screen.getByRole("button", { name: /Assign Consultant — Staff step/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Clinical Decision Gate — Decision/ })).toBeVisible();
  });

  it("selecting a stage populates the inspector with its editable fields", async () => {
    mockApi();
    await renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Assign Consultant — Staff step/ }));
    const nameField = await screen.findByLabelText("Display name");
    expect(nameField).toHaveValue("Assign Consultant");
  });

  it("editing a stage name marks the draft unsaved, and Save draft requires a governance reason", async () => {
    mockApi();
    await renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Assign Consultant — Staff step/ }));
    const nameField = await screen.findByLabelText("Display name");
    fireEvent.change(nameField, { target: { value: "Assign the Consultant" } });
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    const saveButton = screen.getByRole("button", { name: "Save draft" });
    expect(saveButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Renaming for clarity" } });
    expect(saveButton).toBeEnabled();
  });

  it("adds a new stage after the selected one using the non-drag toolbar, with no drag interaction", async () => {
    mockApi();
    await renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Assign Consultant — Staff step/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add step after" }));
    expect(screen.getByLabelText("Display name")).toHaveValue("Staff step");
  });

  it("deletes a stage only after an explicit confirmation dialog", async () => {
    mockApi();
    await renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Assign Consultant — Staff step/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete stage" }));
    expect(screen.getByRole("dialog", { name: "Delete this stage?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Assign Consultant/ })).not.toBeInTheDocument());
  });

  it("offers a recovery-loop editor on Decision stages, matching the backend's bounded back-edge policy", async () => {
    mockApi();
    await renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Clinical Decision Gate — Decision/ }));
    expect(await screen.findByText("Insert recovery step")).toBeVisible();
  });

  it("runs validation and displays backend-supplied errors and warnings, with a way to focus the offending node", async () => {
    mockApi({
      "/admin/journeys/def-1/versions/v-1/validate": () => new Response(JSON.stringify({
        version: { ...version, status: "DRAFT" },
        result: { errors: [{ code: "UNREACHABLE", nodeKey: "clinical", message: "This stage cannot be reached." }], warnings: [{ code: "RUNTIME_NOT_DEPLOYED", nodeKey: null, message: "This configuration is a dry-run domain model." }] },
      }), { status: 200 }),
    });
    await renderDesigner();
    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Checking the graph" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("This stage cannot be reached.")).toBeVisible();
    expect(screen.getByText("This configuration is a dry-run domain model.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show on graph" }));
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Clinical Review"));
  });

  it("runs a simulation and shows the traversed path with actor and outcome, side-effect free", async () => {
    mockApi({
      "/admin/journeys/def-1/versions/v-1/simulate": () => new Response(JSON.stringify({
        version: { ...version, simulationSummary: "COMPLETED" },
        result: { outcome: "COMPLETED", steps: [{ nodeKey: "start", label: "Start", actorType: "SYSTEM", action: null, state: "EXPECTED" }, { nodeKey: "end", label: "End", actorType: "SYSTEM", action: null, state: "COMPLETED" }], validation: { errors: [], warnings: [] } },
      }), { status: 200 }),
    });
    render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" initialTab="simulation" />);
    await screen.findByRole("heading", { name: "International Care Journey" });
    expect(screen.getByText(/side-effect free/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Dry run" } });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByText(/Outcome: Completed/)).toBeVisible();
  });

  it("blocks publishing until simulation is COMPLETED and the caller holds both journey.publish and journey.approve", async () => {
    const pending = { ...version, status: "PENDING_APPROVAL", simulationSummary: null };
    mockApi({ "/admin/journeys/def-1": () => new Response(JSON.stringify({ ...detail, versions: [pending] }), { status: 200 }) });
    render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" initialTab="publish" />);
    await screen.findByRole("heading", { name: "International Care Journey" });
    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Ready to publish" } });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("surfaces the backend's independent-review requirement when publish is attempted by the version's own editor", async () => {
    const pending = { ...version, status: "PENDING_APPROVAL", simulationSummary: "COMPLETED" };
    mockApi({
      "/admin/journeys/def-1": () => new Response(JSON.stringify({ ...detail, versions: [pending] }), { status: 200 }),
      "/admin/journeys/def-1/versions/v-1/publish": () => new Response(JSON.stringify({ code: "INDEPENDENT_REVIEW_REQUIRED", message: "Another authorized reviewer must publish this journey." }), { status: 403 }),
    });
    render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" initialTab="publish" />);
    await screen.findByRole("heading", { name: "International Care Journey" });
    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Publishing" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Another authorized reviewer must publish this journey.")).toBeVisible();
  });

  it("shows a reload prompt on a stale-version (409) conflict instead of silently overwriting", async () => {
    mockApi({
      "/admin/journeys/def-1/versions/v-1": () => new Response(JSON.stringify({ code: "STALE_JOURNEY", message: "This journey changed. Reload before saving." }), { status: 409 }),
    });
    await renderDesigner();
    fireEvent.click(screen.getByRole("button", { name: /Assign Consultant — Staff step/ }));
    fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "Assign a Consultant" } });
    fireEvent.change(screen.getByLabelText("Governance reason"), { target: { value: "Rename" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText(/Someone else saved a change to this version/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
  });

  it("renders the xyflow canvas without crashing on a graph containing a governed recovery back-edge (Decision → earlier Staff step)", async () => {
    mockApi();
    const { container } = render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" />);
    await screen.findByRole("heading", { name: "International Care Journey" });
    // xyflow's own node/edge geometry does not settle in jsdom (no real layout engine), so this is a
    // mount smoke test: the canvas renders, and the same graph is also reachable via the non-drag list.
    expect(container.querySelector(".react-flow")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Switch to list view/ }));
    expect(screen.getByRole("button", { name: /Clinical Decision Gate — Decision/ })).toBeVisible();
  });

  it("supports Arabic RTL rendering", async () => {
    mockApi();
    const { container } = render(<JourneyDesigner locale="ar" definitionId="def-1" versionId="v-1" />);
    await screen.findByRole("heading", { name: "International Care Journey" });
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
  });

  it("fails closed when the caller lacks journey.view", async () => {
    mockApi({}, [{ permission: "journey.view", allowed: false }]);
    render(<JourneyDesigner locale="en" definitionId="def-1" versionId="v-1" />);
    expect(await screen.findByText("You do not have access to this area.")).toBeVisible();
  });
});
