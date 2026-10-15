import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// jsdom implements <dialog> only partially, and has no IntersectionObserver (the sticky decision bar uses one).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {} disconnect() {} unobserve() {}
  };
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { PriceSection } from "@/components/home/PriceSection";
import { FeedbackContext } from "@/components/portal/portal-ui";
import { PatientProposal, PatientProposalDecision } from "@/components/portal/PatientProposal";
import { ProposalSign } from "@/components/ProposalSign";
import { getDictionary } from "@/lib/dictionary";
import { intlLocale } from "@/lib/i18n";

const en = getDictionary("en");
const ar = getDictionary("ar");
const summary = { caseNumber: "RS-2026-000030", channel: "WHATSAPP", destinationHint: "•••• 7898", whatsappHint: "•••• 7898", emailHint: null };
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
/** The stored English text the API still sends for the fee line; no page may show it. */
const STORED_FEE_TEXT = "Coordination and guarantee fee (stored)";

const estimate = {
  caseNumber: "RS-2026-000030", patientName: "Test Patient", documentType: "PRELIMINARY_ESTIMATE", versionNumber: 1, currency: "EGP",
  items: [
    { id: "i1", category: "MEDICAL", description: "Angiography", quantity: 1, unitPrice: 10000, optional: false },
    { id: "i2", category: "PLATFORM_FEE", description: STORED_FEE_TEXT, quantity: 1, unitPrice: 1500, optional: false },
  ],
  totalMin: 10000, totalExpected: 11500, totalMax: 13000, validUntil: inHours(24 * 20), decided: false, recommendedTreatment: "Angiography",
};
const finalQuote = { ...estimate, documentType: "FINAL_TREATMENT_QUOTE", totalMin: undefined, totalMax: undefined };

