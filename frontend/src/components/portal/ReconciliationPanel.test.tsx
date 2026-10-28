import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { ReconciliationPanel, type SettlementRole } from "./ReconciliationPanel";
import type { ReconciliationView, StaffStatement } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-17 session 2: the Finance reconciliation workbench and the statements against the mocked settlement API. */
// Odd figures on purpose: the panel shows what the API returns and never adds anything up.
const quote: ReconciliationView["quote"] = [
  { source: "PACKAGE", matchedId: null, orderNumber: "RS-AV-RS-2026-000123-1", description: "Coronary stent package", quantity: 1, authorisedEgp: 200000 },
  { source: "CHANGE_ORDER_LINE", matchedId: "col-1", orderNumber: "RS-CO-RS-2026-000123-2", kind: "EXTRA_NIGHT", description: "Extra ICU night", quantity: 2, authorisedEgp: 24691 },
];
const notOpened: ReconciliationView = {
  caseId: "c1", caseStatus: "DISCHARGED", needsCountersign: false, quote, lines: [], statements: [], facilityName: "Nile Heart Hospital",
  finalInvoice: { evidenceId: "e9", invoiceNumber: "NHH-FI-42", amountEgp: 227345.67, issuedAt: "2026-10-25T10:00:00Z", documentId: "d1", countersigned: false },
};
const open: ReconciliationView = { ...notOpened, reconciliationId: "r1", status: "OPEN", authorisedEgp: 224691, bandLimitEgp: 15000, openedAt: "2026-10-25T12:00:00Z",
  finalInvoice: { ...notOpened.finalInvoice!, countersigned: true } };
const statement: StaffStatement = {
  id: "s1", kind: "DISCHARGE", statementNumber: "RS-ST-RS-2026-000123-1", revision: 1, current: true, issuedAt: "2026-10-26T09:00:00Z", displayCurrency: "USD", fxRate: 0.0204,
  totals: { packageEgp: 200000, changeOrdersEgp: 24691, medicalChargedEgp: 224691, platformFeeEgp: 33703.65, totalChargedEgp: 258394.65, totalChargedDisplay: 5271.25, depositPaidEgp: 38759.2,
    feeBalancePaidEgp: 0, paidAtFacilityEgp: 224000, refundedEgp: 0, balanceDueEgp: 0, balanceDueDisplay: 0, creditDueEgp: 4364.55, creditDueDisplay: 89.04 },
  lines: [{ kind: "PACKAGE", description: "Coronary stent package", amountEgp: 200000, amountDisplay: 4080 }, { kind: "DEPOSIT_PAID", amountEgp: -38759.2, amountDisplay: -790.69 }],
};
const awaiting: ReconciliationView = { ...open, status: "AWAITING_COUNTERSIGN", needsCountersign: true, chargedEgp: 224691, varianceEgp: 2654.67, disputedEgp: 2654.67, paidAtFacilityEgp: 224000,
  submittedAt: "2026-10-25T13:00:00Z",
  lines: [
    { lineNo: 1, description: "Package", invoiceEgp: 200000, source: "PACKAGE", authorisedEgp: 200000, chargedEgp: 200000, varianceEgp: 0, varianceCode: "WITHIN_BAND" },
    { lineNo: 2, description: "Telemetry", invoiceEgp: 2654.67, source: "NONE", authorisedEgp: null, chargedEgp: 0, varianceEgp: 2654.67, varianceCode: "UNAPPROVED_EXTRA" },
  ] };
const settled: ReconciliationView = { ...awaiting, status: "DISPUTED", needsCountersign: false, settledAt: "2026-10-26T09:00:00Z", statements: [statement] };

function setup(role: SettlementRole, props: { currentCode?: string; data?: ReconciliationView } = {}) {
  const data = props.data ?? notOpened;
  const mutate = vi.fn().mockResolvedValue(data);
  const load = vi.fn().mockResolvedValue(data) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<ReconciliationPanel locale="en" role={role} caseId="c1" caseStatus="DISCHARGED" currentCode={props.currentCode} busy={false} mutate={mutate} load={load}/>, "en");
  return { mutate, load };
}
const primaries = () => [...document.querySelectorAll("#reconciliation-panel .btn-primary")];

