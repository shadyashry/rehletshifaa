import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { RefundForm } from "./RefundForm";
import { renderWithWork, workCopyFor } from "./test-copy";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

describe("Finance refund policy reason", () => {
  it.each(["en", "ar"] as const)("confirms the amount, typed reason and optional detail in %s", async locale => {
    const onRecord = vi.fn().mockResolvedValue(true);
    const work = workCopyFor(locale); const t = work.caseView.deposit;
    renderWithWork(<RefundForm locale={locale} busy={false} onRecord={onRecord} />, locale);
    const selector = screen.getByRole("combobox", { name: t.reason });
    expect((selector as HTMLSelectElement).required).toBe(true);
    expect(screen.getAllByRole("option")).toHaveLength(8);
    fireEvent.change(screen.getByLabelText(t.amount), { target: { value: "250" } });
    fireEvent.change(selector, { target: { value: "FACILITY_CANCELLED" } });
    fireEvent.change(screen.getByLabelText(t.reasonDetail), { target: { value: "Facility unable to accept" } });
    fireEvent.click(screen.getByRole("button", { name: t.refund }));
    expect(onRecord).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain(t.refundReasons.FACILITY_CANCELLED);
    expect(dialog.textContent).toContain("Facility unable to accept");
    fireEvent.click(within(dialog).getByRole("button", { name: work.confirm.refund }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledWith({ amountEgp: 250, reasonCode: "FACILITY_CANCELLED", reason: "Facility unable to accept", idempotencyKey: expect.any(String) }));
  });

  it("keeps a refused refund in the form so Finance can correct it", async () => {
    const onRecord = vi.fn().mockResolvedValue(undefined);
    const work = workCopyFor("en");
    renderWithWork(<RefundForm locale="en" busy={false} onRecord={onRecord} />);
    fireEvent.change(screen.getByLabelText("Amount (EGP)"), { target: { value: "500" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "PATIENT_NO_SHOW" } });
    fireEvent.click(screen.getByRole("button", { name: "Record a refund" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: work.confirm.refund }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    expect((screen.getByLabelText("Amount (EGP)") as HTMLInputElement).value).toBe("500");
  });
});
