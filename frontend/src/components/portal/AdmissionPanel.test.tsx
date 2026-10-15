import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { AdmissionPanel, type AdmissionRole } from "./AdmissionPanel";
import type { AdmissionView } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-15 session 2: the staff "Admission & money" panel against the mocked admission API. */
const facilities = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "CURRENT", packages: [] }];
const documents = [{ documentId: "d1", fileName: "admission-letter.pdf", status: "CLEAN" }, { documentId: "d2", fileName: "scan.pdf", status: "PENDING" }];

const empty: AdmissionView = { caseId: "c1", caseStatus: "TRAVEL_COORDINATION", pointOfNoReturnApproved: false, emergencyOverride: false,
  admissionBlockers: ["FINAL_QUOTE_NOT_ACCEPTED", "VOUCHER_NOT_ISSUED", "BALANCE_NOT_EVIDENCED"], evidence: [] };
// Deliberately odd numbers: the panel must show what the API returns, never a sum of its own.
const voucher = { id: "v1", voucherNumber: "RS-V-RS-2026-000123-1", revision: 1, status: "ISSUED", packageTotalEgp: 200000, platformFeeEgp: 30000,
  depositPaidEgp: 34500, depositCreditEgp: 4500, feeBalanceEgp: 0, patientPaysAtFacilityEgp: 195432.1, displayCurrency: "USD", fxRate: 0.0204,
  fxRateDate: "2026-10-12", patientPaysAtFacilityDisplay: 3987.65, feeBalanceDisplay: 0, issuedAt: "2026-10-13T09:00:00Z" };
const letterRow = { id: "e1", kind: "FACILITY_ADMISSION_LETTER", documentId: "d1", reference: "NHH-77", amountEgp: 230000, recordedRole: "OPERATIONS",
  recordedAt: "2026-10-12T10:00:00Z", superseded: false };
const reserved: AdmissionView = { ...empty, caseStatus: "ARRIVAL_CONFIRMED", admissionId: "a1", facilityId: "f1", facilityName: "Nile Heart Hospital", facilityCity: "Cairo",
  plannedAdmissionAt: "2026-10-20T08:00:00Z", admissionStatus: "CONFIRMED", letterCheck: "WITHIN_ESTIMATE", letterReferenceMaxEgp: 240000, voucher,
  balanceOwedEgp: 195432.1, feeBalanceOwedEgp: 0, admissionBlockers: ["BALANCE_NOT_EVIDENCED"],
  evidence: [{ ...letterRow, countersignedRole: "FINANCE", countersignedAt: "2026-10-12T12:00:00Z" }] };

function setup(role: AdmissionRole, view: AdmissionView, props: { caseStatus?: string; currentCode?: string; locale?: "en" | "ar"; result?: unknown } = {}) {
  const mutate = vi.fn().mockResolvedValue(props.result ?? view);
  const load = vi.fn().mockResolvedValue(view) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<AdmissionPanel locale={props.locale ?? "en"} role={role} caseId="c1" caseStatus={props.caseStatus ?? view.caseStatus ?? "ARRIVAL_CONFIRMED"}
                                 currentCode={props.currentCode} documents={documents} facilities={facilities} busy={false} mutate={mutate} load={load}/>, props.locale ?? "en");
  return { mutate, load };
}