describe("ReconciliationPanel — Finance", () => {
  afterEach(cleanup);

  it("opens the reconciliation on RECONCILE_INVOICE after a confirmation that names the step-up", async () => {
    const { mutate, load } = setup("finance", { currentCode: "RECONCILE_INVOICE" });
    expect(await screen.findByRole("heading", { name: "Reconciliation" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/finance/cases/c1/reconciliation");
    expect(screen.getByText("Not opened")).toBeTruthy();
    expect(screen.getByText(/Final invoice .*NHH-FI-42/)).toBeTruthy();
    // The two columns: the quote side is listed before anything is submitted.
    expect(screen.getByText("Coronary stent package")).toBeTruthy();
    expect(screen.getByText("No line submitted yet.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Open the reconciliation" });
    expect(primaries()).toEqual([button]);
    fireEvent.click(button);
    const dialog = screen.getByRole("alertdialog", { name: "Open the reconciliation?" });
    expect(dialog.textContent).toContain("sign in again");
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/reconciliation", undefined));
  });

  it("matches the invoice lines against the package, a change-order line and nothing, and submits them", async () => {
    const { mutate } = setup("finance", { currentCode: "RECONCILE_INVOICE", data: open });
    const form = (await screen.findByText("Match the invoice lines", { selector: "summary" })).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    expect(primaries()).toEqual([scope.getByRole("button", { name: "Submit the reconciliation" })]);
    const fill = (index: number, description: string, amount: string, match: string) => {
      fireEvent.change(scope.getAllByLabelText("Description on the invoice")[index], { target: { value: description } });
      fireEvent.change(scope.getAllByLabelText("Amount (EGP)")[index], { target: { value: amount } });
      fireEvent.change(scope.getAllByLabelText("Authorised by")[index], { target: { value: match } });
    };
    fill(0, "Package", "200000", "PACKAGE");
    fireEvent.click(scope.getByRole("button", { name: "Add a line" }));
    fill(1, "ICU nights", "24691", "LINE:col-1");
    fireEvent.click(scope.getByRole("button", { name: "Add a line" }));
    fill(2, "Telemetry", "2654.67", "NONE");
    fireEvent.change(scope.getByLabelText("Why it was not authorised"), { target: { value: "BILLING_ERROR" } });
    expect(scope.getByText(/^Lines entered: .*227,345\.67 of .*227,345\.67$/)).toBeTruthy();
    fireEvent.change(scope.getByLabelText("Paid at the hospital (EGP)"), { target: { value: "224000" } });
    fireEvent.submit(scope.getByRole("button", { name: "Submit the reconciliation" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/reconciliation/submit", {
      lines: [
        { description: "Package", invoiceEgp: 200000, source: "PACKAGE", matchedId: null, code: null },
        { description: "ICU nights", invoiceEgp: 24691, source: "CHANGE_ORDER_LINE", matchedId: "col-1", code: null },
        { description: "Telemetry", invoiceEgp: 2654.67, source: "NONE", matchedId: null, code: "BILLING_ERROR" },
      ],
      paidAtFacilityEgp: 224000, note: null }));
  });

  it("shows the variance codes as returned and waits for a Finance Manager above the band", async () => {
    setup("finance", { currentCode: "RECONCILE_INVOICE", data: awaiting });
    expect(await screen.findByText("Unapproved extra · not charged")).toBeTruthy();
    expect(screen.getByText("At the package price")).toBeTruthy();
    expect(screen.getByText("The variance is above the band: a Finance Manager approves it.")).toBeTruthy();
    expect(screen.getByText("A Finance Manager approves it or returns it to Finance.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(primaries()).toEqual([]);
  });
});

describe("ReconciliationPanel — Finance Manager", () => {
  afterEach(cleanup);

  it("approves from the COUNTERSIGN_RECONCILIATION work item, or returns it with what to correct", async () => {
    const { mutate } = setup("finance", { currentCode: "COUNTERSIGN_RECONCILIATION", data: awaiting });
    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(primaries()).toEqual([approve]);
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole("alertdialog", { name: "Approve this reconciliation?" }).querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/reconciliation/countersign", { decision: "APPROVE", note: null }));
    fireEvent.change(screen.getByLabelText("What Finance should correct"), { target: { value: "Line 2 is a billing error" } });
    fireEvent.submit(screen.getByLabelText("What Finance should correct").closest("form")!);
    fireEvent.click(screen.getByRole("alertdialog", { name: "Return this reconciliation?" }).querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/reconciliation/countersign", { decision: "RETURN", note: "Line 2 is a billing error" }));
  });

  it("settles the facility dispute from FACILITY_DISPUTE and lists the statement with its e-invoice slot", async () => {
    const { mutate } = setup("finance", { currentCode: "FACILITY_DISPUTE", data: settled });
    expect(await screen.findByText(/was billed but not charged to the patient/)).toBeTruthy();
    const resolve = screen.getByRole("button", { name: "Record the outcome" });
    expect(primaries()).toEqual([resolve]);
    fireEvent.change(screen.getByLabelText("How it ended"), { target: { value: "FACILITY_WITHDREW" } });
    fireEvent.submit(resolve.closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/reconciliation/dispute/resolve", { outcome: "FACILITY_WITHDREW", note: null }));
    // The statement, exactly as returned, and the patient's credit to refund.
    expect(screen.getByRole("heading", { name: /Statement\W+RS-ST-RS-2026-000123-1/ })).toBeTruthy();
    expect(screen.getByText("Credit due")).toBeTruthy();
    expect(screen.getByText(/The patient has a credit of .*4,364\.55/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("E-invoice reference"), { target: { value: "ETA-77" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record the reference" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/statements/s1/e-invoice", { reference: "ETA-77" }));
  });

  it("is read-only for the coordinator (Operations reads it as the Discharge panel's state line)", async () => {
    setup("coordinator", { data: settled });
    expect(await screen.findByText("Disputed with the hospital")).toBeTruthy();
    expect(screen.getByText("A Finance Manager settles it with the hospital.")).toBeTruthy();
    expect(document.querySelectorAll("#reconciliation-panel form")).toHaveLength(0);
    expect(document.querySelectorAll("#reconciliation-panel button")).toHaveLength(0);
  });
});
