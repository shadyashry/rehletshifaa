import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RoutingPreferences } from "./RoutingPreferences";
import type { Team } from "./coordination-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const team: Team = { id: "team-1", organizationId: "org-1", name: "Cardiology Coordination", configuration: { active: true, purpose: "", careAreas: [], languages: [], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 0 };
const preference = { id: "pref-1", organizationId: "org-1", consultantId: "consultant-1", version: 1, effectiveFrom: "2026-01-01T00:00:00Z", effectiveTo: null, coordinator: "coordinator-a", team: null, fallbackTeam: null };

describe("Consultant routing preferences", () => {
  it("looks up a consultant by id and shows their preference is not a guaranteed assignment", async () => {
    const api = vi.fn(async () => [preference]);
    render(<RoutingPreferences locale="en" orgId="org-1" api={api} allowed={() => false} teams={[team]} />);
    fireEvent.change(screen.getByLabelText(/Consultants/), { target: { value: "consultant-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText(/preferred coordinator: coordinator-a/i)).toBeVisible();
    expect(screen.getByText(/not a guaranteed assignment/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Save preference/ })).not.toBeInTheDocument();
  });

  it("shows no-preference state and lets an authorized manager save one", async () => {
    const api = vi.fn(async () => []);
    render(<RoutingPreferences locale="en" orgId="org-1" api={api} allowed={() => true} teams={[team]} />);
    fireEvent.change(screen.getByLabelText(/Consultants/), { target: { value: "consultant-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText(/No preference set/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Save preference/ })).toBeVisible();
  });
});
