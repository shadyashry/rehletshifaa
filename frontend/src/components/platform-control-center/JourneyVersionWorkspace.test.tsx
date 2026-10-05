import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyVersionWorkspace } from "./JourneyVersionWorkspace";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { meWith } from "./test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "owner" } }, me: null as Me | null, loading: false, signIn: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const graph = { nodes: [], edges: [] };
const published = { id: "v-1", definitionId: "def-1", number: 1, status: "PUBLISHED", revision: 3, createdBy: "owner", graph, graphHash: "h1", validationSummary: null, simulationSummary: "COMPLETED", publishedAt: "2026-09-01T00:00:00Z", retiredAt: null, runtimeDeployment: "DEPLOYED" };
const draft = { id: "v-2", definitionId: "def-1", number: 2, status: "PENDING_APPROVAL", revision: 0, createdBy: "owner", graph, graphHash: "h2", validationSummary: null, simulationSummary: "COMPLETED", publishedAt: null, retiredAt: null, runtimeDeployment: "NOT_DEPLOYED" };
const detail = (versions: unknown[]) => ({ definition: { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z" }, versions });
let versions: unknown[] = [];
const history = [
  { actor: "kc-123", entity: "v-2", action: "JOURNEY_DRAFT_UPDATED", outcome: "SUCCESS", reason: "revision=1", changeReason: "تعديل خطوة الاستقبال", occurredAt: "2026-09-03T00:00:00Z" },
  { actor: "kc-123", entity: "v-1", action: "JOURNEY_PUBLISHED", outcome: "SUCCESS", reason: "graph=h1; runtime=DEPLOYED", changeReason: "Approved after operations review", occurredAt: "2026-09-02T00:00:00Z" },
  { actor: "kc-123", entity: "v-1", action: "JOURNEY_SUBMITTED", outcome: "SUCCESS", reason: "revision=4", changeReason: null, occurredAt: "2026-09-01T00:00:00Z" },
  { actor: "kc-123", entity: "def-1", action: "JOURNEY_CREATED", outcome: "SUCCESS", reason: "Canonical platform journey", changeReason: null, occurredAt: "2026-08-31T00:00:00Z" },
];
const paths = () => vi.mocked(apiFetchAs).mock.calls.map(([, p]) => p);

beforeEach(() => {
  versions = [published, draft];
  auth.me = meWith(["JOURNEY_READ", "JOURNEY_EDIT"]);
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path, init) => {
    if (path === "/admin/journeys/def-1") return new Response(JSON.stringify(detail(versions)), { status: 200 });
    if (path === "/admin/journey-cutover") return new Response(JSON.stringify({ productionIntakeEnabled: false, runtimeEnabled: false }), { status: 200 });
    if (path === "/admin/journey-cutover/policies") return new Response(JSON.stringify([]), { status: 200 });
    if (path === "/admin/journeys/def-1/history?offset=0") return new Response(JSON.stringify(history), { status: 200 });
    if (path === "/admin/journeys/def-1/versions/v-1/runtime") return new Response(JSON.stringify({ journeyVersionId: "v-1", status: "DEPLOYED", compilerVersion: "flowable-1", artifactHash: "art-9" }), { status: 200 });
    if (path.endsWith("/clone") && init?.method === "POST") return new Response(JSON.stringify({ ...draft, id: "v-3" }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Journey detail", () => {
  it("leads with what is published, the change in progress and its next step, and that production intake is off", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    const live = (await screen.findByRole("heading", { name: "Published version" })).closest("section")!;
    expect(live).toHaveTextContent("Version 1");
    const change = screen.getByRole("heading", { name: "Change in progress" }).closest("section")!;
    expect(change).toHaveTextContent("Waiting for approval");
    expect(within(change).getByRole("link", { name: "Review for approval" })).toHaveAttribute("href", "/en/portal/control-center/journeys/def-1/versions/v-2?tab=publish");
    expect(screen.getByRole("heading", { name: "New patient cases" }).closest("section")).toHaveTextContent(/Journey admission is off.*independently approved admission policy/);
  });

  it("keeps engine detail out of the primary page and loads it only when Advanced opens", async () => {
    const { container } = render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    await screen.findByRole("heading", { name: "Published version" });
    expect(paths().some((p) => p.includes("/runtime"))).toBe(false);
    const advanced = screen.getByText("Advanced — technical details").closest("details")!;
    expect(advanced).not.toHaveAttribute("open");
    advanced.open = true; fireEvent(advanced, new Event("toggle"));
    await waitFor(() => expect(paths()).toContain("/admin/journeys/def-1/versions/v-1/runtime"));
    expect(await within(advanced).findByText(/art-9/)).toBeInTheDocument();
    // Draft versions have no deployment to read.
    expect(paths()).not.toContain("/admin/journeys/def-1/versions/v-2/runtime");
    // The primary page never shows hashes, compiler or keys.
    const primary = Array.from(container.querySelectorAll(".cc-journey-overview, #journey-versions")).map((n) => n.textContent).join(" ");
    expect(primary).not.toMatch(/h1|h2|INTERNATIONAL_CARE|Deployed|compiler/i);
  });

  it("shows history in business words, with technical detail only under Advanced", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    const history = (await screen.findByText("History")).closest("details")!;
    history.open = true; fireEvent(history, new Event("toggle"));
    expect(await within(history).findByText("Published")).toBeVisible();
    expect(within(history).queryByText(/kc-123|graph=h1|revision=/)).not.toBeInTheDocument();
  });

  it("shows the reason saved with each governed action, and says when an older entry has none (J-1)", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    const history = (await screen.findByText("History")).closest("details")!;
    history.open = true; fireEvent(history, new Event("toggle"));
    const items = within(await within(history).findByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Draft saved · Version 2.*Reason: تعديل خطوة الاستقبال/);
    expect(items[1]).toHaveTextContent(/Published · Version 1.*Reason: Approved after operations review/);
    expect(items[2]).toHaveTextContent(/Sent for approval · Version 1.*Reason not recorded$/);
    expect(items[2]).not.toHaveTextContent("Reason: ");
    // Creating the journey never asks for a reason, so no reason line is shown for it.
    expect(items[3]).toHaveTextContent("Journey created");
    expect(items[3]).not.toHaveTextContent(/Reason/);
  });

  it("shows saved reasons in Arabic too", async () => {
    render(<JourneyVersionWorkspace locale="ar" definitionId="def-1" />);
    const history = (await screen.findByText("السجل")).closest("details")!;
    history.open = true; fireEvent(history, new Event("toggle"));
    const items = within(await within(history).findByRole("list")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("السبب: تعديل خطوة الاستقبال");
    expect(items[2]).toHaveTextContent("لم يُسجَّل سبب");
    expect(items[2]).not.toHaveTextContent("السبب:");
  });

  it("offers Edit a copy only when no change is in progress, asking why", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    await screen.findByRole("heading", { name: "Published version" });
    expect(screen.queryByRole("button", { name: "Edit a copy" })).not.toBeInTheDocument();
    cleanup(); versions = [published];
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit a copy" }));
    const dialog = screen.getByRole("dialog", { name: "Edit a copy" });
    expect(within(dialog).getByText(/The published version stays as it is/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Edit a copy" })).toBeDisabled();
    expect(within(dialog).getByText(/Saved in the journey history with this action/)).toBeVisible();
  });

  it("links each version to its page", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    await screen.findByRole("heading", { name: "Published version" });
    const list = screen.getByRole("list", { name: "Versions & history" });
    expect(within(list).getAllByRole("link").map((l) => l.getAttribute("href"))).toContain("/en/portal/control-center/journeys/def-1/versions/v-1");
  });
});
