import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { MyCare } from "./MyCare";
import type { CaseActions } from "./CurrentAction";

/**
 * My Care renders the backend's truth and nothing it infers: the current step (one primary action only
 * when the patient owes something), the deposit as authoritative money in a truthful state, the proposal
 * through one action, and the coordinator with one way to reach them.
 */
const base = {
  id: "c1", caseNumber: "RS-2026-000081", status: "ACCEPTED", careCategory: "cardiology", coordinatorName: "Sara Ahmed",
  doctorName: "Dr Ahmed Alashry", waitingOn: "STAFF", updatedAt: "2026-09-12T09:00:00Z",
};
const timeline = [{ status: "RECEIVED", occurredAt: "2026-09-08T09:00:00Z" }, { status: "ACCEPTED", occurredAt: "2026-09-12T09:00:00Z" }];
const wait = (code: string, waitingOn = "STAFF"): CaseActions => ({ journeyStage: base.status, waitingOn, blockers: [], currentAction: { code, kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] });
const focus = (code: string, extra: Partial<CaseActions["currentAction"]> = {}): CaseActions => ({ journeyStage: base.status, waitingOn: "PATIENT", blockers: [], currentAction: { code, kind: "FOCUS", ...extra }, availableActions: ["MESSAGE_COORDINATOR"] });
const proposal = { versionNumber: 1, status: "ACCEPTED", currency: "USD", items: [{ quantity: 1, unitPrice: 4850, optional: false }] };
const accepted = { state: "ACCEPTED", action: "VIEW_PROPOSAL" as const, versionId: "v1", versionNumber: 1 };

function renderCare(overrides: Partial<Parameters<typeof MyCare>[0]> = {}) {
  const onView = vi.fn(), onOpenProposal = vi.fn(), onOpenCase = vi.fn();
  render(<MyCare locale="en" caseSummary={base} actions={wait("WAIT_DEPOSIT_ARRANGEMENT")} patientProposal={accepted} proposal={proposal}
                 deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500 }} documents={[]} unreadMessages={0} timeline={timeline} otherCases={[]}
                 view="care" onView={onView} onOpenCase={onOpenCase} onOpenProposal={onOpenProposal} messagesPanel={<p>messages panel</p>} {...overrides}/>);
  return { onView, onOpenProposal, onOpenCase };
}

