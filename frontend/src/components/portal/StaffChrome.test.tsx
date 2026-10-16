import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import { CaseQueue, initialQueue } from "./CaseQueue";
import { CurrentActionPanel } from "./CurrentAction";
import { RoleDashboardSummary } from "./RoleDashboardSummary";
import { renderWithWork } from "./test-copy";

afterEach(cleanup);

// UX area 2, slice 2-4: quieter chrome — the count line in ink unless the overdue work is yours, the count line's filter
// carried to the list it opened, and the strip's reply and facts.
describe("staff chrome (UX 2-4)", () => {
  it("says a teammate's overdue case in the line's ink, and only overdue work of yours in the alert ink", () => {
    const cases = [{ status: "INTAKE_REVIEW", coordinatorSubject: "someone-else", overdueTaskCount: 1 }];
    renderWithWork(<RoleDashboardSummary role="coordinator" cases={cases} tasks={[]}/>);
    expect(screen.getByRole("button", { name: "1 case overdue" }).className).toContain("text-ink-800");
    cleanup();

    renderWithWork(<RoleDashboardSummary role="coordinator" cases={cases} tasks={[{ overdue: true, status: "OPEN" }]}/>);
    expect(screen.getByRole("button", { name: "1 case overdue" }).className).toContain("text-alert-700");
  });

  it("shows the count line's filter on the list it opened, as a chip that removes it", () => {
    const onChange = vi.fn();
    renderWithWork(<CaseQueue locale="en" role="coordinator" subject="me" lead={false} busy={false} scope="mine" labelledBy="portal-title"
      cases={[{ id: "c1", caseNumber: "RS-2026-000001", status: "INTAKE_REVIEW", country: "LY", coordinatorSubject: "me", overdueTaskCount: 1 } as never]}
      state={{ ...initialQueue, view: "mine", tab: "mine", kpi: "overdue" }} onChange={onChange} onOpen={vi.fn()} onMutate={vi.fn()}
      statusLabel={value => value} categoryLabel={value => value}/>);
    expect(document.querySelector("section")?.getAttribute("aria-labelledby")).toBe("portal-title");
    expect(screen.getByText("Showing:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Showing: Overdue" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kpi: "" }));
  });

  it("puts the facts after the patient's reply under review, and says the strip's reply opens a dialog", () => {
    renderWithWork(<CurrentActionPanel locale="en" role="coordinator"
      action={{ code: "WORK_ITEM", kind: "COMPLETE", workType: "REVIEW_PATIENT_RESPONSE", title: "Review the patient's reply" }}
      response={{ message: "I uploaded the echo report." }} facts={<p>Waiting on you</p>}
      secondary={[{ label: "Reply to the patient", onClick: vi.fn(), opensDialog: true }]}/>);
    const reply = screen.getByText("I uploaded the echo report.");
    const facts = screen.getByText("Waiting on you");
    expect(reply.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply to the patient" }).getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("keeps the facts before the work when there is no reply to read", () => {
    renderWithWork(<CurrentActionPanel locale="en" role="coordinator" action={{ code: "ASSIGN_CONSULTANT", kind: "FOCUS" }}
      facts={<p>Waiting on you</p>} form={<button type="button">Assign</button>}/>);
    const facts = screen.getByText("Waiting on you");
    expect(facts.compareDocumentPosition(screen.getByRole("button", { name: "Assign" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
