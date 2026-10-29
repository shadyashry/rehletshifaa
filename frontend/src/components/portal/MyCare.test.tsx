import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

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
    expect(screen.getByRole("link", { name: "Messages (2 unread messages)" })).toBeTruthy();
  });

  it("isolates the figure, not the line, in Arabic, and labels care areas from the shared list", () => {
    renderWithWork(<MyCare locale="ar" caseSummary={{ ...base, careCategory: "general-surgery" }} actions={wait("WAIT_PAYMENT_CHECK")} patientProposal={accepted} proposal={proposal}
                   deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED" } }} documents={[]} unreadMessages={0} cases={[base]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}/>, "ar");
    const deposit = screen.getByRole("region", { name: "دفعة التنسيق" });
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
    expect(screen.getByText(/matching your payment with the number you sent/)).toBeTruthy();
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
    expect(proposalBlock.querySelector(".statement")?.textContent).toBe("$4,850");
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

  it("says how long the team usually takes and what the patient can do meanwhile, only while the team has the step (P1-6)", () => {
    renderCare({ actions: { ...wait("WAIT_CONSULTANT_REVIEW"), currentAction: { code: "WAIT_CONSULTANT_REVIEW", kind: "WAIT", expectedWorkingDays: 2 } } });
    expect(screen.getByText("This usually takes up to 2 working days.")).toBeTruthy();
    expect(screen.getByText("Meanwhile")).toBeTruthy();
    expect(screen.getByText(/keep following your own doctor's advice/i)).toBeTruthy();
    cleanup();
    // The patient's own step promises no team window and has no meanwhile line.
    renderCare({ actions: focus("PROVIDE_INFORMATION", { expectedWorkingDays: 2 }) });
    expect(screen.queryByText(/usually takes/i)).toBeNull();
    expect(screen.queryByText("Meanwhile")).toBeNull();
  });

  it("words the window in Arabic plural forms", () => {
    renderWithWork(<MyCare locale="ar" caseSummary={base} actions={{ ...wait("WAIT_PAYMENT_CHECK"), currentAction: { code: "WAIT_PAYMENT_CHECK", kind: "WAIT", expectedWorkingDays: 1 } }}
                   patientProposal={accepted} proposal={proposal} deposit={null} documents={[]} unreadMessages={0} cases={[base]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}/>, "ar");
    expect(screen.getByText(/يوم عمل واحد/)).toBeTruthy();
    expect(screen.getByText(/لا داعي للدفع مرة أخرى/)).toBeTruthy();
  });

  it("once the deposit is confirmed it reads as received and the stale step is gone", () => {
    renderCare({ actions: wait("WAIT_COORDINATION"), deposit: { status: "PAID", currency: "USD", totalDisplay: 500, paidDisplay: 500 } });
    const deposit = screen.getByRole("region", { name: "Coordination deposit" });
    expect(within(deposit).getByText("Deposit received")).toBeTruthy();
    expect(within(deposit).getByText("$500")).toBeTruthy();
    expect(screen.queryByText(/Being checked|checking your payment/)).toBeNull();
    expect(screen.getByRole("heading", { name: "We are arranging your treatment" })).toBeTruthy();
  });

  it("a final quote is reviewed as a quote, with no estimate stamp", () => {
    renderCare({ actions: focus("REVIEW_PROPOSAL"), patientProposal: { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v3", versionNumber: 1, validUntil: "2026-12-31T00:00:00Z", releasedAt: "2026-04-01T10:00:00Z", documentType: "FINAL_TREATMENT_QUOTE" },
      proposal: { ...proposal, status: "RELEASED", documentType: "FINAL_TREATMENT_QUOTE" }, deposit: null });
    expect(screen.getByRole("heading", { name: "Your final quote is ready to review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review final quote" })).toBeTruthy();
    expect(document.querySelector(".case-stamp")).toBeNull(); // no page stamp, and the quote's release is no estimate sheet
  });

  it("a released proposal is the one primary action, and the summary does not repeat it", () => {
    const { onOpenProposal } = renderCare({ actions: focus("REVIEW_PROPOSAL"), patientProposal: { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v2", versionNumber: 2, validUntil: "2026-12-31T00:00:00Z" },
      proposal: { ...proposal, status: "RELEASED", versionNumber: 2 }, deposit: null });
    expect(screen.getByRole("heading", { name: "Your estimate is ready to review" })).toBeTruthy();
    expect(screen.queryByText(/No action is required/)).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /proposal|estimate/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("Review estimate");
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
    const journey = within(screen.getByRole("region", { name: "Your care journey" })).getByRole("list");
    expect(within(journey).queryByRole("button")).toBeNull();
    const steps = within(journey).getAllByRole("listitem").map(li => li.getAttribute("aria-current"));
    expect(steps).toEqual([null, null, null, null, "step", null, null]);
  });

  it("on Documents offers the upload and says which files are still being checked or failed the check", () => {
    renderCare({ view: "documents", documentUpload: <p>upload control</p>, documents: [
      { documentId: "d1", fileName: "Echo_Report.pdf", status: "CLEAN", createdAt: "2026-09-08T09:00:00Z" },
      { documentId: "d2", fileName: "Scan.pdf", status: "PENDING", createdAt: "2026-09-09T09:00:00Z" },
      { documentId: "d3", fileName: "Bad.pdf", status: "SCAN_FAILED", createdAt: "2026-09-09T09:00:00Z" },
      { documentId: "d4", fileName: "Never-arrived.pdf", status: "REJECTED", createdAt: "2026-09-09T09:00:00Z" }] });
    expect(screen.getByText("upload control")).toBeTruthy();
    expect(screen.queryByText(/secure link/)).toBeNull();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).queryByText("Being checked")).toBeNull();
    expect(within(rows[1]).getByText("Being checked")).toBeTruthy();
    expect(within(rows[2]).getByText("Did not pass the virus check")).toBeTruthy();
    expect(screen.queryByText("Never-arrived.pdf")).toBeNull();
  });

  it("switches between My Care, Documents and Messages without leaving the case", () => {
    const { onView } = renderCare({ view: "documents", documents: [{ documentId: "d1", fileName: "Echo_Report.pdf", status: "CLEAN", createdAt: "2026-09-08T09:00:00Z" }] });
    expect(screen.getByText("Echo_Report.pdf")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "We're checking your payment" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "My Care" }));
    expect(onView).toHaveBeenCalledWith("care");
    cleanup();
    renderCare({ view: "messages", unreadMessages: 2 });
    expect(screen.getByText("messages panel")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Messages/ }).textContent).toContain("2");
  });

  it("reads right-to-left with Arabic copy for the same state", () => {
    const onOpenProposal = vi.fn();
    renderWithWork(<MyCare locale="ar" caseSummary={base} actions={wait("WAIT_PAYMENT_CHECK")} patientProposal={accepted} proposal={proposal}
                   deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED" } }} documents={[]} unreadMessages={0} cases={[base]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={onOpenProposal} messagesPanel={null}/>, "ar");
    expect(screen.getByRole("heading", { name: "نتحقّق من دفعتك" })).toBeTruthy();
    expect(screen.getByText("لا يلزم منك أي إجراء الآن.")).toBeTruthy();
    expect(screen.getByText("قيد التحقّق")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /الاطلاع على عرض السعر/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /مراسلة/ })).toBeTruthy();
  });

  it("says how a journey ended with the backend's exit word, and offers nothing else (P0-2)", () => {
    const ended = (status: string, exit: string): CaseActions => ({ journeyStage: status, waitingOn: "NONE", blockers: [], currentAction: { code: "NONE", kind: "NONE", exit }, availableActions: [] });
    for (const [status, exit, title] of [["CANCELLED", "WITHDRAWN", "You withdrew from this journey"], ["CANCELLED", "CANCELLED", "This case was cancelled"],
                                         ["EXPIRED", "EXPIRED", "This case has expired"], ["CLOSED", "COMPLETED", "Your care with us is complete"]]) {
      renderCare({ caseSummary: { ...base, status }, actions: ended(status, exit), deposit: null, patientProposal: null, proposal: null, onWithdraw: vi.fn() });
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull(); // the backend no longer offers it
      expect(within(screen.getByRole("region", { name: "Your coordinator" })).queryByRole("button")).toBeNull(); // no longer offered by the backend
      cleanup();
    }
    // Without an exit word the page falls back to the stage, as before.
    renderCare({ caseSummary: { ...base, status: "CANCELLED" }, actions: wait("NONE"), deposit: null, patientProposal: null, proposal: null });
    expect(screen.getByRole("heading", { name: "This case is closed" })).toBeTruthy();
  });

  it("offers one quiet withdraw action only when the backend allows it, and confirms before the one call (P0-2)", async () => {
    const onWithdraw = vi.fn().mockResolvedValue({});
    renderCare({ actions: { ...wait("WAIT_COORDINATION"), availableActions: ["MESSAGE_COORDINATOR", "WITHDRAW"] }, onWithdraw });
    const buttons = screen.getAllByRole("button", { name: "Withdraw from this journey" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].className).not.toMatch(/btn-primary/); // a quiet action in words, not a second call to action
    expect(screen.getByRole("heading", { name: "We are arranging your treatment" })).toBeTruthy();
    fireEvent.click(buttons[0]);
    const dialog = screen.getByRole("alertdialog", { name: "Withdraw from this journey?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep my case open" }));
    expect(onWithdraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw from this journey" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Yes, withdraw" }));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
    cleanup();
    // Not offered by the backend (travel confirmed, or an earlier stage): not rendered.
    renderCare({ actions: wait("WAIT_COORDINATION"), onWithdraw });
    expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull();
  });

  // A-02 (P0-3): one static note, never a live alert, telling the patient that an emergency is local care now.
  it("tells the patient to seek local care in an emergency, as a note in the care view only", () => {
    renderCare({ actions: wait("WAIT_COORDINATION") });
    const notes = screen.getAllByRole("note", { name: "If this is an emergency, seek local care now" });
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toMatch(/local emergency number/);
    expect(notes[0].closest("[role=alert]")).toBeNull();
    cleanup();
    renderCare({ actions: wait("WAIT_COORDINATION"), view: "documents" });
    expect(screen.queryByRole("note", { name: /emergency/i })).toBeNull();
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
  // D-1: the three moments are stamped only from the dates the backend recorded; never on another step, never without a date.
  it("stamps the three moments with the backend's dates, and nothing else", () => {
    const thisYear = new Date().getFullYear();
    const milestones = { receivedAt: `${thisYear}-09-01T09:00:00Z`, consultantReviewAt: `${thisYear}-09-04T09:00:00Z`, estimateReadyAt: `${thisYear}-09-12T09:00:00Z` };
    // The current page's own stamp; earlier pages of the file carry theirs on their sheets.
    const stampOf = () => document.querySelector(".dossier-page-stamp .case-stamp")?.textContent ?? null;
    renderCare({ actions: wait("WAIT_COORDINATOR_REVIEW"), caseSummary: { ...base, status: "RECEIVED" }, deposit: null, milestones });
    expect(stampOf()).toContain("Received, Sep 1");
    cleanup();
    renderCare({ actions: wait("WAIT_CONSULTANT_REVIEW"), deposit: null, milestones });
    expect(stampOf()).toContain("In review, Sep 4");
    cleanup();
    renderCare({ actions: focus("REVIEW_PROPOSAL"), patientProposal: { state: "READY", action: "REVIEW_PROPOSAL" }, deposit: null, milestones });
    expect(stampOf()).toContain("Estimate ready, Sep 12");
    cleanup();
    // A waiting step that is not one of the three carries none, even with every date known.
    renderCare({ milestones });
    expect(stampOf()).toBeNull();
    cleanup();
    // No recorded date, no stamp — never today.
    renderCare({ actions: wait("WAIT_CONSULTANT_REVIEW"), deposit: null, milestones: { receivedAt: milestones.receivedAt, consultantReviewAt: null } });
    expect(stampOf()).toBeNull();
  });

  it("makes My Care, Documents and Messages links to the view on this case; a plain click stays in the page", () => {
    const { onView } = renderCare();
    const nav = screen.getByRole("navigation", { name: "My Care" });
    expect(within(nav).getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["?case=c1", "?case=c1&view=documents", "?case=c1&view=messages"]);
    fireEvent.click(within(nav).getByRole("link", { name: "Documents" }));
    expect(onView).toHaveBeenCalledWith("documents");
    // A modified click is the browser's (new tab): the page does not change view.
    fireEvent.click(within(nav).getByRole("link", { name: "Messages" }), { ctrlKey: true });
    expect(onView).toHaveBeenCalledTimes(1);
  });
  // UX 1c-1: the file grows — each dated moment the journey reached is a stamped sheet behind the current page, and its
  // date sits under its journey step. No date, no sheet, no date line.
  it("draws the earlier pages of the file and the journey's dates only from the backend's dates", () => {
    const thisYear = new Date().getFullYear();
    const milestones = { receivedAt: `${thisYear}-09-01T09:00:00Z`, consultantReviewAt: `${thisYear}-09-04T09:00:00Z`, estimateReadyAt: `${thisYear}-09-12T09:00:00Z` };
    renderCare({ milestones });
    const sheets = screen.getByRole("list", { name: "Earlier in your file" });
    expect(within(sheets).getAllByRole("listitem").map(li => li.textContent)).toEqual([
      expect.stringContaining("Case received"), expect.stringContaining("Consultant review"), expect.stringContaining("Your proposal")]);
    expect(within(sheets).getAllByRole("listitem")[1].textContent).toContain("In review, Sep 4");
    expect(screen.getByText("Your file · 4 pages")).toBeTruthy();
    const journey = within(screen.getByRole("region", { name: "Your care journey" })).getByRole("list");
    expect(Array.from(journey.querySelectorAll("time")).map(time => time.getAttribute("datetime"))).toEqual(
      [milestones.receivedAt, milestones.consultantReviewAt, milestones.estimateReadyAt]);
    cleanup();
    // The moment the current page is stamped with is the page itself, not a sheet behind it; a step not reached has none.
    renderCare({ actions: wait("WAIT_CONSULTANT_REVIEW"), caseSummary: { ...base, status: "IN_REVIEW" }, deposit: null, patientProposal: null, proposal: null, milestones: { receivedAt: milestones.receivedAt, consultantReviewAt: milestones.consultantReviewAt } });
    expect(within(screen.getByRole("list", { name: "Earlier in your file" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Your file · 2 pages")).toBeTruthy();
    cleanup();
    // Nothing dated: the page stands alone and the journey prints no date.
    renderCare({ milestones: { receivedAt: null } });
    expect(screen.queryByRole("list", { name: "Earlier in your file" })).toBeNull();
    expect(document.querySelector(".care-journey time")).toBeNull();
  });

  it("draws the estimate on one scale: the workspace's range bracketed, the fee line split out, the deposit left to its own facts", () => {
    renderCare({ proposal: { ...proposal, documentType: "PRELIMINARY_ESTIMATE", totalMin: 4500, totalExpected: 4850, totalMax: 5600,
      items: [{ quantity: 1, unitPrice: 4250, optional: false, category: "MEDICAL" }, { quantity: 1, unitPrice: 600, optional: false, category: "PLATFORM_FEE" }] } });
    const estimate = screen.getByRole("region", { name: "Preliminary care estimate" });
    expect(within(estimate).getByRole("img").getAttribute("aria-label")).toBe(
      "Estimated range $4,500 to $5,600, expected $4,850. Made up of Medical care $4,250 and Coordination and guarantee fee $600.");
    expect(estimate.querySelector(".est-range")).toBeTruthy();
    // The deposit is stated once, in its own facts; the bar does not repeat it.
    expect(estimate.querySelector(".est-deposit")).toBeNull();
    cleanup();
    // Before 1c-0's totals reach a workspace: no range, no bracket; a final quote's total is its price.
    renderCare({ proposal: { ...proposal, documentType: "FINAL_TREATMENT_QUOTE" }, patientProposal: { state: "ACCEPTED", action: "VIEW_PROPOSAL", documentType: "FINAL_TREATMENT_QUOTE" } });
    const quote = screen.getByRole("region", { name: "Final treatment plan and quote" });
    expect(within(quote).getByRole("img").getAttribute("aria-label")).toBe("Final package price $4,850.");
    expect(quote.querySelector(".est-range, .est-deposit")).toBeNull();
  });

  it("tracks the deposit: checking with a Sent stamp, then received with Finance's date, and a bar only for a part payment", () => {
    const thisYear = new Date().getFullYear();
    renderCare({ deposit: { status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED", submittedAt: `${thisYear}-09-12T08:30:00Z` } } });
    const track = screen.getByRole("list", { name: "Payment steps" });
    expect(within(track).getAllByRole("listitem").map(li => li.getAttribute("aria-current"))).toEqual([null, "step", null]);
    expect(document.querySelector(".pay-receipt")?.textContent).toContain("Sent, Sep 12");
    expect(screen.getByText("FT123456")).toBeTruthy();
    // A sent reference has no amount: nothing fills a bar while it is checked.
    expect(screen.queryByRole("img", { name: /deposit received/ })).toBeNull();
    cleanup();
    renderCare({ actions: wait("WAIT_COORDINATION"), deposit: { status: "PAID", currency: "USD", totalDisplay: 500, paidDisplay: 500,
      transfer: { reference: "FT123456", status: "CONFIRMED", submittedAt: `${thisYear}-09-12T08:30:00Z`, decidedAt: `${thisYear}-09-14T10:00:00Z` } } });
    expect(within(screen.getByRole("list", { name: "Payment steps" })).getAllByRole("listitem").every(li => li.textContent?.includes("(completed)"))).toBe(true);
    expect(document.querySelector(".pay-receipt")?.textContent).toContain("Received, Sep 14");
    expect(document.querySelector(".pay-receipt")?.textContent).not.toContain("Sent");
    cleanup();
    // Confirmed without a recorded decision date: the receipt stays, unstamped.
    renderCare({ actions: wait("WAIT_COORDINATION"), deposit: { status: "PAID", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "CONFIRMED" } } });
    expect(document.querySelector(".pay-receipt .case-stamp")).toBeNull();
    cleanup();
    renderCare({ actions: wait("WAIT_COORDINATION"), deposit: { status: "PARTIALLY_PAID", currency: "USD", totalDisplay: 500, paidDisplay: 200, balanceDisplay: 300 } });
    expect(screen.getByRole("img", { name: "$200 of the $500 deposit received. $300 remaining." })).toBeTruthy();
  });

  it("draws the payment track and receipt in Arabic with the reference left-to-right", () => {
    renderWithWork(<MyCare locale="ar" caseSummary={base} actions={wait("WAIT_PAYMENT_CHECK")} patientProposal={accepted} proposal={proposal}
                   deposit={{ status: "REQUESTED", currency: "USD", totalDisplay: 500, transfer: { reference: "FT123456", status: "SUBMITTED", submittedAt: "2026-09-12T08:30:00Z" } }} documents={[]} unreadMessages={0} cases={[base]}
                   view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}/>, "ar");
    expect(screen.getByRole("list", { name: "خطوات الدفع" })).toBeTruthy();
    expect(screen.getByText("FT123456").closest("bdi")?.getAttribute("dir")).toBe("ltr");
  });

});
