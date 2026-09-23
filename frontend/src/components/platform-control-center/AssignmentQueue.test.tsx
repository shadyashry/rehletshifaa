import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AssignmentQueue } from "./AssignmentQueue";
import type { QueueItem, Team } from "./coordination-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const team: Team = { id: "team-1", organizationId: "org-1", name: "Cardiology Coordination", configuration: { active: true, purpose: "", careAreas: [], languages: [], timeZone: "Asia/Dubai", fallbackTeam: null }, revision: 0 };
const queueItem: QueueItem = { caseId: "case-1", taskId: "task-1", team: "team-1", reason: "NO_ELIGIBLE_COORDINATOR", queuedAt: "2026-09-20T10:00:00Z", dueAt: "2026-09-21T10:00:00Z", revision: 3 };
const facts = { id: "case-1", organizationId: "org-1", consultantId: "consultant-1", careArea: "cardiology", language: "en", owner: null, mode: "LIVE" as const, revision: 3, status: "READY_FOR_CONSULTANT" };
const history = [{ id: "d1", caseId: "case-1", mode: "LIVE" as const, policyId: "p1", policyVersion: 1, preferenceId: null, previousOwner: null, selectedOwner: null, team: "team-1", path: "NO_ELIGIBLE_COORDINATOR", explanation: "Nobody eligible", candidates: [{ subject: "coordinator-a", teams: ["team-1"], maximum: 10, workload: 0, onDuty: true, languageMatch: true, lastAssignment: null, exclusions: [] }], scores: [], source: "AUTO", reason: null, evaluatedAt: "2026-09-20T10:00:00Z", revision: 3, legacyMatches: false, algorithm: "coordination-v1" }];

function api(routes: Record<string, unknown>) {
  return vi.fn(async (path: string) => { for (const k of Object.keys(routes)) if (path === k) return routes[k]; return {}; });
}

describe("Assignment queue", () => {
  it("renders the real unassigned queue and opens the manual assignment dialog with the Case Owner vs WorkItem distinction", async () => {
    const fetchApi = api({ "/cases/case-1": facts, "/cases/case-1/history": history });
    render(<AssignmentQueue locale="en" api={fetchApi} allowed={() => true} queue={[queueItem]} teams={[team]} onChanged={vi.fn()} subject="manager" />);
    expect(screen.getByText("case-1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(screen.getByText(/Case Owner is the assigned Consultant\/Doctor/)).toBeVisible();
    expect(screen.getByText(/Current coordinator \(WorkItem\): Unassigned/)).toBeVisible();
    expect(screen.getByRole("option", { name: "coordinator-a" })).toBeInTheDocument();
  });

  it("submits an ASSIGN command with the case's real revision and a mandatory reason", async () => {
    const fetchApi = api({ "/cases/case-1": facts, "/cases/case-1/history": history, "/cases/case-1/commands": { id: "d2" } });
    const onChanged = vi.fn();
    render(<AssignmentQueue locale="en" api={fetchApi} allowed={() => true} queue={[queueItem]} teams={[team]} onChanged={onChanged} subject="manager" />);
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/Choose an eligible coordinator/), { target: { value: "coordinator-a" } });
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Reviewed queue and assigned" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchApi).toHaveBeenCalledWith("/cases/case-1/commands", "POST", expect.objectContaining({ revision: 3, action: "ASSIGN", target: "coordinator-a", reason: "Reviewed queue and assigned" }));
  });

  it("never offers Assign/Reassign for an evaluation-only case: it points to the authoritative Staff Portal transfer and sends no command", async () => {
    const fetchApi = api({ "/cases/case-9": { ...facts, id: "case-9", owner: "coordinator-b", mode: "SHADOW" as const }, "/cases/case-9/history": history });
    render(<AssignmentQueue locale="en" api={fetchApi} allowed={() => true} queue={[]} teams={[team]} onChanged={vi.fn()} subject="manager" />);
    fireEvent.change(screen.getByLabelText("Case ID"), { target: { value: "case-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check coordinator assignment" }));
    const dialog = await screen.findByRole("dialog");
    expect(await screen.findByText(/can't be changed here/)).toBeVisible();
    expect(dialog).toHaveTextContent(/Transfer case/);
    expect(screen.queryByRole("button", { name: /Confirm (re)?assignment/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Shadow/)).not.toBeInTheDocument();
    expect(fetchApi).not.toHaveBeenCalledWith("/cases/case-9/commands", expect.anything(), expect.anything());
  });

  it("shows the empty-queue state when there is no unassigned coordination work", () => {
    render(<AssignmentQueue locale="en" api={api({})} allowed={() => true} queue={[]} teams={[]} onChanged={vi.fn()} subject="manager" />);
    expect(screen.getByText(/No unassigned coordination work/)).toBeVisible();
  });
});
