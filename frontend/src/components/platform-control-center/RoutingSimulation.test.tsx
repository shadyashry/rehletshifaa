import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RoutingSimulation } from "./RoutingSimulation";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const result = {
  policyId: "policy-1", policyVersion: 2, algorithm: "coordination-v1",
  candidates: [
    { subject: "coordinator-a", teams: ["team-1"], maximum: 10, workload: 2, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] },
    { subject: "coordinator-b", teams: ["team-1"], maximum: 5, workload: 5, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: ["AT_CAPACITY"] },
  ],
  selection: { subject: "coordinator-a", team: "team-1", path: "PROVIDER_TEAM", scores: [{ candidate: { subject: "coordinator-a", teams: ["team-1"], maximum: 10, workload: 2, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] }, capacityFactor: "0.80", languageFactor: "1", score: "84.00" }] },
};

describe("Routing simulation", () => {
  it("is never rendered without assignment.simulate", () => {
    render(<RoutingSimulation locale="en" api={vi.fn()} allowed={() => false} />);
    expect(screen.getByText(/You do not have access/)).toBeVisible();
  });

  it("runs a what-if simulation and shows eligible/excluded candidates with reasons, never mutating anything", async () => {
    const api = vi.fn(async () => result);
    render(<RoutingSimulation locale="en" api={api} allowed={() => true} />);
    fireEvent.change(screen.getByLabelText(/Care area/), { target: { value: "cardiology" } });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByText(/Selected: coordinator-a/)).toBeVisible();
    expect(screen.getByText("coordinator-b")).toBeVisible();
    expect(screen.getByText(/At maximum caseload/)).toBeVisible();
    expect(api).toHaveBeenCalledWith("/simulate", "POST", expect.objectContaining({ careArea: "cardiology" }));
  });

  it("shows a no-candidate-selected state when nobody is eligible", async () => {
    const api = vi.fn(async () => ({ ...result, candidates: [], selection: { subject: null, team: null, path: "NO_ELIGIBLE_COORDINATOR", scores: [] } }));
    render(<RoutingSimulation locale="en" api={api} allowed={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByText("No eligible coordinator")).toBeVisible();
    expect(screen.getByText(/Nobody is eligible under the current policy/)).toBeVisible();
  });
});
