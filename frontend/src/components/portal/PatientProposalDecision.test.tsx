import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { estimateTerms, finalQuoteTerms } from "@/lib/commercial-terms";
import { getDictionary } from "@/lib/dictionary";

import { PatientProposal, PatientProposalDecision, patientProposalStatus } from "./PatientProposal";

const en = getDictionary("en").portalProposal;
const ar = getDictionary("ar").portalProposal;
const estimate = { versionId: "v1", status: "RELEASED", currency: "USD", validUntil: "2026-12-31T00:00:00Z", documentType: "PRELIMINARY_ESTIMATE",
  items: [{ id: "i1", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 4850, optional: false }] };

describe("PatientProposalDecision", () => {
  afterEach(cleanup);

  it("keeps the deposit terms referenced by the acknowledgement on an estimate (F1)", () => {
    render(<><span id="portal-deposit-terms" /><PatientProposalDecision locale="en" copy={en} caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE" }} mutate={vi.fn()} /></>);
    expect(screen.getByRole("checkbox").getAttribute("aria-describedby")).toBe("portal-deposit-terms");
    expect(screen.getByRole("button", { name: "Acknowledge estimate & continue" })).toHaveProperty("disabled", true);
  });

  it("asks a final-quote decision to accept", () => {
    render(<PatientProposalDecision locale="en" copy={en} caseId="c1" proposal={{ versionId: "v2", documentType: "FINAL_TREATMENT_QUOTE" }} mutate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Accept final treatment plan and quote" })).toBeTruthy();
  });

  it("offers the coordinator in Arabic instead of a dead acknowledgement while the Arabic terms await legal approval", async () => {
    const request = vi.fn().mockResolvedValue({ requestedAt: "2026-10-08T10:00:00Z" });
    render(<PatientProposalDecision locale="ar" copy={ar} caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE" }} mutate={vi.fn()}
      coordinatorName="Layla Hassan" englishHref="/en/portal?case=c1" onRequestAssistance={request} />);
    // No checkbox and no primary that can never be used.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: ar.primaryEstimate })).toBeNull();
    expect(screen.getByText(ar.assisted.explain)).toBeTruthy();
    expect(screen.queryByText(/الإنجليزية/, { selector: "p.max-w-[60ch]" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Layla Hassan/ }));
    expect(request).toHaveBeenCalledWith("/patient/cases/c1/proposals/v1/assistance");
    expect(screen.getByRole("link", { name: ar.assisted.englishLink }).getAttribute("href")).toBe("/en/portal?case=c1");
    expect(screen.getByRole("button", { name: ar.requestChanges })).toBeTruthy();
  });

  it("says the request was made, after a reload", () => {
    render(<PatientProposalDecision locale="ar" copy={ar} caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE", assistance: { requestedAt: "2026-10-08T10:00:00Z" } }} mutate={vi.fn()} onMessage={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain(ar.assisted.nameFallback);
    expect(screen.queryByRole("button", { name: /مراجعة الشروط/ })).toBeNull();
    expect(screen.getByRole("button", { name: ar.assisted.message })).toBeTruthy();
  });

  it("keeps Decline quiet and confirms it inside the drawer, not in a browser dialog", () => {
    const mutate = vi.fn().mockResolvedValue(true);
    const confirm = vi.spyOn(window, "confirm");
    render(<PatientProposalDecision locale="en" copy={en} caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE" }} mutate={mutate} />);
    fireEvent.click(screen.getByRole("button", { name: en.declineQuiet }));
    expect(screen.getByText(en.declineConsequence)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.declineKeep }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.declineQuiet }));
    fireEvent.click(screen.getByRole("button", { name: en.decline }));
    expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/proposals/v1/decision", { decision: "DECLINED", selectedOptionalItemIds: [], comment: undefined });
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("asks for a note before sending a change request", () => {
    const mutate = vi.fn().mockResolvedValue(true);
    render(<PatientProposalDecision locale="en" copy={en} caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE" }} mutate={mutate} />);
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(en.noteRequired);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Can the stay be shorter?" } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/proposals/v1/decision", { decision: "REVISION_REQUESTED", selectedOptionalItemIds: [], comment: "Can the stay be shorter?" });
  });
});

describe("PatientProposalDecision failures and variants", () => {
  afterEach(cleanup);

  it("reports a failed decision inside the drawer, where the patient can see it", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    render(<PatientProposalDecision locale="en" copy={en} caseId="c1" proposal={{ versionId: "v1", documentType: "PRELIMINARY_ESTIMATE" }} mutate={mutate} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge estimate & continue" }));
    expect(await screen.findByText(en.decisionFailed)).toBeTruthy();
  });

  it("states only that it was recorded when the channel or confirmer is unknown", () => {
    render(<PatientProposal locale="en" copy={en} proposal={{ ...estimate, status: "ACCEPTED", assistance: { decisionSource: "RECORDED_ON_BEHALF", recordedByName: "Layla Hassan", channel: "CARRIER_PIGEON", confirmedBy: "PATIENT", conversationAt: "2026-10-08T10:00:00Z" } }} />);
    const line = screen.getByText(/Recorded by .*Layla Hassan/);
    expect(line.textContent).not.toMatch(/phone call|with you/);
  });

  it("names the payment terms, not the deposit terms, on an Arabic final quote", () => {
    render(<PatientProposalDecision locale="ar" copy={ar} caseId="c1" proposal={{ versionId: "v2", documentType: "FINAL_TREATMENT_QUOTE" }} mutate={vi.fn()} />);
    expect(screen.getByText(ar.assisted.explainQuote)).toBeTruthy();
  });

  it("shows who recorded a decision and how, with a way to dispute it", () => {
    render(<PatientProposal locale="en" copy={en} proposal={{ ...estimate, status: "ACCEPTED", assistance: { decisionSource: "RECORDED_ON_BEHALF", recordedByName: "Layla Hassan", channel: "WHATSAPP_CALL", confirmedBy: "REPRESENTATIVE", conversationAt: "2026-10-08T10:00:00Z" } }} />);
    expect(screen.getByText(/Recorded by ⁨Layla Hassan⁩ on October 8, 2026, after a WhatsApp call with your representative./)).toBeTruthy();
    expect(screen.getByText(new RegExp(en.assisted.dispute))).toBeTruthy();
  });
});

describe("PatientProposal", () => {
  afterEach(cleanup);

  it("reads price first, then how firm it is, with the terms open while a decision is owed and pending legal review", () => {
    render(<PatientProposal locale="en" copy={en} proposal={estimate} decision={<p>decision</p>} />);
    expect(screen.getByText(en.totalLabel).nextElementSibling?.textContent).toBe("$4,850");
    expect(screen.getByText(/Ready for your decision/)).toBeTruthy();
    expect(screen.getByText(/Valid until December 31, 2026/)).toBeTruthy();
    expect(screen.queryByText(/RELEASED|v1/)).toBeNull();
    const terms = screen.getByText(en.termsEstimate).closest("details")!;
    expect(terms.open).toBe(true);
    expect(terms.textContent).toContain(en.pendingReview);
    expect(terms.textContent).toContain("Coordination deposit, refunds and cancellation");
    const honesty = screen.getByText(en.honestyEstimate);
    expect(honesty.compareDocumentPosition(terms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the terms closed when no decision is owed", () => {
    render(<PatientProposal locale="en" copy={en} proposal={{ ...estimate, status: "ACCEPTED" }} />);
    expect(screen.getByText(en.termsEstimate).closest("details")!.open).toBe(false);
  });

  it("keeps the English honesty lines identical to the approved commercial wording", () => {
    expect(en.honestyEstimate).toBe(`${estimateTerms.nonBinding} ${estimateTerms.mayChange}`);
    expect(en.honestyQuote).toBe(`${finalQuoteTerms.basis} ${finalQuoteTerms.notMedicalConsent}`);
  });

  it("names every patient-visible status in plain words and never shows an internal value", () => {
    for (const status of ["RELEASED", "VIEWED", "ACCEPTED", "DECLINED", "REVISION_REQUESTED", "EXPIRED", "SUPERSEDED", "SOMETHING_NEW"]) {
      for (const copy of [en, ar]) expect(patientProposalStatus(copy, status, false)).not.toMatch(/[A-Z]{2,}_|^[A-Z_]+$/);
    }
    expect(patientProposalStatus(en, "ACCEPTED", true)).toBe("You accepted this quote");
    expect(patientProposalStatus(en, "SOMETHING_NEW", false)).toBe("Proposal");
  });
});
