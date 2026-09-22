import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CoordinatorTeams } from "./CoordinatorTeams";
import type { Team } from "./coordination-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const team: Team = { id: "team-1", organizationId: "org-1", name: "Cardiology Coordination", configuration: { active: true, purpose: "Cardiology intake", careAreas: ["cardiology"], languages: ["en"], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 0 };
const members = [{ subject: "coordinator-a", effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, active: true, lead: true, revision: 0 }];

function api(routes: Record<string, unknown>) {
  return vi.fn(async (path: string) => { for (const k of Object.keys(routes)) if (path === k || path.startsWith(k)) return routes[k]; return {}; });
}

describe("Coordinator Teams", () => {
  it("renders real team data and hides mutation controls without assignment.team.manage", async () => {
    render(<CoordinatorTeams locale="en" api={api({ "/capacity": [] })} allowed={() => false} teams={[team]} onChanged={vi.fn()} />);
    expect(screen.getByText("Cardiology Coordination")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.queryByRole("button", { name: /New team/ })).not.toBeInTheDocument();
  });

  it("expands a team to show real membership and lets a manager add a member", async () => {
    const fetchApi = api({ "/capacity": [], "/teams/team-1/members": members });
    render(<CoordinatorTeams locale="en" api={fetchApi} allowed={() => true} teams={[team]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Members/ }));
    expect(await screen.findByText(/coordinator-a/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Add member/ })).toBeVisible();
  });

  it("shows the empty-capacity state when no capacity records exist", async () => {
    render(<CoordinatorTeams locale="en" api={api({ "/capacity": [] })} allowed={() => false} teams={[]} onChanged={vi.fn()} />);
    expect(await screen.findByText(/add one before this coordinator can receive work/)).toBeVisible();
    expect(screen.getByText(/No coordinator teams configured yet/)).toBeVisible();
  });
});