describe("AdmissionPanel — Operations", () => {
  afterEach(cleanup);

  it("reads its own role's view and opens the reservation as the one primary action", async () => {
    const { mutate, load } = setup("operations", empty);
    expect(await screen.findByText("No hospital is reserved yet.")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/operations/cases/c1/admission");
    expect(screen.getByText("The final quote is not accepted")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Save" }).filter(b => b.className.includes("btn-primary"))).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Hospital" }), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Planned admission"), { target: { value: "2026-10-20T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission", { facilityId: "f1", plannedAdmissionAt: new Date("2026-10-20T10:00").toISOString() }));
  });

  it("shows the voucher amounts exactly as returned and records the cashier receipt", async () => {
    const { mutate } = setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    expect(await screen.findByText("RS-V-RS-2026-000123-1")).toBeTruthy();
    expect(screen.getAllByText("EGP 195,432.10").length).toBeGreaterThan(0);
    expect(screen.getByText("$3,987.65")).toBeTruthy();
    expect(screen.getByText("The hospital balance is not evidenced (cashier receipt countersigned by Finance)")).toBeTruthy();
    // The receipt is the next thing to do: its form is open and its button is the panel's primary.
    const receipt = screen.getByText("Record the hospital receipt").closest("details")!;
    expect(receipt.open).toBe(true);
    const form = within(receipt);
    fireEvent.change(form.getByLabelText("Receipt number"), { target: { value: "CASH-991" } });
    fireEvent.change(form.getByLabelText("Amount (EGP)"), { target: { value: "195432.10" } });
    fireEvent.change(form.getByLabelText("Paid at"), { target: { value: "2026-10-19T09:30" } });
    fireEvent.change(form.getByLabelText("Method"), { target: { value: "CARD" } });
    fireEvent.change(form.getByLabelText("Receipt copy (optional)"), { target: { value: "d1" } });
    fireEvent.change(form.getByLabelText("Paid in currency (optional)"), { target: { value: "usd" } });
    fireEvent.change(form.getByLabelText("Amount paid in that currency (optional)"), { target: { value: "3987.65" } });
    const record = form.getByRole("button", { name: "Record" });
    expect(record.className).toContain("btn-primary");
    fireEvent.click(record);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/balance", {
      receiptNumber: "CASH-991", amountEgp: 195432.1, paidAt: new Date("2026-10-19T09:30").toISOString(), method: "CARD", documentId: "d1", paidCurrency: "USD", paidAmount: 3987.65 }));
    // A pending document is never offered as evidence.
    expect(form.queryByRole("option", { name: "scan.pdf" })).toBeNull();
  });

  it("records the hospital's letter with the quoted EGP package", async () => {
    const { mutate } = setup("operations", { ...reserved, letterCheck: "REFUSED", voucher: null, balanceOwedEgp: null });
    const letter = (await screen.findByText("Record the admission letter")).closest("details")!;
    expect(letter.open).toBe(true);
    const form = within(letter);
    fireEvent.change(form.getByLabelText("Letter (a checked document on the case)"), { target: { value: "d1" } });
    fireEvent.change(form.getByLabelText("Quoted package (EGP)"), { target: { value: "230000" } });
    fireEvent.click(form.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/letter", { documentId: "d1", quotedPackageEgp: 230000, reference: null }));
    expect(screen.getByText("Refused by Finance — a new letter is needed")).toBeTruthy();
  });

  it("once cleared, records the admission number and offers nothing before it", async () => {
    const { mutate } = setup("operations", { ...reserved, caseStatus: "ADMISSION_READY", balanceOwedEgp: 0, admissionBlockers: [] },
      { caseStatus: "ADMISSION_READY", currentCode: "RECORD_ADMISSION_NUMBER" });
    expect(await screen.findByText("Nothing stands between the patient and admission.")).toBeTruthy();
    expect(screen.queryByText("Record the hospital receipt")).toBeNull();
    expect(screen.queryByText("Change the reservation")).toBeNull();
    fireEvent.change(screen.getByLabelText("Hospital admission number"), { target: { value: " ADM-5521 " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/number", { admissionNumber: "ADM-5521" }));
  });
});

describe("AdmissionPanel — Finance", () => {
  afterEach(cleanup);
  const variance: AdmissionView = { ...reserved, letterCheck: "VARIANCE_OPEN", voucher: null, balanceOwedEgp: null, evidence: [letterRow] };

  it("needs a reason to accept a price above the estimate, then sends the decision", async () => {
    const { mutate, load } = setup("finance", variance, { caseStatus: "TRAVEL_COORDINATION" });
    const accept = await screen.findByRole("button", { name: "Accept the letter" });
    expect(load).toHaveBeenCalledWith("/finance/cases/c1/admission");
    fireEvent.click(accept);
    expect(screen.getByRole("alert").textContent).toBe("Give a reason: the price is above the accepted estimate.");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Hospital added an ICU night" } });
    fireEvent.click(accept);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/admission/letter/decision", { evidenceId: "e1", decision: "ACCEPT", note: "Hospital added an ICU night" }));
  });

  it("refuses a letter only with a reason", async () => {
    const { mutate } = setup("finance", { ...variance, letterCheck: "CHECK_PENDING" });
    fireEvent.click(await screen.findByRole("button", { name: "Refuse the letter" }));
    expect(screen.getByRole("alert").textContent).toBe("Give the reason for refusing the letter.");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Wrong patient name" } });
    fireEvent.click(screen.getByRole("button", { name: "Refuse the letter" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/admission/letter/decision", { evidenceId: "e1", decision: "REFUSE", note: "Wrong patient name" }));
  });

  it("countersigns a recorded receipt after a confirmation", async () => {
    const receipt = { id: "e7", kind: "BALANCE_EVIDENCED", reference: "CASH-991", amountEgp: 195432.1, recordedRole: "OPERATIONS", recordedAt: "2026-10-19T10:00:00Z", effectiveAt: "2026-10-19T09:30:00Z", superseded: false };
    const { mutate } = setup("finance", { ...reserved, evidence: [...reserved.evidence, receipt] });
    const countersign = await screen.findByRole("button", { name: /^Countersign\W+Hospital receipt$/ });
    expect(countersign.className).toContain("btn-primary");
    fireEvent.click(countersign);
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Countersign this record?" });
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/evidence/e7/countersign", undefined));
  });

  it("records the platform fee balance the capped deposit did not cover", async () => {
    const { mutate } = setup("finance", { ...reserved, voucher: { ...voucher, feeBalanceEgp: 1250 }, feeBalanceOwedEgp: 1250, admissionBlockers: ["FEE_BALANCE_DUE"] });
    expect(await screen.findByText("The platform fee balance is not received")).toBeTruthy();
    const fee = screen.getByText("Record the platform fee balance").closest("details")!;
    expect(fee.open).toBe(true);
    const form = within(fee);
    fireEvent.change(form.getByLabelText("Payment reference"), { target: { value: "TRF-12" } });
    fireEvent.change(form.getByLabelText("Received at"), { target: { value: "2026-10-18T12:00" } });
    fireEvent.click(form.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/admission/fee-balance", { reference: "TRF-12", amountEgp: 1250, receivedAt: new Date("2026-10-18T12:00").toISOString() }));
  });

  it("offers no Operations recording to Finance or a coordinator", async () => {
    setup("coordinator", reserved);
    expect(await screen.findByText("RS-V-RS-2026-000123-1")).toBeTruthy();
    expect(screen.queryByText("Record the hospital receipt")).toBeNull();
    expect(screen.queryByRole("button", { name: /accept the letter|countersign/i })).toBeNull();
  });
});

describe("AdmissionPanel — Consultant and Arabic", () => {
  afterEach(cleanup);

  it("records an emergency admission with a reason, after a confirmation, and reads the view again", async () => {
    const { mutate, load } = setup("doctor", reserved, { result: { id: "e9" } });
    fireEvent.click(await screen.findByText("Emergency admission"));
    fireEvent.change(screen.getByLabelText("Why the admission cannot wait"), { target: { value: "Acute decompensation on arrival" } });
    fireEvent.click(screen.getByRole("button", { name: "Record emergency admission" }));
    const dialog = screen.getByRole("alertdialog", { name: "Record an emergency admission?" });
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/emergency-admission", { reason: "Acute decompensation on arrival" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("speaks Arabic with the checklist and the trail", async () => {
    setup("operations", reserved, { locale: "ar" });
    expect(await screen.findByRole("heading", { name: "الدخول والمدفوعات" })).toBeTruthy();
    expect(screen.getByText("لم يُثبت سداد رصيد المستشفى (إيصال الخزينة موقّع من المالية)")).toBeTruthy();
    expect(screen.getByText(/سجل الإثباتات/)).toBeTruthy();
  });
});
