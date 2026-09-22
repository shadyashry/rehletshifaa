import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareCoordinationWorkspace } from "./CareCoordinationWorkspace";
import { apiFetchAs } from "@/lib/api";

vi.mock("@/components/AuthProvider", () => {
  const auth = { user: { access_token: "test", profile: { sub: "coordination-manager" } }, loading: false, signIn: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const org = { id: "org-1", displayName: "Nile Care Clinic", type: "CLINIC", status: "ACTIVE" };
const team = { id: "team-1", organizationId: "org-1", name: "Cardiology Coordination", configuration: { active: true, purpose: "Cardiology intake", careAreas: ["cardiology"], languages: ["en"], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 0 };
const queueItem = { caseId: "case-1", taskId: "task-1", team: "team-1", reason: "NO_ELIGIBLE_COORDINATOR", queuedAt: "2026-09-20T10:00:00Z", dueAt: "2026-09-21T10:00:00Z", revision: 1 };

function mockApi(decisions: { permission: string; allowed: boolean }[]) {
  vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
    if (path === "/admin/access/me") return new Response(JSON.stringify(decisions), { status: 200 });
    if (path === "/admin/coordination/organizations") return new Response(JSON.stringify([org]), { status: 200 });
    if (path === "/admin/coordination/org-1/teams") return new Response(JSON.stringify([team]), { status: 200 });
    if (path === "/admin/coordination/org-1/queue") return new Response(JSON.stringify([queueItem]), { status: 200 });
    if (path === "/admin/coordination/org-1/capacity") return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Care Coordination workspace", () => {
  it("shows only the tabs the caller's decisions allow", async () => {
    mockApi([{ permission: "assignment.team.view", allowed: true }, { permission: "assignment.queue.manage", allowed: true }]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    expect(await screen.findByRole("tab", { name: /Coordinator teams/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Assignment queue/ })).toBeVisible();
    expect(screen.queryByRole("tab", { name: /Routing simulation/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Assignment history/ })).not.toBeInTheDocument();
  });

  it("overview reports real active-team and unassigned-queue counts, not fabricated metrics", async () => {
    mockApi([{ permission: "assignment.team.view", allowed: true }, { permission: "assignment.queue.manage", allowed: true }]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    await screen.findByRole("tab", { name: /Coordinator teams/ });
    expect(screen.getByText("1 / 1")).toBeVisible();
  });

  it("switches to the Teams tab and renders real team data", async () => {
    mockApi([{ permission: "assignment.team.view", allowed: true }]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    fireEvent.click(await screen.findByRole("tab", { name: /Coordinator teams/ }));
    expect(await screen.findByText("Cardiology Coordination")).toBeVisible();
  });

  it("shows a denied state for an organization the caller cannot coordinate for", async () => {
    vi.mocked(apiFetchAs).mockImplementation(async (_token, path) => {
      if (path === "/admin/access/me") return new Response(JSON.stringify([]), { status: 200 });
      if (path === "/admin/coordination/organizations") return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    expect(await screen.findByText(/You do not have access/)).toBeVisible();
  });
});
