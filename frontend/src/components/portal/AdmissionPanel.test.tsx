import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

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

  it.each(["operations", "coordinator"] as const)("records an explicit first confirmed appointment as %s", async role => {
    const { mutate } = setup(role, reserved);
    const date = await screen.findByLabelText("First appointment date");
    fireEvent.change(date, { target: { value: "2026-10-25" } });
    fireEvent.change(screen.getByLabelText("Confirmation or correction reason"), { target: { value: "Clinic confirmed the earliest visit" } });
    fireEvent.submit(date.closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/cases/c1/first-confirmed-appointment", { appointmentDate: "2026-10-25", reason: "Clinic confirmed the earliest visit" }));
  });

  it("reads its own role's view and opens the reservation as the one primary action", async () => {
    const { mutate, load } = setup("operations", empty, { currentCode: "RESERVE_HOSPITAL" });
    expect(await screen.findByText("Reserve the hospital")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/operations/cases/c1/admission");
    expect(screen.getByText("The final quote is not accepted")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Save the reservation" }).filter(b => b.className.includes("btn-primary"))).toHaveLength(1);
    // UX 5-2: the date says whose clock it reads.
    expect(screen.getByLabelText("Planned admission")).toHaveAccessibleDescription("Date and time on this device's clock.");
    fireEvent.change(screen.getByRole("combobox", { name: "Hospital" }), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Planned admission"), { target: { value: "2026-10-20T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the reservation" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission", { facilityId: "f1", plannedAdmissionAt: new Date("2026-10-20T10:00").toISOString() }));
  });

  it("shows the voucher amounts exactly as returned and records the cashier receipt", async () => {
    const { mutate } = setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    // UX 5-4: the issued voucher is a done act of the file and the head of the money disclosure.
    expect(await screen.findAllByText("RS-V-RS-2026-000123-1")).toHaveLength(2);
    expect(screen.getAllByText("EGP 195,432.10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$3,987.65").length).toBeGreaterThan(0);
    // UX 5-4: the receipt is Operations' own act, so the balance is not repeated as something to wait on.
    expect(screen.queryByText("The hospital balance is not evidenced (cashier receipt countersigned by Finance)")).toBeNull();
    expect(screen.queryByText("Before admission, waiting on others")).toBeNull();
    // The receipt is the next thing to do: its form is open and its button is the panel's primary.
    const receipt = screen.getByText("Record the hospital receipt").closest("details")!;
    expect(receipt.open).toBe(true);
    const form = within(receipt);
    fireEvent.change(form.getByLabelText("Receipt number"), { target: { value: "CASH-991" } });
    // UX 5-2: the amount starts at the balance still owed, and says so.
    // UX 5-4: grouped as the receipt prints it, read back as a number.
    expect(form.getByLabelText("Amount (EGP)")).toHaveValue("195,432.10");
    expect(form.getByLabelText("Amount (EGP)")).toHaveAccessibleDescription(/balance still owed/);
    expect((form.getByLabelText("Paid at") as HTMLInputElement).value).not.toBe("");
    fireEvent.change(form.getByLabelText("Paid at"), { target: { value: "2026-10-19T09:30" } });
    fireEvent.change(form.getByLabelText("Method"), { target: { value: "CARD" } });
    fireEvent.change(form.getByLabelText("Receipt copy (optional)"), { target: { value: "d1" } });
    fireEvent.change(form.getByLabelText("Paid in currency (optional)"), { target: { value: "USD" } });
    fireEvent.change(form.getByLabelText("Amount paid in that currency (optional)"), { target: { value: "3987.65" } });
    const record = form.getByRole("button", { name: "Record the receipt" });
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
    fireEvent.click(form.getByRole("button", { name: "Record the letter" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/letter", { documentId: "d1", quotedPackageEgp: 230000, reference: null }));
    expect(screen.getByText("Refused by Finance — a new letter is needed")).toBeTruthy();
  });

  it("once cleared, records the admission number and offers nothing before it", async () => {
    const { mutate } = setup("operations", { ...reserved, caseStatus: "ADMISSION_READY", balanceOwedEgp: 0, admissionBlockers: [] },
      { caseStatus: "ADMISSION_READY", currentCode: "RECORD_ADMISSION_NUMBER" });
    expect(await screen.findByLabelText("Hospital admission number")).toBeTruthy();
    expect(screen.queryByText("Before admission, waiting on others")).toBeNull();
    expect(screen.queryByText("Record the hospital receipt")).toBeNull();
    expect(screen.queryByText("Change the reservation")).toBeNull();
    // B-3-1b: on a cleared case the number starts treatment, and the field says so.
    expect(screen.getByLabelText("Hospital admission number")).toHaveAccessibleDescription("Recording it starts treatment.");
    fireEvent.change(screen.getByLabelText("Hospital admission number"), { target: { value: " ADM-5521 " } });
    fireEvent.click(screen.getByRole("button", { name: "Record the admission number" }));
    // UX 5-2: it moves the case on, so it asks first and repeats the number.
    const dialog = screen.getByRole("alertdialog", { name: /Record admission number .*ADM-5521/ });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/number", { admissionNumber: "ADM-5521" }));
  });
});

/** UX 5-1: Operations' hospital file — reserve, letter, travel, receipt, admission number; one act open, one filled button. */
describe("AdmissionPanel — Operations' hospital file", () => {
  afterEach(cleanup);

  function file(view: AdmissionView, currentCode?: string) {
    const travel = vi.fn((current: boolean) => <button type="button" className={current ? "btn-primary" : "btn-secondary"}>Travel act</button>);
    const load = vi.fn().mockResolvedValue(view) as unknown as <T>(path: string) => Promise<T>;
    const onView = vi.fn();
    const { container } = renderWithWork(<AdmissionPanel locale="en" role="operations" caseId="c1" caseStatus={view.caseStatus ?? "TRAVEL_COORDINATION"} currentCode={currentCode}
      documents={documents} facilities={facilities} busy={false} mutate={vi.fn()} load={load} travel={travel} onView={onView}/>);
    return { travel, container, onView };
  }
  const travelling: AdmissionView = { ...reserved, caseStatus: "TRAVEL_COORDINATION", letterCheck: "NONE", voucher: null, balanceOwedEgp: null, evidence: [] };

  it("orders the acts and opens only the letter while the reservation stands as one line", async () => {
    const { travel, container, onView } = file(travelling, "RECORD_ADMISSION_LETTER");
    const acts = await screen.findByRole("list", { name: "Hospital file" });
    const items = within(acts).getAllByRole("listitem").map(li => li.textContent ?? "");
    expect(items[0]).toMatch(/^Reserved · ⁨Nile Heart Hospital⁩ · ⁨Cairo⁩ · admission .*2026/);
    expect(items[1]).toContain("Record the admission letter");
    // UX 5-4: the list is the sequence; the voucher waits for the checked letter. The point of no return and the first
    // appointment, possible now but no step of the sequence, wait together under the file.
    expect(items[2]).toBe("Travel act");
    expect(items[3]).toBe("Later: Issue the voucher");
    expect(items[4]).toBe("Later: Record the hospital receipt");
    expect(items[5]).toBe("Later: Record the admission number");
    const also = screen.getByText("Also possible now: Point of no return · First confirmed appointment", { selector: "summary" }).closest("details")!;
    expect(also.open).toBe(false);
    expect(within(also).getByText("Set the point of no return", { selector: "summary" })).toBeInTheDocument();
    expect(within(also).getByText("First confirmed appointment", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("Record the admission letter").closest("details")).toHaveAttribute("open");
    expect(travel).toHaveBeenLastCalledWith(false);
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
    expect(onView).toHaveBeenCalledWith(travelling);
  });

  it("hands the filled button to the travel act once the letter is recorded", async () => {
    const { travel, container } = file({ ...travelling, letterCheck: "CHECK_PENDING" }, "UPDATE_TRAVEL_PLAN");
    const acts = await screen.findByRole("list", { name: "Hospital file" });
    expect(within(acts).getAllByRole("listitem")[1].textContent).toMatch(/^Admission letter · Waiting for Finance's check/);
    expect(travel).toHaveBeenLastCalledWith(true);
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Travel act" })).toHaveClass("btn-primary");
    expect(screen.getByText("Record a new letter").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps the travel act standing when the reservation cannot be read", async () => {
    const travel = vi.fn(() => <p>Travel act</p>);
    const load = vi.fn().mockRejectedValue(new Error("down")) as unknown as <T>(path: string) => Promise<T>;
    renderWithWork(<AdmissionPanel locale="en" role="operations" caseId="c1" caseStatus="TRAVEL_COORDINATION" busy={false} mutate={vi.fn()} load={load} travel={travel}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("The admission details could not be loaded.");
    expect(screen.getByText("Travel act")).toBeInTheDocument();
  });

  it("on an emergency-cleared case with no letter, shows no letter act and opens the admission number", async () => {
    const { container } = file({ ...reserved, caseStatus: "ADMISSION_READY", letterCheck: "NONE", emergencyOverride: true, voucher: null, balanceOwedEgp: null, admissionBlockers: [], evidence: [] },
      "RECORD_ADMISSION_NUMBER");
    const acts = await screen.findByRole("list", { name: "Hospital file" });
    expect(acts.textContent).not.toContain("Admission letter");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
    expect(screen.getByText("Record the admission number", { selector: "summary" }).closest("details")).toHaveAttribute("open");
  });

  it("says a recorded receipt and its countersignature as one line", async () => {
    file({ ...reserved, evidence: [...reserved.evidence, { id: "e2", kind: "BALANCE_EVIDENCED", reference: "CASH-1", amountEgp: 195432.1, recordedRole: "OPERATIONS",
      recordedAt: "2026-10-19T09:00:00Z", superseded: false }] });
    const acts = await screen.findByRole("list", { name: "Hospital file" });
    expect(screen.getByText("Record another receipt")).toBeInTheDocument();
    expect(within(acts).getAllByRole("listitem").map(li => li.textContent).join("|")).toMatch(/\|Cashier receipt recorded · EGP\s195,432\.10 · waiting for Finance's countersignatureRecord another receipt/);
  });
});

describe("AdmissionPanel — Finance", () => {
  afterEach(cleanup);
  const variance: AdmissionView = { ...reserved, letterCheck: "VARIANCE_OPEN", voucher: null, balanceOwedEgp: null, evidence: [{ ...letterRow, amountEgp: 262500 }] };
  const receipt = { id: "e7", kind: "BALANCE_EVIDENCED", reference: "CASH-991", amountEgp: 195432.1, recordedRole: "OPERATIONS", recordedAt: "2026-10-19T10:00:00Z", effectiveAt: "2026-10-19T09:30:00Z", superseded: false };

  it("states the letter's gap, owes a reason above the estimate, and accepts only after a question with the amount", async () => {
    const { mutate, load } = setup("finance", variance, { caseStatus: "TRAVEL_COORDINATION" });
    const accept = await screen.findByRole("button", { name: "Accept the letter" });
    expect(load).toHaveBeenCalledWith("/finance/cases/c1/admission");
    // UX 4-1: the gap is worked out, with its percentage of the estimate's maximum.
    expect(screen.getByText(/EGP\s?22,500.* above the estimate's maximum \(.*9\.4%.*\)/)).toBeTruthy();
    const reason = screen.getByLabelText("Reason") as HTMLTextAreaElement;
    expect(reason.required).toBe(true);
    expect(reason).toHaveAccessibleDescription("Give a reason: the price is above the accepted estimate.");
    fireEvent.invalid(reason);
    expect(reason.validationMessage).toBe("Give a reason: the price is above the accepted estimate.");
    fireEvent.input(reason, { target: { value: "Hospital added an ICU night" } });
    expect(accept.className).toContain("btn-primary");
    fireEvent.click(accept);
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /Accept the letter at .*EGP\s?262,500.*\?/ });
    expect(dialog.textContent).toMatch(/You accept a price .*EGP\s?22,500.* above the estimate's maximum/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept the letter" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/admission/letter/decision", { evidenceId: "e1", decision: "ACCEPT", note: "Hospital added an ICU night" }));
  });

  it("refuses a letter as the second verb, with its reason and its own question", async () => {
    const { mutate } = setup("finance", { ...variance, letterCheck: "CHECK_PENDING", evidence: [letterRow] });
    expect(await screen.findByText(/EGP\s?10,000.* below the estimate's maximum/)).toBeTruthy();
    // Within the estimate the reason to accept is optional.
    expect((screen.getByLabelText("Reason (optional)") as HTMLTextAreaElement).required).toBe(false);
    const refuseGroup = screen.getByText("Can't accept this letter?").closest("details")!;
    expect(refuseGroup.open).toBe(false);
    const reason = within(refuseGroup).getByLabelText("Reason for refusing") as HTMLTextAreaElement;
    fireEvent.invalid(reason);
    expect(reason.validationMessage).toBe("Give the reason for refusing the letter.");
    fireEvent.input(reason, { target: { value: "Wrong patient name" } });
    const refuse = within(refuseGroup).getByRole("button", { name: "Refuse the letter" });
    expect(refuse.className).toContain("btn-secondary");
    fireEvent.click(refuse);
    const dialog = screen.getByRole("alertdialog", { name: /Refuse the letter at .*EGP\s?230,000/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Refuse the letter" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/admission/letter/decision", { evidenceId: "e1", decision: "REFUSE", note: "Wrong patient name" }));
  });

  it("reads a receipt against what the voucher says is owed at the cashier, and countersigns after a question with the amount", async () => {
    const { mutate } = setup("finance", { ...reserved, evidence: [...reserved.evidence, receipt] });
    const countersign = await screen.findByRole("button", { name: /^Countersign\W+Hospital receipt CASH-991$/ });
    expect(screen.getByText("Owed at the cashier, per the voucher")).toBeTruthy();
    expect(screen.getByText("Matches what is owed at the cashier")).toBeTruthy();
    // The receipt waiting here is this page's act, not something to wait for.
    expect(screen.queryByText("Before admission, waiting on others")).toBeNull();
    expect(countersign.className).toContain("btn-primary");
    fireEvent.click(countersign);
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /Countersign the receipt for .*EGP\s?195,432\.10/ });
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/evidence/e7/countersign", undefined));
  });

  it("says a receipt short of what is owed in words", async () => {
    setup("finance", { ...reserved, evidence: [...reserved.evidence, { ...receipt, amountEgp: 190000 }] });
    expect(await screen.findByText(/EGP\s?5,432\.10.* less than what is owed at the cashier/)).toBeTruthy();
  });

  it("derives the fee balance and records it after a question with the amount and the reference", async () => {
    const feeVoucher = { ...voucher, depositPaidEgp: 28750, depositCreditEgp: 0, feeBalanceEgp: 1250, feeBalanceDisplay: 25.5 };
    const { mutate } = setup("finance", { ...reserved, balanceOwedEgp: 0, voucher: feeVoucher, feeBalanceOwedEgp: 1250, admissionBlockers: ["FEE_BALANCE_DUE"] });
    const fee = (await screen.findByText("Record the platform fee balance")).closest("details")!;
    expect(fee.open).toBe(true);
    const form = within(fee);
    expect(form.getByText(/Platform fee .*EGP\s?30,000.* − deposit applied to the fee .*EGP\s?28,750.* = .*EGP\s?1,250/)).toBeTruthy();
    expect(screen.queryByText("The platform fee balance is not received")).toBeNull();
    fireEvent.change(form.getByLabelText("Payment reference"), { target: { value: "TRF-12" } });
    fireEvent.change(form.getByLabelText("Received at"), { target: { value: "2026-10-18T12:00" } });
    fireEvent.click(form.getByRole("button", { name: "Record the fee balance" }));
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: /Record .*EGP\s?1,250.* received against .*TRF-12/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record the fee balance" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/admission/fee-balance", { reference: "TRF-12", amountEgp: 1250, receivedAt: new Date("2026-10-18T12:00").toISOString() }));
  });

  it("says what is already checked as one line per act, the voucher's money EGP first behind its own line", async () => {
    setup("finance", { ...reserved, caseStatus: "TREATMENT_IN_PROGRESS", admissionNumber: "NHH-ADM-1", balanceOwedEgp: 0, admissionBlockers: [],
      evidence: [...reserved.evidence, { ...receipt, countersignedRole: "FINANCE", countersignedAt: "2026-10-19T12:00:00Z" }] });
    const done = await screen.findByRole("list", { name: "Checked so far" });
    const lines = within(done).getAllByRole("listitem").map(li => li.textContent);
    expect(lines[0]).toMatch(/^Admission letter · EGP\s?230,000 · Checked, within the estimate$/);
    expect(lines.some(l => /^Hospital receipt CASH-991 · EGP\s?195,432\.10 · countersigned by Finance$/.test(l ?? ""))).toBe(true);
    expect(lines.at(-1)).toBe("Admission number NHH-ADM-1");
    expect(screen.queryByRole("button", { name: /countersign/i })).toBeNull();
    // The rate as Finance quotes it, inside the voucher's money.
    expect(screen.getByText(/= EGP\s?49\.0196/).closest("details")?.open).toBe(false);
    expect(screen.getByText(/^Evidence trail/).closest("details")?.open).toBe(false);
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

  it("speaks Arabic with the blockers and the file history", async () => {
    setup("operations", { ...reserved, admissionBlockers: ["PROCEDURE_CONSENT_MISSING", "BALANCE_NOT_EVIDENCED"] }, { locale: "ar" });
    expect(await screen.findByRole("heading", { name: "الدخول والمدفوعات" })).toBeTruthy();
    expect(screen.getByText("قبل الدخول، بانتظار أطراف أخرى")).toBeTruthy();
    expect(screen.getByText("لا توجد موافقة على الإجراء في الملف")).toBeTruthy();
    expect(screen.getByText(/سجل الملف/, { selector: "summary" })).toBeTruthy();
  });
});

describe("AdmissionPanel — the Consultant's summary (UX 3-2)", () => {
  afterEach(cleanup);

  it("reads the admission as one line, with the voucher's money behind a closed disclosure and no ledger", async () => {
    setup("doctor", { ...reserved, caseStatus: "TREATMENT_IN_PROGRESS", admissionStatus: "ADMITTED", admissionNumber: "NHH-ADM-9", admissionBlockers: [] });
    expect(await screen.findByRole("heading", { name: "Admission" })).toBeTruthy();
    expect(screen.getByText("Checked, within the estimate")).toBeTruthy();
    const money = screen.getByText("The voucher and what is owed", { selector: "summary" }).closest("details")!;
    expect(money.open).toBe(false);
    expect(within(money).getByText("Patient pays at the cashier")).toBeTruthy();
    expect(screen.queryByText(/^Evidence trail/)).toBeNull();
    expect(screen.queryByText("Record the emergency admission", { selector: "summary" })).toBeNull();
    expect(screen.queryByLabelText("Hospital admission number")).toBeNull();
  });

  // B-3-1b: the emergency exception — after their emergency admission the Consultant records the number, which starts treatment.
  it("after an emergency admission, records the hospital's admission number on the cleared case", async () => {
    const { mutate } = setup("doctor", { ...reserved, caseStatus: "ADMISSION_READY", emergencyOverride: true, admissionBlockers: [] });
    const field = await screen.findByLabelText("Hospital admission number");
    expect(field).toHaveAccessibleDescription(/it starts treatment/);
    fireEvent.change(field, { target: { value: " NHH-ADM-10 " } });
    fireEvent.click(screen.getByRole("button", { name: "Record the admission number" }));
    fireEvent.click(screen.getByRole("alertdialog").querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/admission/number", { admissionNumber: "NHH-ADM-10" }));
  });

  it("leaves the admission number to Operations when there was no emergency admission", async () => {
    setup("doctor", { ...reserved, caseStatus: "ADMISSION_READY", admissionBlockers: [] });
    expect(await screen.findByRole("heading", { name: "Admission" })).toBeTruthy();
    expect(screen.queryByLabelText("Hospital admission number")).toBeNull();
  });
});

/** UX 5-2: the cashier on a phone — one money line, a short receipt, refusals at the form, confirmations for what moves the case. */
describe("AdmissionPanel — the cashier (UX 5-2)", () => {
  afterEach(cleanup);

  it("shows Operations what the patient pays as one line, every other figure behind a closed disclosure", async () => {
    setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    const line = (await screen.findByText(/^Patient pays at the cashier:/, { selector: "p" }));
    expect(line.textContent?.replace(/[⁨⁩]/g, "").replace(/ /g, " ")).toBe("Patient pays at the cashier: EGP 195,432.10 · $3,987.65");
    const all = screen.getByText("The voucher and what is owed", { selector: "summary" }).closest("details")!;
    expect(all.open).toBe(false);
    expect(within(all).getByText("RS-V-RS-2026-000123-1")).toBeInTheDocument();
  });

  it("keeps another currency and the copy behind one disclosure, the currency a list with the patient's first", async () => {
    setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    const other = (await screen.findByText("Paid in another currency or with a copy", { selector: "summary" })).closest("details")!;
    expect(other.open).toBe(false);
    const currency = within(other).getByLabelText("Paid in currency (optional)");
    const options = within(currency).getAllByRole("option").map(o => o.getAttribute("value"));
    expect(options.slice(0, 2)).toEqual(["", "USD"]);
    expect(options).not.toContain("EGP");
  });

  it("says a refused receipt at the form, keeps what was typed and moves focus to the refusal", async () => {
    const { mutate } = setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    mutate.mockResolvedValue(null);
    const form = within((await screen.findByText("Record the hospital receipt")).closest("details")!);
    fireEvent.change(form.getByLabelText("Receipt number"), { target: { value: "CASH-991" } });
    fireEvent.click(form.getByRole("button", { name: "Record the receipt" }));
    const alert = await form.findByRole("alert");
    expect(alert).toHaveTextContent("Not saved. Check the form, then try again.");
    expect(form.getByLabelText("Receipt number")).toHaveValue("CASH-991");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    // Correcting the form clears the refusal.
    fireEvent.input(form.getByLabelText("Receipt number"), { target: { value: "CASH-992" } });
    expect(form.queryByRole("alert")).toBeNull();
  });

  it("asks for the amount once another currency is chosen", async () => {
    setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    const other = (await screen.findByText("Paid in another currency or with a copy", { selector: "summary" })).closest("details")!;
    const amount = within(other).getByLabelText("Amount paid in that currency (optional)");
    expect(amount).not.toBeRequired();
    fireEvent.change(within(other).getByLabelText("Paid in currency (optional)"), { target: { value: "USD" } });
    expect(amount).toBeRequired();
  });

  it("sets the point of no return only after a confirmation that names the time and what it commits", async () => {
    const { mutate } = setup("operations", reserved);
    fireEvent.click(await screen.findByText("Set the point of no return", { selector: "summary" }));
    const at = screen.getByLabelText("No refund for travel after");
    expect(at).toHaveAccessibleDescription("Date and time on this device's clock.");
    fireEvent.change(at, { target: { value: "2026-10-19T18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Set the point of no return" }));
    const dialog = screen.getByRole("alertdialog", { name: /Set the point of no return to/ });
    expect(dialog).toHaveAccessibleDescription(/not refunded after this time/);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/point-of-no-return", { at: new Date("2026-10-19T18:00").toISOString() }));
  });

  it("corrects an admission number without asking again", async () => {
    const { mutate } = setup("operations", { ...reserved, caseStatus: "TREATMENT_IN_PROGRESS", admissionNumber: "ADM-1", balanceOwedEgp: 0, admissionBlockers: [] });
    fireEvent.click(await screen.findByText("Correct the admission number", { selector: "summary" }));
    fireEvent.change(screen.getByLabelText("Hospital admission number"), { target: { value: "ADM-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the corrected number" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/number", { admissionNumber: "ADM-2" }));
  });

  it("offers Operations the first confirmed appointment only before admission, as a correction once recorded", async () => {
    setup("operations", { ...reserved, evidence: [...reserved.evidence, { id: "e5", kind: "FIRST_CONFIRMED_APPOINTMENT", recordedRole: "OPERATIONS", recordedAt: "2026-10-12T10:00:00Z", superseded: false }] });
    expect(await screen.findByText("Correct the first confirmed appointment", { selector: "summary" })).toBeInTheDocument();
    cleanup();
    setup("operations", { ...reserved, caseStatus: "TREATMENT_IN_PROGRESS", admissionNumber: "ADM-1", balanceOwedEgp: 0, admissionBlockers: [] });
    expect(await screen.findByText("Correct the admission number", { selector: "summary" })).toBeInTheDocument();
    expect(screen.queryByText(/first confirmed appointment/i)).toBeNull();
  });
});

/** UX 5-4: the cards around the file folded into it — only what others must clear, the acts possible now, one File history. */
describe("AdmissionPanel — the file holds it all (UX 5-4)", () => {
  afterEach(cleanup);
  const receiptRow = { id: "e2", kind: "BALANCE_EVIDENCED", reference: "CASH-1", amountEgp: 195432.1, recordedRole: "OPERATIONS", recordedAt: "2026-10-19T09:00:00Z", superseded: false };

  it("names only the blockers Operations cannot clear: consent, the quote, Finance's countersignature", async () => {
    setup("operations", { ...reserved, voucher: null, evidence: [...reserved.evidence, receiptRow],
      admissionBlockers: ["PROCEDURE_CONSENT_MISSING", "VOUCHER_NOT_ISSUED", "BALANCE_NOT_EVIDENCED", "ADMISSION_NUMBER_MISSING"] });
    const heading = await screen.findByText("Before admission, waiting on others");
    const list = heading.parentElement!.querySelector("ul")!;
    expect(within(list).getAllByRole("listitem").map(li => li.textContent)).toEqual([
      "Procedure consent is not on file", "The hospital balance is not evidenced (cashier receipt countersigned by Finance)"]);
    expect(screen.queryByText("Before admission")).toBeNull();
    expect(screen.queryByText("No voucher issued yet.")).toBeNull();
  });

  it("keeps the record behind one closed File history: a recorded first appointment's correction and the evidence trail", async () => {
    setup("operations", { ...reserved, evidence: [...reserved.evidence, { id: "e5", kind: "FIRST_CONFIRMED_APPOINTMENT", recordedRole: "OPERATIONS", recordedAt: "2026-10-12T10:00:00Z", superseded: false }] });
    const history = (await screen.findByText("File history (2)", { selector: "summary" })).closest("details")!;
    expect(history.open).toBe(false);
    expect(within(history).getByText("Correct the first confirmed appointment", { selector: "summary" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Hospital file" })).queryByText(/first confirmed appointment/i)).toBeNull();
    expect(within(history).getByRole("list", { name: "Evidence trail" })).toBeInTheDocument();
    expect(screen.queryByText(/^Evidence trail/, { selector: "summary" })).toBeNull();
    // The estimate is read where the letter's price is typed, not as a fact under the file.
    expect(screen.queryByText("Accepted estimate maximum")).toBeNull();
  });

  it("offers the voucher by hand only once the letter is checked, and as a later act before", async () => {
    setup("operations", { ...reserved, caseStatus: "TRAVEL_COORDINATION", voucher: null, balanceOwedEgp: null });
    const issue = (await screen.findByText("Issue the voucher", { selector: "summary" })).closest("details")!;
    expect(within(issue).getByRole("button", { name: "Issue the voucher" })).toHaveClass("btn-secondary");
    cleanup();
    setup("operations", { ...reserved, caseStatus: "TRAVEL_COORDINATION", voucher: null, balanceOwedEgp: null, admissionBlockers: ["FINAL_QUOTE_NOT_ACCEPTED"] });
    const acts = await screen.findByRole("list", { name: "Hospital file" });
    expect(within(acts).getByText("Issue the voucher").closest("p")).toHaveTextContent("Later: Issue the voucher");
    expect(screen.queryByRole("button", { name: "Issue the voucher" })).toBeNull();
  });

  it("says a set point of no return as one line, changeable until Finance approves it", async () => {
    setup("operations", { ...reserved, pointOfNoReturnAt: "2026-10-19T16:00:00Z", pointOfNoReturnApproved: false });
    const acts = await screen.findByRole("list", { name: "Hospital file" });
    expect(acts.textContent).toMatch(/No refund for travel after .*2026.* · waiting for Finance/);
    expect(screen.getByText("Change the point of no return", { selector: "summary" })).toBeInTheDocument();
    cleanup();
    setup("operations", { ...reserved, pointOfNoReturnAt: "2026-10-19T16:00:00Z", pointOfNoReturnApproved: true });
    expect((await screen.findByRole("list", { name: "Hospital file" })).textContent).toMatch(/approved by Finance/);
    expect(screen.queryByText("Change the point of no return")).toBeNull();
  });

  it("groups the receipt amount when the field is left and sends it as a number", async () => {
    const { mutate } = setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE" });
    const form = within((await screen.findByText("Record the hospital receipt")).closest("details")!);
    const amount = form.getByLabelText("Amount (EGP)");
    fireEvent.change(amount, { target: { value: "1200000.5" } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue("1,200,000.50");
    fireEvent.change(form.getByLabelText("Receipt number"), { target: { value: "CASH-7" } });
    fireEvent.click(form.getByRole("button", { name: "Record the receipt" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/admission/balance", expect.objectContaining({ amountEgp: 1200000.5 })));
  });

  it("reads an Arabic keypad's digits and a pasted currency, and refuses an ambiguous amount instead of re-reading it", async () => {
    setup("operations", reserved, { currentCode: "RECORD_HOSPITAL_BALANCE", locale: "ar" });
    const form = within((await screen.findByText("سجّل إيصال خزينة المستشفى", { selector: "summary" })).closest("details")!);
    const amount = form.getByLabelText("المبلغ (جنيه مصري)") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "١٩٥٬٥٠٠٫٥" } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue("195,500.50");
    expect(amount.validity.valid).toBe(true);
    fireEvent.change(amount, { target: { value: "195,500 ج.م." } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue("195,500");
    for (const typed of ["195,50", "1,2", "0", "-5"]) {
      fireEvent.change(amount, { target: { value: typed } });
      fireEvent.blur(amount);
      expect(amount).toHaveValue(typed);
      expect(amount.validationMessage).toBe("اكتب المبلغ بالأرقام وأكبر من صفر، مثل 195,500.");
    }
  });

  it("stops asking for money at the cashier once the receipt is recorded or nothing is owed", async () => {
    setup("operations", { ...reserved, evidence: [...reserved.evidence, receiptRow] });
    expect(await screen.findByText("The voucher and what is owed", { selector: "summary" })).toBeInTheDocument();
    expect(screen.queryByText(/^Patient pays at the cashier:/, { selector: "p" })).toBeNull();
    cleanup();
    setup("operations", { ...reserved, caseStatus: "ADMISSION_READY", balanceOwedEgp: 0, admissionBlockers: [] });
    expect(await screen.findByText("The voucher and what is owed", { selector: "summary" })).toBeInTheDocument();
    expect(screen.queryByText(/^Patient pays at the cashier:/, { selector: "p" })).toBeNull();
  });

  it("waits on Finance only for a receipt it has not countersigned", async () => {
    setup("operations", { ...reserved, evidence: [...reserved.evidence, { ...receiptRow, countersignedRole: "FINANCE", countersignedAt: "2026-10-19T12:00:00Z" }],
      admissionBlockers: ["BALANCE_NOT_EVIDENCED"] });
    expect(await screen.findByRole("list", { name: "Hospital file" })).toBeInTheDocument();
    expect(screen.queryByText("Before admission, waiting on others")).toBeNull();
  });
});
