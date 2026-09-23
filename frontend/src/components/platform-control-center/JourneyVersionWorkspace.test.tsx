import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyVersionWorkspace } from "./JourneyVersionWorkspace";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "owner" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));

const graph = { nodes: [], edges: [] };
const published = { id: "v-1", definitionId: "def-1", number: 1, status: "PUBLISHED", revision: 3, createdBy: "owner", graph, graphHash: "h1", validationSummary: null, simulationSummary: "COMPLETED", publishedAt: "2026-09-01T00:00:00Z", retiredAt: null, runtimeDeployment: "DEPLOYED" };
const draft = { id: "v-2", definitionId: "def-1", number: 2, status: "DRAFT", revision: 0, createdBy: "owner", graph, graphHash: "h2", validationSummary: null, simulationSummary: null, publishedAt: null, retiredAt: null, runtimeDeployment: "NOT_DEPLOYED" };
const detail = { definition: { id: "def-1", key: "INTERNATIONAL_CARE", name: "International Care Journey", createdAt: "2026-09-01T00:00:00Z" }, versions: [published, draft] };

beforeEach(() => {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path.endsWith("/admin/access/me")) return new Response(JSON.stringify([{ permission: "journey.view", allowed: true }, { permission: "journey.create", allowed: true }]), { status: 200 });
    if (path === "/admin/journeys/def-1") return new Response(JSON.stringify(detail), { status: 200 });
    if (path === "/admin/journeys/def-1/versions/v-1/runtime") return new Response(JSON.stringify({ journeyVersionId: "v-1", status: "DEPLOYED", compilerVersion: "1", artifactHash: "h1" }), { status: 200 });
    if (path === "/admin/journeys/def-1/versions/v-2/runtime") return new Response(JSON.stringify({ journeyVersionId: "v-2", status: "NOT_DEPLOYED", compilerVersion: null, artifactHash: null }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Journey version workspace", () => {
  it("shows the current published and draft versions with lifecycle badges and runtime status", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    expect(await screen.findByText("Published")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.getByText("Deployed")).toBeVisible();
    expect(screen.getByText("Not deployed")).toBeVisible();
  });

  it("offers cloning a published version into a new draft", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    await screen.findByText("Published");
    expect(screen.getByRole("button", { name: /Clone into a new draft/ })).toBeVisible();
  });

  it("links each version to its designer route", async () => {
    render(<JourneyVersionWorkspace locale="en" definitionId="def-1" />);
    await screen.findByText("Published");
    const links = screen.getAllByRole("link", { name: /Open designer/ });
    expect(links.map((l) => l.getAttribute("href"))).toContain("/en/portal/control-center/journeys/def-1/versions/v-1");
  });
});
