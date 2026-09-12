import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  // The sticky bar observes the decision block; jsdom has no IntersectionObserver.
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {} disconnect() {} unobserve() {}
  };
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ProposalSign } from "./ProposalSign";
import { composeProposalComment } from "./ProposalDecisionDialog";

const summary = { caseNumber: "RS-2026-000030", channel: "WHATSAPP", destinationHint: "•••• 7898", whatsappHint: "•••• 7898", emailHint: null };

const proposal = {
  caseNumber: "RS-2026-000030", patientName: "Mohamed Ahmed", documentType: "PRELIMINARY_ESTIMATE",
  versionNumber: 1, currency: "USD",
  items: [
    { id: "i1", category: "MEDICAL", description: "Exercise stress test", quantity: 1, unitPrice: 150, optional: false },
    { id: "i2", category: "MEDICAL", description: "Diagnostic coronary angiography", quantity: 1, unitPrice: 1800, optional: false },
    { id: "i3", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 6250, optional: false },
  ],
  totalExpected: 8200, includedServices: "Stress test; angiography; pacemaker implant",
  validUntil: "2026-10-01T00:00:00Z", decided: false,
  recommendedTreatment: "Dual-chamber pacemaker implantation", depositDueDisplay: 820, consultantName: "Dr. Yasmine Farouk",
};

/** Every network call the page makes, in the order the flow makes them. */
function mockApi({ decisionStatus = 200 }: { decisionStatus?: number } = {}) {
  const decisionBody = vi.fn();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/decision")) {
      decisionBody(JSON.parse(String(init?.body)));
      return { ok: decisionStatus === 200, status: decisionStatus, json: async () => ({ message: "nope" }) } as Response;
    }
    if (path.endsWith("/request-access")) return { ok: true, status: 200, json: async () => summary } as Response;
    if (path.endsWith("/verify")) return { ok: true, status: 200, json: async () => ({ grant: "grant-1" }) } as Response;
    if (path.endsWith("/view")) return { ok: true, status: 200, json: async () => proposal } as Response;
    return { ok: true, status: 200, json: async () => summary } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { decisionBody };
}

/** Walk the OTP gate so the tests can assert against the proposal itself. */
async function openProposal() {
  render(<ProposalSign locale="en" token="tok-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Send code" }));
  const code = await screen.findByLabelText("Enter the 6-digit code");
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await screen.findByRole("heading", { name: "Your preliminary care estimate" });
}

