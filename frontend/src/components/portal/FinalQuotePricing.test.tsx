import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { getDictionary } from "@/lib/dictionary";

import { FeedbackContext } from "./portal-ui";
import { FxReapproval } from "./FxReapproval";
import { CaseWorkspaceProvider, FinalQuoteActions } from "./StaffCaseView";
import { renderWithWork } from "./test-copy";

// jsdom implements <dialog> only partially.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

const price = getDictionary("en").portalProposal.price;
const priceAr = getDictionary("ar").portalProposal.price;

describe("Finance's exchange-rate re-approval", () => {
  const setup = (locale: "en" | "ar" = "en", mutate = vi.fn().mockResolvedValue({ status: "SAVED" })) => {
    render(<FxReapproval locale={locale} copy={(locale === "en" ? price : priceAr).fxReapproval} caseId="c1" versionId="v2" currency="USD" total={1200}
      commercial={{ versionId: "v2", currency: "USD", fxRate: 0.0204, fxRateDate: "2026-10-01", requiresFinanceApproval: false, displayTotal: 1200, lines: [] }} busy={false} mutate={mutate} />);
    return mutate;
  };

  it("shows the frozen figure and rate and two actions, nothing sent before a confirmation", () => {
    const mutate = setup();
    expect(screen.getByRole("heading", { name: price.fxReapproval.title })).toBeInTheDocument();
    expect(screen.getByText("$1,200")).toBeInTheDocument();
    expect(screen.getByText("0.0204")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: price.fxReapproval.keep }));
    expect(screen.getByRole("alertdialog", { name: price.fxReapproval.keepTitle })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("shows today's total and rate beside the frozen ones when the view carries them", () => {
    render(<FxReapproval locale="en" copy={price.fxReapproval} caseId="c1" versionId="v2" currency="USD" total={1200}
      commercial={{ versionId: "v2", currency: "USD", fxRate: 0.0204, fxRateDate: "2026-10-01", fxReapprovalRate: 0.019, fxReapprovalTotal: 1116, requiresFinanceApproval: false, displayTotal: 1200, lines: [] }} busy={false} mutate={vi.fn()} />);
    expect(screen.getByText("$1,116")).toBeInTheDocument();
    expect(screen.getByText(/7%/)).toBeInTheDocument();
    expect(screen.getByText("0.019")).toBeInTheDocument();
    expect(screen.getByText("$1,200")).toBeInTheDocument();
  });

  it("keeps the frozen rate through its own confirmation", () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole("button", { name: price.fxReapproval.keep }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: price.fxReapproval.keep }));
    expect(mutate).toHaveBeenCalledExactlyOnceWith("/finance/cases/c1/final-quotes/v2/fx-rate/confirm");
  });

  it("re-releases at today's rate through its own confirmation", () => {
    const mutate = setup();
    fireEvent.click(screen.getByRole("button", { name: price.fxReapproval.reprice }));
    const dialog = screen.getByRole("alertdialog", { name: price.fxReapproval.repriceTitle });
    expect(dialog).toHaveTextContent(price.fxReapproval.repriceBody);
    fireEvent.click(within(dialog).getByRole("button", { name: price.fxReapproval.reprice }));
    expect(mutate).toHaveBeenCalledExactlyOnceWith("/finance/cases/c1/final-quotes/v2/fx-rate/reprice");
  });

  it("sends nothing when the confirmation is cancelled, and speaks Arabic", () => {
    const mutate = setup("ar");
    fireEvent.click(screen.getByRole("button", { name: priceAr.fxReapproval.reprice }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: priceAr.fxReapproval.cancel }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: priceAr.fxReapproval.title })).toBeInTheDocument();
  });
});

describe("The coordinator's final-quote form", () => {
  const setup = (feedback: Record<string, unknown> = {}) => {
    const mutate = vi.fn().mockResolvedValue({ id: "r1" });
    renderWithWork(
      <FeedbackContext.Provider value={{ notice: "", error: "", clear: () => {}, clearNotice: () => {}, ...feedback }}>
        <CaseWorkspaceProvider value={{ locale: "en", t: {} as never, role: "coordinator", c: { id: "c1", status: "ARRIVAL_CONFIRMED", version: 1 } as never,
          busy: false, mutate, price, fxRates: [], catalog: [], facilities: [], mySubject: "coord" }}>
          <FinalQuoteActions reviewId="r-1" />
        </CaseWorkspaceProvider>
      </FeedbackContext.Provider>);
    return mutate;
  };

  it("leaves the date empty by default, says what that means, and sends no validUntil", () => {
    const mutate = setup();
    expect(screen.getByLabelText(price.coordinator.validUntil)).toHaveValue("");
    expect(screen.getByText(price.coordinator.validUntilHint)).toBeInTheDocument();
    expect(price.coordinator.validUntilHint).toBe("Leave empty for 14 days from sending; you can only shorten it.");
    fireEvent.click(screen.getByRole("button", { name: "Create final quote" }));
    const body = mutate.mock.calls[0][1] as Record<string, unknown>;
    expect(mutate.mock.calls[0][0]).toBe("/coordinator/cases/c1/final-quotes");
    expect(body.clinicalReviewId).toBe("r-1");
    expect("validUntil" in JSON.parse(JSON.stringify(body))).toBe(false);
  });

  it("sends the shorter date the coordinator chose, as the end of that day", () => {
    const mutate = setup();
    const date = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString("en-CA");
    fireEvent.change(screen.getByLabelText(price.coordinator.validUntil), { target: { value: date } });
    fireEvent.click(screen.getByRole("button", { name: "Create final quote" }));
    const sent = (mutate.mock.calls[0][1] as { validUntil: string }).validUntil;
    expect(new Date(sent).getTime()).toBe(new Date(`${date}T23:59:59`).getTime());
  });

  it("shows SCOPE_CHANGE_REASON_REQUIRED next to the reason field, and QUOTE_VALIDITY_TOO_LONG next to the date", () => {
    cleanup();
    setup({ errorCode: "SCOPE_CHANGE_REASON_REQUIRED", errorPath: "/coordinator/cases/c1/final-quotes" });
    const reason = screen.getByLabelText(/Why the scope changed/);
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason.getAttribute("aria-describedby")).toBe("final-quote-scope-error");
    expect(screen.getByRole("alert")).toHaveTextContent(price.coordinator.scopeRequired);
    cleanup();
    setup({ errorCode: "QUOTE_VALIDITY_TOO_LONG", errorPath: "/coordinator/cases/c1/final-quotes" });
    const date = screen.getByLabelText(price.coordinator.validUntil);
    expect(date).toHaveAttribute("aria-invalid", "true");
    expect(date.getAttribute("aria-describedby")).toContain("final-quote-validity-error");
    expect(screen.getByRole("alert")).toHaveTextContent(price.coordinator.validityTooLong);
  });

  it("ignores a refusal that came from another case's request", () => {
    setup({ errorCode: "SCOPE_CHANGE_REASON_REQUIRED", errorPath: "/coordinator/cases/other/final-quotes" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
