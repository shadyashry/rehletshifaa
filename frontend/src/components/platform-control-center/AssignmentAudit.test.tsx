import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AssignmentAudit } from "./AssignmentAudit";
import type { Team } from "./coordination-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const team: Team = { id: "team-1", organizationId: "org-1", name: "Cardiology Coordination", configuration: { active: true, purpose: "", careAreas: [], languages: [], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 0 };
const history = [
  { id: "d2", caseId: "case-1", mode: "LIVE" as const, policyId: "p1", policyVersion: 1, preferenceId: null, previousOwner: "coordinator-a", selectedOwner: "coordinator-b", team: "team-1", path: "MANUAL_REASSIGN", explanation: "Authorized manager selected an eligible coordinator with a recorded reason.", candidates: [], scores: [], source: "ADMIN_WEB", reason: "Coverage handoff", evaluatedAt: "2026-09-21T09:00:00Z", revision: 4, legacyMatches: false, algorithm: "coordination-v1" },
  { id: "d1", caseId: "case-1", mode: "SHADOW" as const, policyId: "p1", policyVersion: 1, preferenceId: null, previousOwner: null, selectedOwner: "coordinator-a", team: "team-1", path: "PROVIDER_TEAM", explanation: "Assigned by provider team.", candidates: [], scores: [], source: "TEST", reason: "Reviewed assignment", evaluatedAt: "2026-09-20T10:00:00Z", revision: 1, legacyMatches: false, algorithm: "coordination-v1" },
];

describe("Assignment audit trail", () => {
  it("is denied without assignment.audit.view", () => {
    render(<AssignmentAudit locale="en" api={vi.fn()} allowed={() => false} teams={[team]} />);
    expect(screen.getByText(/You do not have access/)).toBeVisible();
  });

  it("looks up a case and renders its full decision timeline distinguishing shadow from live and previous from selected owner", async () => {
    const api = vi.fn(async () => history);
    render(<AssignmentAudit locale="en" api={api} allowed={() => true} teams={[team]} />);
    fireEvent.change(screen.getByLabelText(/Case ID/), { target: { value: "case-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Manually reassigned")).toBeVisible();
    expect(screen.getByText("Live (adopted)")).toBeVisible();
    expect(screen.getByText("Shadow (comparison only)")).toBeVisible();
    expect(screen.getByText(/coordinator-a → Selected coordinator: coordinator-b/)).toBeVisible();
    expect(api).toHaveBeenCalledWith("/cases/case-1/history");
  });

  it("shows the empty-history state for a case with no routing decisions", async () => {
    const api = vi.fn(async () => []);
    render(<AssignmentAudit locale="en" api={api} allowed={() => true} teams={[]} />);
    fireEvent.change(screen.getByLabelText(/Case ID/), { target: { value: "case-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText(/No routing decisions recorded for this case/)).toBeVisible();
  });
});
