import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

import { MyCare } from "./MyCare";
import { renderWithWork } from "./test-copy";
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
const wait = (code: string, waitingOn = "STAFF"): CaseActions => ({ journeyStage: base.status, waitingOn, blockers: [], currentAction: { code, kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] });
const focus = (code: string, extra: Partial<CaseActions["currentAction"]> = {}): CaseActions => ({ journeyStage: base.status, waitingOn: "PATIENT", blockers: [], currentAction: { code, kind: "FOCUS", ...extra }, availableActions: ["MESSAGE_COORDINATOR"] });
const proposal = { versionNumber: 1, status: "ACCEPTED", currency: "USD", items: [{ quantity: 1, unitPrice: 4850, optional: false }] };
const accepted = { state: "ACCEPTED", action: "VIEW_PROPOSAL" as const, versionId: "v1", versionNumber: 1 };

function renderCare(overrides: Partial<Parameters<typeof MyCare>[0]> = {}) {
  const onView = vi.fn(), onOpenProposal = vi.fn(), onOpenCase = vi.fn();
  renderWithWork(<MyCare locale="en" caseSummary={base} actions={wait("WAIT_PAYMENT_CHECK")} patientProposal={accepted} proposal={proposal}
                 deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED" } }} documents={[]} unreadMessages={0} cases={[base]}
                 view="care" onView={onView} onOpenCase={onOpenCase} onOpenProposal={onOpenProposal} messagesPanel={<p>messages panel</p>} {...overrides}/>);
  return { onView, onOpenProposal, onOpenCase };
}

