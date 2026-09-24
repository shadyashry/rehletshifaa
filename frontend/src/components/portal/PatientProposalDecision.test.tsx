import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PatientProposalDecision } from "./CaseMessages";

/** The signed-in decision path must show the same deposit terms before an estimate is acknowledged (F1). */
describe("PatientProposalDecision", () => {
  afterEach(cleanup);

  it("shows the deposit, refund and cancellation terms before a signed-in patient acknowledges an estimate", () => {
    render(<PatientProposalDecision locale="en" caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE" }} mutate={vi.fn()} />);
    const terms = screen.getByRole("region", { name: "Coordination deposit, refunds and cancellation" });
    const ack = screen.getByRole("checkbox");
    expect(terms.compareDocumentPosition(ack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ack.getAttribute("aria-describedby")).toBe("portal-deposit-terms");
    expect(screen.getByText(/This is a preliminary, non-binding estimate, not a final price or a price guarantee/)).toBeTruthy();
  });

  it("asks a final-quote decision to accept, says it is not medical consent, and shows no deposit terms", () => {
    render(<PatientProposalDecision locale="en" caseId="c1" proposal={{ versionId: "v2", documentType: "FINAL_TREATMENT_QUOTE" }} mutate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Accept final treatment plan and quote" })).toBeTruthy();
    expect(screen.getByText(/Accepting this quote is not medical consent/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Coordination deposit, refunds and cancellation" })).toBeNull();
  });
});
