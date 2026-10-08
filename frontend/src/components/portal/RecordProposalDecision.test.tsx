import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { MoreActions } from "./CoordinatorActions";
import { RecordProposalDecision } from "./RecordProposalDecision";
import { renderWithWork, workCopyFor } from "./test-copy";

const t = workCopyFor("en").recordDecision;
const estimate = { versionId: "v1", versionNumber: 2, documentType: "PRELIMINARY_ESTIMATE" };

describe("recording a patient's proposal decision", () => {
  afterEach(cleanup);

  it("asks for the decision and the attestation before anything is sent", () => {
    const mutate = vi.fn();
    renderWithWork(<RecordProposalDecision locale="en" caseId="c1" proposal={estimate} busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(t.decisionRequired)).toBeTruthy();
    expect(screen.getByText(t.attestRequired)).toBeTruthy();
  });

  it("refuses an empty or future conversation time and focuses it", () => {
    const mutate = vi.fn();
    renderWithWork(<RecordProposalDecision locale="en" caseId="c1" proposal={estimate} busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("radio", { name: t.acknowledge }));
    fireEvent.click(screen.getByRole("checkbox", { name: t.attestEstimate }));
    const when = screen.getByLabelText(t.when);
    fireEvent.change(when, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(t.whenInvalid)).toBeTruthy();
    expect(document.activeElement).toBe(when);
    fireEvent.change(when, { target: { value: "2999-01-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("needs a note for a change request", () => {
    const mutate = vi.fn();
    renderWithWork(<RecordProposalDecision locale="en" caseId="c1" proposal={estimate} busy={false} mutate={mutate}/>);
    fireEvent.click(screen.getByRole("radio", { name: t.changes }));
    fireEvent.click(screen.getByRole("checkbox", { name: t.attestEstimate }));
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(t.noteRequired)).toBeTruthy();
  });

  it("records the decision with who confirmed it, how and when", async () => {
    const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
    renderWithWork(<RecordProposalDecision locale="en" caseId="c1" proposal={estimate} busy={false} mutate={mutate}/>);
    expect(screen.getByText("Preliminary estimate, version 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: t.acknowledge }));
    fireEvent.click(screen.getByRole("radio", { name: t.representative }));
    fireEvent.change(screen.getByRole("combobox", { name: t.channel }), { target: { value: "WHATSAPP_CALL" } });
    fireEvent.click(screen.getByRole("checkbox", { name: t.attestEstimate }));
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [path, body] = mutate.mock.calls[0];
    expect(path).toBe("/coordinator/cases/c1/proposals/v1/decision/on-behalf");
    expect(body).toMatchObject({ decision: "ACKNOWLEDGED", channel: "WHATSAPP_CALL", confirmedBy: "REPRESENTATIVE", attested: true });
    expect(new Date(body.conversationAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("offers accepting, not acknowledging, on a final quote, and reports a failure in place", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    renderWithWork(<RecordProposalDecision locale="en" caseId="c1" proposal={{ versionId: "v9", documentType: "FINAL_TREATMENT_QUOTE" }} busy={false} mutate={mutate}/>);
    expect(screen.queryByRole("radio", { name: t.acknowledge })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: t.accept }));
    fireEvent.click(screen.getByRole("checkbox", { name: t.attestQuote }));
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText(t.failed)).toBeTruthy();
  });

  it("is offered in More actions only when the backend lists it", () => {
    const onRecordDecision = vi.fn();
    renderWithWork(<MoreActions locale="en" caseId="c1" version={1} travelPackage={false} busy={false} mutate={vi.fn()} available={["RECORD_PROPOSAL_DECISION"]}
      onRequestInformation={vi.fn()} onRecordResponse={vi.fn()} onRecordDecision={onRecordDecision}/>);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.title) }));
    expect(onRecordDecision).toHaveBeenCalled();
    cleanup();
    renderWithWork(<MoreActions locale="en" caseId="c1" version={1} travelPackage={false} busy={false} mutate={vi.fn()} available={[]}
      onRequestInformation={vi.fn()} onRecordResponse={vi.fn()} onRecordDecision={onRecordDecision}/>);
    expect(screen.queryByRole("button", { name: new RegExp(t.title) })).toBeNull();
  });
});