describe("MyCare", () => {
  afterEach(cleanup);

  it("at the deposit stage: no primary action, the deposit arranging with authoritative money, one proposal link, one message control", () => {
    const { onOpenProposal, onView } = renderCare();
    // Case header: reference, care area, coordinator, stage — no identifiers, no workflow codes.
    expect(screen.getByText("RS-2026-000081")).toBeTruthy();
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getAllByText("Sara Ahmed").length).toBeGreaterThan(0);
    expect(screen.queryByText(/ACCEPTED|WAIT_DEPOSIT/)).toBeNull();
    // Current step: what is happening, no action, what happens next.
    expect(screen.getByRole("heading", { name: "Deposit arrangements" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("No action is required from you right now.");
    expect(screen.getByText(/Once the deposit is confirmed/)).toBeTruthy();
    // No fake workflow CTA of any kind.
    expect(screen.queryByRole("button", { name: /continue|pay|check status|refresh/i })).toBeNull();
    // Deposit: USD 500, arranging, and no pay button.
    const deposit = screen.getByRole("region", { name: "Deposit" });
    expect(within(deposit).getByText("$500")).toBeTruthy();
    expect(within(deposit).getByText("Arranging")).toBeTruthy();
    expect(within(deposit).queryByRole("button")).toBeNull();
    // Proposal: amount, status, exactly one action.
    const proposalBlock = screen.getByRole("region", { name: "Your proposal" });
    expect(within(proposalBlock).getByText("$4,850")).toBeTruthy();
    expect(within(proposalBlock).getByText(/Acknowledged/)).toBeTruthy();
    const viewButtons = screen.getAllByRole("button", { name: /view proposal/i });
    expect(viewButtons).toHaveLength(1);
    fireEvent.click(viewButtons[0]);
    expect(onOpenProposal).toHaveBeenCalledTimes(1);
    // Coordinator: compact, one communication action.
    const coordinator = screen.getByRole("region", { name: "Your coordinator" });
    expect(within(coordinator).getByText("Sara Ahmed")).toBeTruthy();
    expect(within(coordinator).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(coordinator).getByRole("button", { name: /message/i }));
    expect(onView).toHaveBeenCalledWith("messages");
    // The same business outcome never appears twice: one message control on the care view.
    expect(screen.getAllByRole("button", { name: /^message$/i })).toHaveLength(1);
  });

  it("once the deposit is confirmed it reads as received and the stale step is gone", () => {
    renderCare({ actions: wait("WAIT_COORDINATION"), deposit: { status: "PAID", currency: "USD", totalDisplay: 500, paidDisplay: 500 } });
    const deposit = screen.getByRole("region", { name: "Deposit" });
    expect(within(deposit).getByText("Deposit received")).toBeTruthy();
    expect(within(deposit).getByText("$500")).toBeTruthy();
    expect(screen.queryByText(/Arranging|Deposit arrangements/)).toBeNull();
    expect(screen.getByRole("heading", { name: "We are arranging your treatment" })).toBeTruthy();
  });

  it("a released proposal is the one primary action, and the summary does not repeat it", () => {
    const { onOpenProposal } = renderCare({ actions: focus("REVIEW_PROPOSAL"), patientProposal: { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v2", versionNumber: 2, validUntil: "2026-12-31T00:00:00Z" },
      proposal: { ...proposal, status: "RELEASED", versionNumber: 2 }, deposit: null });
    expect(screen.getByRole("heading", { name: "Your proposal is ready to review" })).toBeTruthy();
    expect(screen.queryByText(/No action is required/)).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /proposal/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("Review proposal");
    fireEvent.click(buttons[0]);
    expect(onOpenProposal).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Ready to review/)).toBeTruthy();
  });

  it("an information request shows what is needed and one way to reply", () => {
    const { onView } = renderCare({ actions: focus("PROVIDE_INFORMATION", { context: "Please send your latest ECG." }),
      patientAction: { taskId: "t1", title: "Information required", message: "Please send your latest ECG.", blocking: true, items: [{ id: "i1", kind: "DOCUMENT", code: "ECG", label: "Latest ECG report", required: true, completed: false }] }, deposit: null, patientProposal: null, proposal: null });
    expect(screen.getByRole("heading", { name: "We need something from you" })).toBeTruthy();
    expect(screen.getByText("Please send your latest ECG.")).toBeTruthy();
    expect(screen.getByText("Latest ECG report")).toBeTruthy();
    const primary = screen.getByRole("button", { name: "Reply in Messages" });
    fireEvent.click(primary);
    expect(onView).toHaveBeenCalledWith("messages");
  });

  it("never decides an action from the stage: an accepted case with no backend action shows none", () => {
    renderCare({ actions: { journeyStage: "ACCEPTED", waitingOn: "STAFF", blockers: [], currentAction: { code: "NONE", kind: "NONE" }, availableActions: [] }, deposit: null, patientProposal: null, proposal: null });
    expect(screen.getByRole("heading", { name: "You're all set for now" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("No action is required");
    expect(within(screen.getByRole("region", { name: "Your coordinator" })).queryByRole("button")).toBeNull(); // not offered by the backend → not rendered
  });

  it("puts the current step before everything else on the page, and the journey is orientation only", () => {
    renderCare();
    const headings = screen.getAllByRole("heading").map(h => h.textContent);
    expect(headings[0]).toBe("Deposit arrangements");
    const journey = screen.getByRole("list");
    expect(within(journey).queryByRole("button")).toBeNull();
    const steps = within(journey).getAllByRole("listitem").map(li => li.getAttribute("aria-current"));
    expect(steps).toEqual([null, null, null, null, "step", null, null]);
  });

  it("switches between My Care, Documents and Messages without leaving the case", () => {
    const { onView } = renderCare({ view: "documents", documents: [{ documentId: "d1", fileName: "Echo_Report.pdf", status: "CLEAN", createdAt: "2026-09-08T09:00:00Z" }] });
    expect(screen.getByText("Echo_Report.pdf")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Deposit arrangements" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "My Care" }));
    expect(onView).toHaveBeenCalledWith("care");
    cleanup();
    renderCare({ view: "messages", unreadMessages: 2 });
    expect(screen.getByText("messages panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Messages/ }).textContent).toContain("2");
  });

  it("reads right-to-left with Arabic copy for the same state", () => {
    const onOpenProposal = vi.fn();
    render(<MyCare locale="ar" caseSummary={base} actions={wait("WAIT_DEPOSIT_ARRANGEMENT")} patientProposal={accepted} proposal={proposal}
                   deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500 }} documents={[]} unreadMessages={0} timeline={timeline} otherCases={[]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={onOpenProposal} messagesPanel={null}/>);
    expect(screen.getByRole("heading", { name: "ترتيبات الوديعة" })).toBeTruthy();
    expect(screen.getByText("لا يلزم منك أي إجراء الآن.")).toBeTruthy();
    expect(screen.getByText("قيد الترتيب")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /عرض العرض/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /مراسلة/ })).toBeTruthy();
  });

  it("lists other cases compactly, only when there are any", () => {
    const { onOpenCase } = renderCare({ otherCases: [{ ...base, id: "c2", caseNumber: "RS-2026-000090", status: "CLOSED" }] });
    fireEvent.click(screen.getByRole("button", { name: /RS-2026-000090/ }));
    expect(onOpenCase).toHaveBeenCalledWith("c2");
    cleanup();
    renderCare();
    expect(screen.queryByText(/Your other cases/)).toBeNull();
  });
});