/** Opens a document through the Check Case Status hand-over, the decision answering with `decision`. */
async function openDocument(doc: Record<string, unknown>, locale: "en" | "ar" = "en", decision?: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    if (path.endsWith("/view")) return { ok: true, status: 200, json: async () => doc } as Response;
    if (path.endsWith("/decision") && decision) return { ok: false, status: decision.status, json: async () => decision.body } as Response;
    return { ok: true, status: 200, json: async () => summary } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.setItem("rs-proposal-grant:tok-1", JSON.stringify({ grant: "g", expiresAt: "2099-01-01T00:00:00Z" }));
  render(<ProposalSign locale={locale} token="tok-1" />);
  await screen.findByRole("heading", { level: 1 });
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("the platform fee line", () => {
  it("is worded in English from one key, with what it covers, never from the stored text", async () => {
    await openDocument(estimate);
    expect(screen.getByText(en.portalProposal.price.feeLabel)).toBeInTheDocument();
    expect(screen.getByText(en.portalProposal.price.feeNote)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(STORED_FEE_TEXT);
  });

  it("is worded in Arabic from its own key", async () => {
    await openDocument(estimate, "ar");
    expect(screen.getByText(ar.portalProposal.price.feeLabel)).toBeInTheDocument();
    expect(screen.getByText(ar.portalProposal.price.feeNote)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(STORED_FEE_TEXT);
  });

  it("does not split the medical lines into raw category groups, and does not count as a service", async () => {
    await openDocument(estimate);
    expect(document.body.textContent).not.toMatch(/PLATFORM_FEE|MEDICAL/);
    expect(within(screen.getByLabelText("Estimate summary")).getByText("1 service")).toBeInTheDocument();
  });

  it("is also worded on the signed-in patient's proposal, in both languages", () => {
    const items = estimate.items.map(({ id, category, description, quantity, unitPrice, optional }) => ({ id, category, description, quantity, unitPrice, optional }));
    const data = { versionId: "v1", status: "RELEASED", currency: "EGP", documentType: "PRELIMINARY_ESTIMATE", items };
    const first = render(<PatientProposal locale="en" copy={en.portalProposal} proposal={data} />);
    expect(screen.getByText(en.portalProposal.price.feeLabel)).toBeInTheDocument();
    expect(first.container.textContent).not.toContain(STORED_FEE_TEXT);
    first.unmount();
    const second = render(<PatientProposal locale="ar" copy={ar.portalProposal} proposal={data} />);
    expect(screen.getByText(ar.portalProposal.price.feeLabel)).toBeInTheDocument();
    expect(second.container.textContent).not.toContain(STORED_FEE_TEXT);
  });
});

describe("How your price works", () => {
  it.each([["en", en], ["ar", ar]] as const)("shows the three steps and the guarantee from the %s keys on the estimate", async (locale, dictionary) => {
    await openDocument(estimate, locale);
    const price = dictionary.portalProposal.price;
    const panel = screen.getByRole("region", { name: price.how.title });
    const steps = within(panel).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent(price.how.steps[0].title);
    expect(steps[1]).toHaveTextContent(price.how.steps[1].title);
    expect(steps[2]).toHaveTextContent(price.how.protectTitle);
    // The wording of the promise is one key per language: counsel's text is a copy change.
    expect(steps[2]).toHaveTextContent(price.guarantee);
  });

  it("promises no refund, and says the maximum, the reason in writing and the 24 hours", () => {
    expect(en.portalProposal.price.guarantee).toMatch(/will not be higher than the maximum shown here/);
    expect(en.portalProposal.price.guarantee).toMatch(/in writing/);
    expect(en.portalProposal.price.guarantee).toMatch(/at least 24 hours/);
    expect(en.portalProposal.price.guarantee).not.toMatch(/refund/i);
    expect(ar.portalProposal.price.guarantee).not.toMatch(/استرداد|استرجاع/);
  });

  it.each([["en", en], ["ar", ar]] as const)("is the same three steps on the home page in %s", (_locale, dictionary) => {
    render(<PriceSection d={dictionary} />);
    const price = dictionary.portalProposal.price;
    expect(screen.getByRole("heading", { name: price.how.title })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(price.guarantee)).toBeInTheDocument();
  });
});

describe("a final quote on the secure link", () => {
  it("shows the Consultant's reason for the change prominently, before the recommendation", async () => {
    await openDocument({ ...finalQuote, scopeChangeReason: "The scan found a second blocked artery." });
    const heading = screen.getByRole("heading", { name: en.portalProposal.price.scopeChange.title });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("The scan found a second blocked artery.")).toBeInTheDocument();
    const recommendation = document.getElementById("recommendation-heading")!;
    expect(heading.compareDocumentPosition(recommendation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("during the cooling period says when it can be accepted and keeps the accept action unavailable", async () => {
    const opens = inHours(10);
    await openDocument({ ...finalQuote, acceptableFrom: opens });
    const time = new Intl.DateTimeFormat(intlLocale("en"), { dateStyle: "long", timeStyle: "short" }).format(new Date(opens));
    const note = screen.getByRole("status", { name: "" });
    expect(note).toHaveTextContent(time);
    const accept = screen.getByRole("button", { name: "Accept & continue" });
    expect(accept).toBeDisabled();
    expect(accept.getAttribute("aria-describedby")).toBe(note.id);
    // Asking for changes and declining are never held.
    expect(screen.getByRole("button", { name: "Request changes" })).toBeEnabled();
  });

  it("offers the accept action once the cooling period has passed", async () => {
    await openDocument({ ...finalQuote, acceptableFrom: inHours(-1) });
    expect(screen.getByRole("button", { name: "Accept & continue" })).toBeEnabled();
    expect(screen.queryByText(/you have time to decide/)).toBeNull();
  });

  it("while Finance checks the exchange rate says nothing needs doing and keeps accept unavailable", async () => {
    await openDocument({ ...finalQuote, fxReapprovalStatus: "PENDING" });
    expect(screen.getByText(en.portalProposal.price.fxPending)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept & continue" })).toBeDisabled();
  });

  it("explains a refused acceptance (COOLING_PERIOD) in place, not as a replaced document", async () => {
    await openDocument(finalQuote, "en", { status: 409, body: { code: "COOLING_PERIOD", message: "Your treatment plan changed (English server text)" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Accept & continue" }));
    expect(await screen.findByText(en.portalProposal.price.cooling.unknown)).toBeInTheDocument();
    expect(screen.queryByText(/newer version of this document/)).toBeNull();
    expect(screen.queryByText(/English server text/)).toBeNull();
    expect(screen.getByRole("button", { name: "Accept & continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeEnabled();
  });

  it("explains a refused acceptance (FX_REAPPROVAL_REQUIRED) as Finance checking the rate", async () => {
    await openDocument(finalQuote, "en", { status: 409, body: { code: "FX_REAPPROVAL_REQUIRED", message: "The exchange rate has moved" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Accept & continue" }));
    expect(await screen.findByText(en.portalProposal.price.fxPending)).toBeInTheDocument();
    expect(screen.queryByText(/newer version of this document/)).toBeNull();
  });

  it("still treats any other 409 as a replaced document", async () => {
    await openDocument(finalQuote, "en", { status: 409, body: { code: "PROPOSAL_NOT_OPEN" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Accept & continue" }));
    expect(await screen.findByText(/newer version of this document/)).toBeInTheDocument();
  });
});

describe("a final quote in the signed-in portal", () => {
  const quoteData = (extra: Record<string, unknown>) => ({ versionId: "v2", status: "RELEASED", currency: "EGP", documentType: "FINAL_TREATMENT_QUOTE",
    items: [{ id: "i1", description: "Angiography", quantity: 1, unitPrice: 10000, optional: false }], ...extra });
  const showDecision = (proposal: Record<string, unknown>, feedback = {}, mutate = vi.fn()) => render(
    <FeedbackContext.Provider value={{ notice: "", error: "", clear: () => {}, clearNotice: () => {}, ...feedback }}>
      <PatientProposal locale="en" copy={en.portalProposal} proposal={quoteData(proposal)}
        decision={<PatientProposalDecision locale="en" copy={en.portalProposal} caseId="c1" proposal={quoteData(proposal)} mutate={mutate} />} />
    </FeedbackContext.Provider>);

  it("shows the reason, and the time it can be accepted, with accept unavailable until then", () => {
    const opens = inHours(8);
    showDecision({ scopeChangeReason: "A second procedure is needed.", acceptableFrom: opens });
    expect(screen.getByText("A second procedure is needed.")).toBeInTheDocument();
    const time = new Intl.DateTimeFormat(intlLocale("en"), { dateStyle: "long", timeStyle: "short" }).format(new Date(opens));
    expect(screen.getByRole("status")).toHaveTextContent(time);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: en.portalProposal.primaryQuote })).toBeDisabled();
    expect(screen.getByRole("button", { name: en.portalProposal.requestChanges })).toBeEnabled();
  });

  it("shows the rate check while Finance looks at it", () => {
    showDecision({ fxReapprovalStatus: "PENDING" });
    expect(screen.getByText(en.portalProposal.price.fxPending)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: en.portalProposal.primaryQuote })).toBeDisabled();
  });

  it("answers a server refusal (FX_REAPPROVAL_REQUIRED) with the rate note, not 'not sent'", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    showDecision({}, { errorCode: "FX_REAPPROVAL_REQUIRED", errorPath: "/patient/cases/c1/proposals/v2/decision" }, mutate);
    expect(screen.getByText(en.portalProposal.price.fxPending)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.portalProposal.requestChanges }));
    // The note-required rule applies first; the refusal never turns into the offline message.
    expect(screen.queryByText(en.portalProposal.decisionFailed)).toBeNull();
  });

  it("answers a server refusal (COOLING_PERIOD) with the cooling note and keeps accept unavailable", async () => {
    showDecision({}, { errorCode: "COOLING_PERIOD", errorPath: "/patient/cases/c1/proposals/v2/decision" });
    expect(screen.getByText(en.portalProposal.price.cooling.unknown)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByRole("button", { name: en.portalProposal.primaryQuote })).toBeDisabled());
  });

  it("ignores a refusal that belongs to another proposal", () => {
    showDecision({}, { errorCode: "COOLING_PERIOD", errorPath: "/patient/cases/c9/proposals/other/decision" });
    expect(screen.queryByText(en.portalProposal.price.cooling.unknown)).toBeNull();
  });
});
