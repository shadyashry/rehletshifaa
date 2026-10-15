import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { MyCare } from "./MyCare";
import { PatientAdmission } from "./PatientAdmission";
import type { CaseActions } from "./CurrentAction";
import type { PatientAdmissionView } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-15 session 2: the patient's arrival, voucher and balance steps inside My Care, against the mocked patient admission API. */
const base = { id: "c1", caseNumber: "RS-2026-000123", status: "ARRIVAL_CONFIRMED", careCategory: "cardiology", coordinatorName: "Sara Ahmed", waitingOn: "PATIENT", updatedAt: "2026-10-19T09:00:00Z" };
const step = (code: string, kind: "FOCUS" | "WAIT", status = base.status): CaseActions =>
  ({ journeyStage: status, waitingOn: "PATIENT", blockers: [], currentAction: { code, kind }, availableActions: ["MESSAGE_COORDINATOR"] });
// Odd figures on purpose: the page shows what the API returns and never works anything out from the voucher.
const due: PatientAdmissionView = { facilityName: "Nile Heart Hospital", facilityCity: "Cairo", plannedAdmissionAt: "2026-10-20T08:00:00Z", voucherNumber: "RS-V-RS-2026-000123-1",
  payAtFacilityEgp: 195432.1, payAtFacilityDisplay: 3987.65, feeBalanceEgp: 1250, feeBalanceDisplay: 25.5, depositCreditEgp: 4500, displayCurrency: "USD", balanceState: "DUE", cleared: false };

function renderStep(code: string, kind: "FOCUS" | "WAIT", view: PatientAdmissionView | Error, { status = base.status, locale = "en" as "en" | "ar" } = {}) {
  const mutate = vi.fn().mockResolvedValue({ status: "SAVED" });
  const load = vi.fn(() => view instanceof Error ? Promise.reject(view) : Promise.resolve(view)) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<MyCare locale={locale} caseSummary={{ ...base, status }} actions={step(code, kind, status)} documents={[]} unreadMessages={0} cases={[{ ...base, status }]}
                         view="care" onView={vi.fn()} onOpenCase={vi.fn()} onOpenProposal={vi.fn()} messagesPanel={null}
                         admissionStep={<PatientAdmission locale={locale} caseId="c1" code={code} busy={false} mutate={mutate} load={load}/>}/>, locale);
  return { mutate, load };
}

describe("My Care admission steps", () => {
  afterEach(cleanup);

  it("CONFIRM_ARRIVAL: the step's one action, sent only after a confirmation", async () => {
    const { mutate, load } = renderStep("CONFIRM_ARRIVAL", "FOCUS", { ...due, voucherNumber: null, balanceState: "NO_VOUCHER" }, { status: "TRAVEL_COORDINATION" });
    expect(screen.getByRole("heading", { name: "Tell us when you have arrived" })).toBeTruthy();
    expect(await screen.findByText("Nile Heart Hospital")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/patient/cases/c1/admission");
    const arrived = screen.getByRole("button", { name: "I have arrived" });
    expect(arrived.className).toContain("btn-primary");
    expect(document.querySelectorAll("main .btn-primary, .my-care-step .btn-primary")).toHaveLength(1);
    fireEvent.click(arrived);
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Confirm your arrival?" });
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/arrived", {}));
  });

  it("PAY_BALANCE: the voucher number and what to pay where, as returned, in EGP and at the frozen rate", async () => {
    renderStep("PAY_BALANCE", "FOCUS", due);
    expect(screen.getByRole("heading", { name: "Pay the balance at the hospital" })).toBeTruthy();
    expect(await screen.findByText("RS-V-RS-2026-000123-1")).toBeTruthy();
    expect(screen.getByText("EGP 195,432.10")).toBeTruthy();
    expect(screen.getByText(/About.*\$3,987\.65.*at the rate fixed on your quote/)).toBeTruthy();
    expect(screen.getByText("EGP 4,500")).toBeTruthy();
    expect(screen.getByText("Platform fee still to pay")).toBeTruthy();
    expect(screen.getByText("EGP 1,250")).toBeTruthy();
    expect(screen.getByText("To pay")).toBeTruthy();
    // Paid at the cashier, not here: no button in the step.
    expect(screen.queryByRole("button", { name: /pay/i })).toBeNull();
  });

  it("WAIT_BALANCE_CHECK: the receipt is being checked and nothing is needed", async () => {
    renderStep("WAIT_BALANCE_CHECK", "WAIT", { ...due, feeBalanceEgp: 0, feeBalanceDisplay: 0, balanceState: "CHECKING" });
    expect(screen.getByRole("heading", { name: "We are checking your hospital receipt" })).toBeTruthy();
    expect(await screen.findByText("Checking")).toBeTruthy();
    expect(screen.queryByText("Platform fee still to pay")).toBeNull();
    expect(screen.getByText("No action is required from you right now.")).toBeTruthy();
  });

  it("CLEARED_FOR_ADMISSION: says when, and the journey is at Treatment", async () => {
    renderStep("CLEARED_FOR_ADMISSION", "WAIT", { ...due, balanceState: "PAID", cleared: true }, { status: "ADMISSION_READY" });
    expect(screen.getByRole("heading", { name: "You are cleared for admission" })).toBeTruthy();
    expect(await screen.findByText(/^You are cleared for admission on October 20, 2026/)).toBeTruthy();
    // Paid: the amounts are history, not a step.
    expect(screen.queryByText("Pay at the hospital cashier")).toBeNull();
    expect(screen.getByText("Treatment").closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("without a reservation (empty answer) shows the step alone", async () => {
    const { load } = renderStep("PAY_BALANCE", "FOCUS", new Error("empty body"));
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Pay the balance at the hospital" })).toBeTruthy();
    expect(screen.queryByText("Voucher number")).toBeNull();
  });

  it("reads in Arabic with the amounts isolated", async () => {
    renderStep("PAY_BALANCE", "FOCUS", due, { locale: "ar" });
    expect(screen.getByRole("heading", { name: "ادفع الرصيد في المستشفى" })).toBeTruthy();
    expect(await screen.findByText("رقم القسيمة")).toBeTruthy();
    expect(screen.getByText("RS-V-RS-2026-000123-1").closest("bdi")?.getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("مستحق الدفع")).toBeTruthy();
  });
});
