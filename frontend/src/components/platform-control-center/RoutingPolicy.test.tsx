import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RoutingPolicy } from "./RoutingPolicy";
import type { Team } from "./coordination-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const team: Team = { id: "team-1", organizationId: "org-1", name: "Cardiology Coordination", configuration: { active: true, purpose: "", careAreas: [], languages: [], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 0 };
const policy = { id: "policy-1", organizationId: "org-1", version: 2, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, configuration: { capacityWeight: 80, languageWeight: 20, requireOnDuty: true, mandatoryLanguage: false, providerTeam: "team-1", careAreaTeams: {}, defaultTeam: "team-1", fallbackTeam: null, queueHours: 24 } };

describe("Routing policy", () => {
  it("renders the current published policy as a readable waterfall, not a raw rule builder", async () => {
    const api = vi.fn(async () => [policy]);
    render(<RoutingPolicy locale="en" api={api} allowed={() => false} teams={[team]} />);
    expect(await screen.findByText(/Current policy · v2/)).toBeVisible();
    expect(screen.getByText(/Continuity/)).toBeVisible();
    expect(screen.queryByText(JSON.stringify(policy.configuration))).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish new version/ })).not.toBeInTheDocument();
  });

  it("blocks publishing a new version until weights sum to 100", async () => {
    const api = vi.fn(async () => [policy]);
    render(<RoutingPolicy locale="en" api={api} allowed={() => true} teams={[team]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Publish new version/ }));
    fireEvent.change(screen.getByLabelText(/Effective from/), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(/Capacity weight/), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Language weight/), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows the empty state when no policy is published yet", async () => {
    const api = vi.fn(async () => []);
    render(<RoutingPolicy locale="en" api={api} allowed={() => false} teams={[]} />);
    expect(await screen.findByText(/No routing policy is published/)).toBeVisible();
  });
});