describe("MyCare", () => {
  afterEach(cleanup);

  it("names its sections as headings and says unread messages in words", () => {
    renderCare({ unreadMessages: 2, cases: [base, { ...base, id: "c2", caseNumber: "RS-2026-000082" }] });
    for (const name of ["Your cases", "Your proposal", "Your coordinator", "Your care journey"])
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    // The deposit is part of the current step (a sub-heading inside it), not a second section saying the same thing.
    const step = screen.getByRole("region", { name: "We're checking your payment" });
    expect(within(step).getByRole("heading", { level: 3, name: "Coordination deposit" })).toBeTruthy();
    // "Message (2 unread messages)", not "Message2".
    expect(screen.getByRole("button", { name: "Message (2 unread messages)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Messages (2 unread messages)" })).toBeTruthy();
  });

  it("isolates the figure, not the line, in Arabic, and labels care areas from the shared list", () => {
    renderWithWork(<MyCare locale="ar" caseSummary={{ ...base, careCategory: "general-surgery" }} actions={wait("WAIT_PAYMENT_CHECK")} patientProposal={accepted} proposal={proposal}
                   deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED" } }} documents={[]} unreadMessages={0} cases={[base]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}/>, "ar");
    const deposit = screen.getByRole("region", { name: "وديعة التنسيق" });
    const figure = within(deposit).getByText(/500/);
    expect(figure.tagName).toBe("BDI");
    expect(figure.closest("[dir='ltr']")).toBe(figure);
    expect(document.getElementById("case-heading")?.textContent).not.toMatch(/general/i);
  });

  it("names the patient, and says whose care it is to a representative", () => {
    renderCare({ caseSummary: { ...base, patientName: "Maya Example" } });
    expect(document.getElementById("case-heading")?.textContent).toContain("Maya Example");
    cleanup();
    renderCare({ caseSummary: { ...base, patientName: "Maya Example" }, actions: { ...wait("WAIT_PAYMENT_CHECK"), viewer: "REPRESENTATIVE" } });
    expect(document.getElementById("case-heading")?.textContent).toMatch(/Care for .*Maya Example/);
  });

  it("at the deposit stage: no primary action, the deposit arranging with authoritative money, one proposal link, one message control", () => {
    const { onOpenProposal, onView } = renderCare();
    // Case header: reference, care area, coordinator, stage — no identifiers, no workflow codes.
    expect(screen.getByText("RS-2026-000081")).toBeTruthy();
    expect(screen.getByText("Cardiology")).toBeTruthy();
    expect(screen.getAllByText("Sara Ahmed").length).toBeGreaterThan(0);
    expect(screen.queryByText(/ACCEPTED|WAIT_DEPOSIT/)).toBeNull();
    // Current step: what is happening, no action, what happens next.
    expect(screen.getByRole("heading", { name: "We're checking your payment" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("No action is required from you right now.");
    expect(screen.getByText(/Once your payment is confirmed/)).toBeTruthy();
    // The patient acknowledged an estimate; nothing says a proposal was accepted.
    expect(screen.getByText(/matching your transfer with the reference you sent/)).toBeTruthy();
    expect(screen.queryByText(/has been accepted/)).toBeNull();
    // No fake workflow CTA of any kind.
    expect(screen.queryByRole("button", { name: /continue|pay|check status|refresh/i })).toBeNull();
    // Deposit: USD 500, arranging, and no pay button.
    const deposit = screen.getByRole("region", { name: "Coordination deposit" });
    expect(within(deposit).getByText("$500")).toBeTruthy();
    expect(within(deposit).getByText("Being checked")).toBeTruthy();
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

  it("never shows a 'pay deposit' button that has nothing behind it, even if an online-payment step code arrives", () => {
    renderCare({ actions: focus("PAY_DEPOSIT"), deposit: { status: "REQUESTED", currency: "USD", totalDisplay: 500, paidDisplay: null } });
    const deposit = screen.getByRole("region", { name: "Coordination deposit" });
    expect(within(deposit).queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Pay deposit/i)).toBeNull();
  });

  it("when the deposit is the patient's to pay, the payment step is the step's one panel (DEP-3)", () => {
    renderCare({ actions: focus("PAY_DEPOSIT"), paymentStep: <p>payment step</p> });
    expect(screen.getByRole("heading", { name: "Pay your coordination deposit" })).toBeTruthy();
    expect(screen.getByText("payment step")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Coordination deposit" })).toBeNull(); // the amount lives in the payment step
  });

  it("once the deposit is confirmed it reads as received and the stale step is gone", () => {
    renderCare({ actions: wait("WAIT_COORDINATION"), deposit: { status: "PAID", currency: "USD", totalDisplay: 500, paidDisplay: 500 } });
    const deposit = screen.getByRole("region", { name: "Coordination deposit" });
    expect(within(deposit).getByText("Deposit received")).toBeTruthy();
    expect(within(deposit).getByText("$500")).toBeTruthy();
    expect(screen.queryByText(/Being checked|checking your payment/)).toBeNull();
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

  it("names the financial stage truthfully: preliminary estimate with its basis, no technical version, separate coordination deposit", () => {
    renderCare({ proposal: { ...proposal, versionNumber: 3, documentType: "PRELIMINARY_ESTIMATE" } });
    const estimate = screen.getByRole("region", { name: "Preliminary care estimate" });
    expect(within(estimate).getByText(/preliminary, non-binding estimate, not a final price or a price guarantee/)).toBeTruthy();
    expect(within(estimate).getByText(/may increase or decrease after your treating doctor examines you in person/)).toBeTruthy();
    expect(within(estimate).getByText(/Updated version/)).toBeTruthy();
    expect(screen.queryByText(/Version 3|v3/)).toBeNull();
    // The deposit is its own thing — never presented as the treatment price.
    const deposit = screen.getByRole("region", { name: "Coordination deposit" });
    expect(within(deposit).queryByText("$4,850")).toBeNull();
    cleanup();
    renderCare({ proposal: { ...proposal, documentType: "FINAL_TREATMENT_QUOTE" } });
    const quote = screen.getByRole("region", { name: "Final treatment plan and quote" });
    expect(within(quote).queryByText(/non-binding|may increase or decrease/)).toBeNull();
    expect(within(quote).queryByText(/Updated version/)).toBeNull();
  });

  it("an information request says who asked and by when, without a second way to answer", () => {
    renderCare({ actions: focus("PROVIDE_INFORMATION"), deposit: null, patientProposal: null, proposal: null,
      patientAction: { taskId: "t1", title: "Information required", message: null, blocking: true, dueAt: "2026-09-30T09:00:00Z", items: [{ id: "i1", kind: "INFORMATION", code: "MEDS", label: "Current medicines", required: true, completed: true }] } });
    expect(screen.getByText(/Requested by your coordinator/).textContent).toContain("Sara Ahmed");
    expect(screen.getByText(/Please reply by/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /reply/i })).toHaveLength(1);
    // The phase is shown once (the journey stepper), not again as a header badge.
    expect(screen.getAllByText("Coordinator review")).toHaveLength(1);
  });

  it("never decides an action from the stage: an accepted case with no backend action shows none", () => {
    renderCare({ actions: { journeyStage: "ACCEPTED", waitingOn: "STAFF", blockers: [], currentAction: { code: "NONE", kind: "NONE" }, availableActions: [] }, deposit: null, patientProposal: null, proposal: null });
    expect(screen.getByRole("heading", { name: "You're all set for now" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("No action is required");
    expect(within(screen.getByRole("region", { name: "Your coordinator" })).queryByRole("button")).toBeNull(); // not offered by the backend → not rendered
  });

  it("puts the current step before everything else on the page, and the journey is orientation only", () => {
    renderCare();
    // The case's own heading names whose file this is; the current step is the first section after it.
    const headings = screen.getAllByRole("heading").map(h => h.textContent);
    expect(headings[0]).toBe("RS-2026-000081");
    expect(headings[1]).toBe("We're checking your payment");
    const journey = screen.getByRole("list");
    expect(within(journey).queryByRole("button")).toBeNull();
    const steps = within(journey).getAllByRole("listitem").map(li => li.getAttribute("aria-current"));
    expect(steps).toEqual([null, null, null, null, "step", null, null]);
  });

  it("switches between My Care, Documents and Messages without leaving the case", () => {
    const { onView } = renderCare({ view: "documents", documents: [{ documentId: "d1", fileName: "Echo_Report.pdf", status: "CLEAN", createdAt: "2026-09-08T09:00:00Z" }] });
    expect(screen.getByText("Echo_Report.pdf")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We're checking your payment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "My Care" }));
    expect(onView).toHaveBeenCalledWith("care");
    cleanup();
    renderCare({ view: "messages", unreadMessages: 2 });
    expect(screen.getByText("messages panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Messages/ }).textContent).toContain("2");
  });

  it("reads right-to-left with Arabic copy for the same state", () => {
    const onOpenProposal = vi.fn();
    renderWithWork(<MyCare locale="ar" caseSummary={base} actions={wait("WAIT_PAYMENT_CHECK")} patientProposal={accepted} proposal={proposal}
                   deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED" } }} documents={[]} unreadMessages={0} cases={[base]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={onOpenProposal} messagesPanel={null}/>, "ar");
    expect(screen.getByRole("heading", { name: "نتحقق من دفعتك" })).toBeTruthy();
    expect(screen.getByText("لا يلزم منك أي إجراء الآن.")).toBeTruthy();
    expect(screen.getByText("قيد التحقق")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /الاطلاع على العرض/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /مراسلة/ })).toBeTruthy();
  });

  it("a closed case shows no step of its journey as reached or current", () => {
    renderCare({ caseSummary: { ...base, status: "CLOSED" }, actions: wait("NONE"), deposit: null, patientProposal: null, proposal: null });
    const journey = screen.getByRole("region", { name: "Your care journey" });
    expect(within(journey).getAllByRole("listitem").map(li => li.getAttribute("aria-current"))).toEqual([null, null, null, null, null, null, null]);
    expect(within(journey).queryByText(/(done)/)).toBeNull();
  });

  it("shows the case switcher only from two cases, marks the open one and switches in place", () => {
    const { onOpenCase } = renderCare({ cases: [base, { ...base, id: "c2", caseNumber: "RS-2026-000090", careCategory: "orthopedics", status: "INTAKE_REVIEW", waitingOn: "PATIENT" }] });
    const switcher = screen.getByRole("region", { name: "Your cases" });
    const current = within(switcher).getByRole("link", { name: /RS-2026-000081/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    const other = within(switcher).getByRole("link", { name: /RS-2026-000090/ });
    expect(other.textContent).toContain("Orthopedics");
    expect(other.textContent).toContain("Coordinator review");
    // Waiting on the patient, from the backend's waitingOn — said in words on that case's card only.
    expect(within(other).getByText("Needs you")).toBeTruthy();
    expect(within(current).queryByText("Needs you")).toBeNull();
    fireEvent.click(other);
    expect(onOpenCase).toHaveBeenCalledWith("c2");
    fireEvent.click(current);
    expect(onOpenCase).toHaveBeenCalledTimes(1); // the open case does not reload itself
    cleanup();
    renderCare();
    expect(screen.queryByRole("region", { name: "Your cases" })).toBeNull();
  });

  it("groups cases by whose care they are, from the backend's relation, and folds past cases away", () => {
    renderCare({ cases: [{ ...base, viewer: "SELF", patientName: "Maya Example" },
      { ...base, id: "c2", caseNumber: "RS-2026-000090", viewer: "REPRESENTATIVE", patientName: "Omar Example" },
      { ...base, id: "c3", caseNumber: "RS-2026-000070", viewer: "SELF", patientName: "Maya Example", status: "CLOSED" }], newCaseHref: "/en/send-my-case" });
    const switcher = screen.getByRole("region", { name: "Your cases" });
    expect(within(switcher).getByRole("heading", { level: 3, name: "Your care" })).toBeTruthy();
    expect(within(switcher).getByRole("heading", { level: 3, name: /Care for ⁨?Omar Example/ })).toBeTruthy();
    const past = switcher.querySelector("details");
    expect(past?.open).toBe(false);
    expect(past?.textContent).toContain("RS-2026-000070");
    expect(past?.textContent).toContain("Closed");
    // A new case is the account holder's own; one entry, in their own group.
    expect(within(switcher).getAllByRole("link", { name: "Send a new case" })).toHaveLength(1);
  });

  it("with one case, a quiet way to send a new one closes the page — only when it is the account's to send", () => {
    renderCare({ newCaseHref: "/en/send-my-case" });
    expect(screen.getByRole("link", { name: "Send a new case" }).getAttribute("href")).toBe("/en/send-my-case");
    cleanup();
    renderCare();
    expect(screen.queryByRole("link", { name: "Send a new case" })).toBeNull();
  });

  it("puts the coordinator first among people: initials on the lead monogram, the Consultant second", () => {
    renderCare({ caseSummary: { ...base, doctorName: "Dr Ahmed Alashry" } });
    const coordinator = screen.getByRole("region", { name: "Your coordinator" });
    expect(coordinator.textContent).toContain("SA");
    expect(coordinator.textContent).toContain("Your Consultant");
    expect(coordinator.textContent).toContain("AA"); // the title is skipped
  });
});
