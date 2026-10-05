import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyAdmissionPolicyPanel, type JourneyAdmissionPolicy } from "./JourneyAdmissionPolicyPanel";
import type { JourneyVersion } from "./journey-types";

afterEach(cleanup);
const version = { id: "published-exact", number: 2, status: "PUBLISHED" } as JourneyVersion;
const policy = (overrides: Partial<JourneyAdmissionPolicy> = {}): JourneyAdmissionPolicy => ({
  id: "policy-1", journeyVersionId: "older-exact", versionNumber: 1, eligibilityScope: "CARE_CATEGORY", careCategories: ["cardiology"],
  state: "PENDING_APPROVAL", readiness: "DEPLOYED", revision: 7, preparedBy: "maker", preparationReason: "Controlled rollout", preparedAt: "2026-10-05T00:00:00Z",
  approvedBy: null, approvalReason: null, approvedAt: null, pausedBy: null, pauseReason: null, pausedAt: null, ...overrides,
});
function setup(policies: JourneyAdmissionPolicy[], permissions = ["JOURNEY_READ", "JOURNEY_EDIT", "JOURNEY_APPROVE", "JOURNEY_ADMISSION_PAUSE"], currentUser = "checker") {
  const api = vi.fn(async (path: string, method = "GET") => method !== "GET" ? {} : path.endsWith("/runtime") ? { status: "DEPLOYED" } : policies);
  const onChanged = vi.fn(async () => {});
  render(<JourneyAdmissionPolicyPanel locale="en" definitionId="def" versions={[version, { ...version, id: "draft", status: "DRAFT" }]} permissions={permissions} currentUser={currentUser} api={api as Parameters<typeof JourneyAdmissionPolicyPanel>[0]["api"]} onChanged={onChanged} />);
  return { api, onChanged };
}
describe("Governed Journey admission", () => {
  it("shows the exact older version, eligibility, readiness, actors, reasons and all policy states", async () => {
    setup([policy(), policy({ id: "policy-0", state: "PAUSED", approvedBy: "checker", approvalReason: "Ready", approvedAt: "2026-10-05T01:00:00Z", pausedBy: "manager", pauseReason: "Incident", pausedAt: "2026-10-05T02:00:00Z" })]);
    const history = await screen.findByRole("list", { name: "Policy revision history" });
    expect(history).toHaveTextContent("older-exact"); expect(history).toHaveTextContent("cardiology"); expect(history).toHaveTextContent("DEPLOYED");
    expect(history).toHaveTextContent("maker"); expect(history).toHaveTextContent("Controlled rollout"); expect(history).toHaveTextContent("manager"); expect(history).toHaveTextContent("Incident");
    expect(screen.queryByRole("button", { name: "Prepare admission policy" })).not.toBeInTheDocument();
  });
  it("prepares only the selected published version and explicit category scope with a reason", async () => {
    const { api } = setup([]);
    fireEvent.change(await screen.findByLabelText("Exact published version"), { target: { value: "published-exact" } });
    expect(screen.queryByRole("option", { name: /draft/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Eligible new cases"), { target: { value: "CARE_CATEGORY" } });
    fireEvent.change(screen.getByLabelText("Care category keys (comma separated)"), { target: { value: "cardiology, orthopedics" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Pilot" } });
    fireEvent.click(screen.getByRole("button", { name: "Prepare admission policy" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/journey-cutover/policies", "POST", { journeyVersionId: "published-exact", eligibilityScope: "CARE_CATEGORY", careCategories: ["cardiology", "orthopedics"], reason: "Pilot" }));
  });
  it("blocks the maker from both approval and rejection", async () => {
    setup([policy()], undefined, "maker");
    expect(await screen.findByRole("button", { name: "Approve and activate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject policy" })).toBeDisabled();
  });
  it("blocks activation when exact-version readiness fails but permits independent rejection", async () => {
    setup([policy({ readiness: "NOT_DEPLOYED" })]);
    expect(await screen.findByRole("button", { name: "Approve and activate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject policy" })).toBeEnabled();
  });
  it.each(["approve", "reject", "pause"] as const)("pins the %s decision to the reviewed revision and requires its reason", async (action) => {
    const { api, onChanged } = setup([policy({ state: action === "pause" ? "ACTIVE" : "PENDING_APPROVAL" })]);
    const label = { approve: "Approve and activate", reject: "Reject policy", pause: "Pause new admissions" }[action];
    fireEvent.click(await screen.findByRole("button", { name: label }));
    const dialog = screen.getByRole("dialog", { name: label });
    expect(dialog).toHaveTextContent("older-exact");
    expect(within(dialog).getByRole("button", { name: label })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Reviewed decision" } });
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/admin/journey-cutover/policies/policy-1/${action}`, "POST", { revision: 7, reason: "Reviewed decision" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });
  it("shows policies to a read-only viewer without action controls", async () => {
    setup([policy(), policy({ id: "active", state: "ACTIVE" })], ["JOURNEY_READ"]);
    await screen.findByRole("list", { name: "Policy revision history" });
    expect(screen.queryByRole("button", { name: "Approve and activate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject policy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause new admissions" })).not.toBeInTheDocument();
  });
  it("keeps a failed decision visible and never retries against an unseen revision", async () => {
    const { api, onChanged } = setup([policy()]);
    fireEvent.click(await screen.findByRole("button", { name: "Approve and activate" }));
    api.mockRejectedValueOnce(new Error("Admission policy changed; reload and try again"));
    const dialog = screen.getByRole("dialog", { name: "Approve and activate" });
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Review complete" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve and activate" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("reload and try again");
    expect(dialog).toHaveTextContent("Revision: 7");
    expect(onChanged).not.toHaveBeenCalled();
    expect(api.mock.calls.filter(([, method]) => method === "POST")).toHaveLength(1);
  });
});