describe("ProposalSign", () => {
  beforeEach(() => mockApi());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("answers the five questions above the fold: what, how much, what's included, what next, what to click", async () => {
    await openProposal();
    expect(screen.getByText("Dual-chamber pacemaker implantation")).toBeTruthy();
    expect(within(screen.getByLabelText("Estimate summary")).getByText("$8,200")).toBeTruthy();
    expect(screen.getByText("Included in this estimate")).toBeTruthy();
    expect(screen.getByText("What happens next")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acknowledge & continue" })).toBeTruthy();
  });

  it("shows the proposal in the currency the backend issued it in, never a local re-conversion", async () => {
    await openProposal();
    // Every line and the total use the proposal's own currency.
    expect(screen.getByText("$150")).toBeTruthy();
    expect(screen.getByText("$1,800")).toBeTruthy();
    expect(screen.getByText("$6,250")).toBeTruthy();
    expect(screen.getAllByText("$8,200").length).toBeGreaterThan(0);
    expect(screen.queryByText(/EGP/)).toBeNull();
  });

  it("keeps one dominant action, with request-changes secondary and decline behind a disclosure", async () => {
    await openProposal();
    const primary = screen.getByRole("button", { name: "Acknowledge & continue" });
    expect(primary.className).toContain("btn-primary");
    const secondary = screen.getByRole("button", { name: "Request changes" });
    expect(secondary.className).not.toContain("btn-primary");
    // Decline exists but is never a peer of the normal path.
    expect(screen.getByText("More options")).toBeTruthy();
    const decline = screen.getByRole("button", { name: "Decline estimate" });
    expect(decline.className).not.toContain("btn-primary");
  });

  it("will not submit the primary decision until the acknowledgement is confirmed", async () => {
    const { decisionBody } = mockApi();
    await openProposal();
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge & continue" }));
    expect(await screen.findByText("Please confirm you understand before continuing.")).toBeTruthy();
    expect(decisionBody).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge & continue" }));
    await waitFor(() => expect(decisionBody).toHaveBeenCalledWith(expect.objectContaining({
      decision: "ACKNOWLEDGED", grant: "grant-1", acknowledgementAccepted: true,
    })));
    expect(await screen.findByText("Thank you — your estimate is acknowledged")).toBeTruthy();
  });

  it("sends a request for changes with the patient's topic and message", async () => {
    const { decisionBody } = mockApi();
    await openProposal();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    fireEvent.click(await screen.findByRole("radio", { name: "The estimated cost" }));
    fireEvent.change(screen.getByLabelText(/Your message/), { target: { value: "Higher than I expected" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(decisionBody).toHaveBeenCalledWith(expect.objectContaining({
      decision: "REVISION_REQUESTED", comment: "The estimated cost - Higher than I expected",
    })));
    expect(decisionBody.mock.calls[0][0].acknowledgementAccepted).toBeUndefined();
    expect(await screen.findByText("Your request was sent")).toBeTruthy();
  });

  it("requires a topic and a message before a change request can be sent", async () => {
    const { decisionBody } = mockApi();
    await openProposal();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send request" }));
    expect(screen.getByText("Choose a topic to continue.")).toBeTruthy();
    expect(decisionBody).not.toHaveBeenCalled();
  });

  it("confirms a decline in its own dialog rather than on the page", async () => {
    const { decisionBody } = mockApi();
    await openProposal();
    fireEvent.click(screen.getByRole("button", { name: "Decline estimate" }));
    fireEvent.change(await screen.findByLabelText(/Your message/), { target: { value: "Treating locally" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));

    await waitFor(() => expect(decisionBody).toHaveBeenCalledWith(expect.objectContaining({ decision: "DECLINED", comment: "Treating locally" })));
    expect(decisionBody.mock.calls[0][0].acknowledgementAccepted).toBeUndefined();
    expect(await screen.findByText("Your response was recorded")).toBeTruthy();
  });

  it("explains an expired document instead of leaving a dead button", async () => {
    mockApi({ decisionStatus: 410 });
    await openProposal();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge & continue" }));

    expect(await screen.findByText(/This estimate has expired/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Acknowledge & continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline estimate" })).toBeNull();
  });

  it("explains a superseded document rather than showing a raw backend error", async () => {
    mockApi({ decisionStatus: 409 });
    await openProposal();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge & continue" }));

    expect(await screen.findByText(/newer version of this document/)).toBeTruthy();
    expect(screen.queryByText("nope")).toBeNull();
  });

  it("offers no decision at all on a document that was already answered", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/verify")) return { ok: true, status: 200, json: async () => ({ grant: "g" }) } as Response;
      if (path.endsWith("/view")) return { ok: true, status: 200, json: async () => ({ ...proposal, decided: true, decisionState: "ACCEPTED" }) } as Response;
      return { ok: true, status: 200, json: async () => summary } as Response;
    }));
    await openProposal();
    expect(screen.getByText(/decision has already been recorded/)).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Acknowledge & continue" })).toBeNull();
  });

  it("attributes the recommendation to the consultant the backend named", async () => {
    await openProposal();
    // The name sits in its own dir="auto" span, so match the composed line rather than one text node.
    expect(screen.getByText(/Reviewed by/).textContent).toContain("Dr. Yasmine Farouk");
  });

  it("gives the patient a heading structure and a labelled acknowledgement", async () => {
    await openProposal();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);
    const ack = screen.getByRole("checkbox");
    expect(ack.getAttribute("aria-describedby")).toBeTruthy();
    // The short promise is the label; the legal detail is associated, not lost.
    expect(screen.getByText("I understand this is a preliminary estimate based on remote review.")).toBeTruthy();
    expect(screen.getByText(/final treatment plan and price may increase or decrease/)).toBeTruthy();
  });

  // ---- arriving from a verified Check Case Status session ----

  it("opens straight to the proposal with the grant handed over from Check Case Status, once", async () => {
    sessionStorage.setItem("rs-proposal-grant:tok-1", JSON.stringify({ grant: "handed-grant", expiresAt: "2099-01-01T00:00:00Z" }));
    render(<ProposalSign locale="en" token="tok-1" />);
    await screen.findByRole("heading", { name: "Your preliminary care estimate" });
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const paths = fetchMock.mock.calls.map(call => String(call[0]));
    expect(paths.some(path => path.endsWith("/request-access") || path.endsWith("/verify"))).toBe(false); // no second code
    const view = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/view"));
    expect(JSON.parse(String((view?.[1] as RequestInit).body))).toEqual({ grant: "handed-grant" });
    expect(sessionStorage.getItem("rs-proposal-grant:tok-1")).toBeNull(); // consumed on first use
  });

  it("falls back to its own verification when the handed-over grant is no longer good", async () => {
    sessionStorage.setItem("rs-proposal-grant:tok-1", JSON.stringify({ grant: "stale-grant", expiresAt: "2099-01-01T00:00:00Z" }));
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.endsWith("/view")) return { ok: false, status: 401, json: async () => ({ message: "verify" }) } as Response;
      return { ok: true, status: 200, json: async () => summary } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProposalSign locale="en" token="tok-1" />);
    expect(await screen.findByRole("button", { name: "Send code" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your preliminary care estimate" })).toBeNull();
  });
});

describe("composeProposalComment", () => {
  it("keeps a stable English topic for the coordinator and passes the patient's words through", () => {
    expect(composeProposalComment("COST", "  too high  ")).toBe("The estimated cost - too high");
    expect(composeProposalComment("COST", "")).toBe("The estimated cost");
    expect(composeProposalComment("", "just this")).toBe("just this");
  });
});
