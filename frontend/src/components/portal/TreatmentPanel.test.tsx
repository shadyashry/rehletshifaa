import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { TreatmentPanel, type TreatmentRole } from "./TreatmentPanel";
import type { TreatmentView } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-16 session 2: the staff "Treatment" panel against the mocked treatment API. */
const documents = [{ documentId: "d1", fileName: "interim-bill.pdf", status: "CLEAN" }, { documentId: "d2", fileName: "scan.pdf", status: "PENDING" }];
// Deliberately odd numbers: the panel shows what the API returns and never adds anything up.
const view: TreatmentView = {
  caseId: "c1", caseStatus: "TREATMENT_IN_PROGRESS", nextMilestoneDueAt: "2026-10-22T09:00:00Z",
  milestones: [
    { id: "m1", kind: "ADMITTED", occurredAt: "2026-10-20T08:00:00Z", recordedRole: "CONSULTANT", recordedAt: "2026-10-20T08:05:00Z", needsCountersign: false, countersigned: false, superseded: false },
    { id: "m2", kind: "PROCEDURE_STARTED", occurredAt: "2026-10-21T07:00:00Z", recordedRole: "OPERATIONS", recordedAt: "2026-10-21T07:10:00Z", needsCountersign: true, countersigned: false,
      note: "Started on time", superseded: false },
  ],
  changeOrders: [
    { id: "o1", orderNumber: "RS-CO-RS-2026-000123-1", status: "PROPOSED", emergency: false, reason: "A second stent is needed", proposedAt: "2026-10-21T09:00:00Z",
      lines: [{ id: "l1", lineNo: 1, kind: "IMPLANT", description: "Drug-eluting stent", quantity: 1, unitEgp: null, lineEgp: null }], totalEgp: null },
    { id: "o2", orderNumber: "RS-CO-RS-2026-000123-2", status: "AWAITING_PATIENT", emergency: false, reason: "Observation overnight", proposedAt: "2026-10-21T10:00:00Z",
      pricedAt: "2026-10-21T11:00:00Z", lines: [{ id: "l2", lineNo: 1, kind: "EXTRA_NIGHT", description: "Extra ICU night", quantity: 2, unitEgp: 12345.5, lineEgp: 24691 }],
      totalEgp: 24691, totalDisplay: 503.71, displayCurrency: "USD", withinBand: false },
  ],
  money: { packageEgp: 200000, changeOrdersEgp: 0, authorisedEgp: 200000, interimBilledEgp: 213456.78, interimPendingEgp: null, varianceEgp: 13456.78, bandLimitEgp: 15000, bandUsedEgp: 0 },
  interimBills: [{ id: "b1", kind: "INTERIM_BILL", reference: "NHH-IB-7", amountEgp: 213456.78, effectiveAt: "2026-10-21T12:00:00Z", recordedRole: "OPERATIONS", recordedAt: "2026-10-21T12:30:00Z", superseded: false }],
  checklist: [
    { stage: "ADMISSION", complete: true, items: [{ code: "ADMISSION_RESERVED", required: false, done: true }, { code: "ADMISSION_NUMBER", required: true, done: true }] },
    { stage: "TREATMENT", complete: false, items: [{ code: "MILESTONE_ADMITTED", required: true, done: true }, { code: "MILESTONE_PROCEDURE_COMPLETED", required: true, done: false }] },
  ],
};

function setup(role: TreatmentRole, props: { currentCode?: string; locale?: "en" | "ar"; data?: TreatmentView } = {}) {
  const data = props.data ?? view;
  const mutate = vi.fn().mockResolvedValue(data);
  const load = vi.fn().mockResolvedValue(data) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<TreatmentPanel locale={props.locale ?? "en"} role={role} caseId="c1" caseStatus="TREATMENT_IN_PROGRESS" currentCode={props.currentCode}
                                 documents={documents} busy={false} mutate={mutate} load={load}/>, props.locale ?? "en");
  return { mutate, load };
}
const primaries = () => [...document.querySelectorAll("#treatment-panel .btn-primary")];

describe("TreatmentPanel — Consultant", () => {
  afterEach(cleanup);

  it("countersigns Operations' milestone after a confirmation, as the panel's one primary action", async () => {
    const { mutate, load } = setup("doctor");
    expect(await screen.findByRole("heading", { name: "Treatment" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/doctor/cases/c1/treatment");
    expect(screen.getByText(/^Next milestone due/)).toBeTruthy();
    expect(screen.getByText("Awaiting the Consultant's countersign")).toBeTruthy();
    expect(screen.getByText("Started on time")).toBeTruthy();
    const countersign = screen.getByRole("button", { name: /^Countersign\W+Procedure started$/ });
    expect(primaries()).toEqual([countersign]);
    fireEvent.click(countersign);
    expect(mutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "Countersign this milestone?" });
    expect(dialog.textContent).toContain("sign in again");
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/milestones/m2/countersign", undefined));
  });

  it("records a milestone with the fields its kind owes, opening first on RECORD_MILESTONE", async () => {
    const { mutate } = setup("doctor", { currentCode: "RECORD_MILESTONE" });
    const form = (await screen.findByText("Record a milestone", { selector: "summary" })).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    expect(primaries()).toEqual([scope.getByRole("button", { name: "Record milestone" })]);
    fireEvent.change(scope.getByLabelText("Milestone"), { target: { value: "COMPLICATION" } });
    expect(scope.getByText(/opens an incident for review/)).toBeTruthy();
    expect(scope.getByLabelText("Severity")).toBeTruthy();
    fireEvent.change(scope.getByLabelText("Milestone"), { target: { value: "PROCEDURE_COMPLETED" } });
    expect(scope.getByText("Recording this again corrects the one on file.")).toBeTruthy();
    fireEvent.change(scope.getByLabelText("When it happened"), { target: { value: "2026-10-21T13:00" } });
    // The completed procedure owes its operative note: refused here before the round trip.
    fireEvent.click(scope.getByRole("button", { name: "Record milestone" }));
    expect(await scope.findByRole("alert")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(scope.getByLabelText("Operative note reference"), { target: { value: "OP-4471" } });
    fireEvent.change(scope.getByLabelText("Implants used (optional)"), { target: { value: "1 stent" } });
    fireEvent.click(scope.getByRole("button", { name: "Record milestone" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/milestones", { kind: "PROCEDURE_COMPLETED", occurredAt: new Date("2026-10-21T13:00").toISOString(),
      documentId: null, operativeNoteReference: "OP-4471", implants: "1 stent", complicationSummary: null, complicationSeverity: null, plannedDischargeOn: null, note: null }));
  });

  it("proposes a change order with several lines, and an emergency one only after a confirmation", async () => {
    const { mutate } = setup("doctor");
    const form = (await screen.findByText("Propose a change order", { selector: "summary" })).closest("details")!;
    const scope = within(form);
    fireEvent.change(scope.getByLabelText(/^Clinical reason/), { target: { value: "Extra imaging" } });
    fireEvent.change(scope.getAllByLabelText("Description")[0], { target: { value: "CT angiography" } });
    fireEvent.click(scope.getByRole("button", { name: "Add a line" }));
    fireEvent.change(scope.getAllByLabelText("Kind")[1], { target: { value: "MEDICATION" } });
    fireEvent.change(scope.getAllByLabelText("Description")[1], { target: { value: "Contrast agent" } });
    fireEvent.change(scope.getAllByLabelText("Quantity")[1], { target: { value: "2" } });
    fireEvent.click(scope.getByRole("button", { name: "Send to Finance" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/change-orders", { reason: "Extra imaging",
      lines: [{ kind: "PROCEDURE", description: "CT angiography", quantity: 1 }, { kind: "MEDICATION", description: "Contrast agent", quantity: 2 }] }));

    const emergency = within(screen.getByText("Emergency change order", { selector: "summary" }).closest("details")!);
    fireEvent.change(emergency.getByLabelText(/^Clinical reason/), { target: { value: "Bleeding" } });
    fireEvent.change(emergency.getByLabelText("Description"), { target: { value: "Return to theatre" } });
    fireEvent.click(emergency.getByRole("button", { name: "Record emergency change" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("alertdialog", { name: "Record an emergency change order?" }).querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/change-orders/emergency", { reason: "Bleeding",
      lines: [{ kind: "PROCEDURE", description: "Return to theatre", quantity: 1 }] }));
  });

  it("withdraws an undecided change order with a reason, after a confirmation", async () => {
    const { mutate } = setup("doctor");
    const order = (await screen.findByText("RS-CO-RS-2026-000123-1")).closest("li")!;
    fireEvent.click(within(order).getByText("Withdraw", { selector: "summary" }));
    fireEvent.change(within(order).getByLabelText("Why it is withdrawn"), { target: { value: "No longer needed" } });
    fireEvent.click(within(order).getByRole("button", { name: "Withdraw" }));
    fireEvent.click(screen.getByRole("alertdialog", { name: "Withdraw this change order?" }).querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/change-orders/o1/withdraw", { reason: "No longer needed" }));
  });
});

describe("TreatmentPanel — Finance and Operations", () => {
  afterEach(cleanup);

  it("Finance: shows the running money as returned and prices the proposed order as the one primary action", async () => {
    const { mutate, load } = setup("finance", { currentCode: "PRICE_CHANGE_ORDER" });
    expect(await screen.findByText("Running money")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/finance/cases/c1/treatment");
    expect(screen.getAllByText("EGP 213,456.78").length).toBeGreaterThan(0);
    expect(screen.getByText("EGP 13,456.78").closest("span")?.parentElement?.textContent).toContain("over");
    // The priced order's line, on a phone's stacked row and in the table, and its total.
    expect(screen.getAllByText("EGP 24,691")).toHaveLength(3);
    expect(screen.getByText("$503.71")).toBeTruthy();
    expect(screen.getByText(/Above the band: the patient decides/)).toBeTruthy();
    const price = screen.getByRole("button", { name: "Save prices" });
    expect(primaries()).toEqual([price]);
    // The bill waits behind the order: there, but secondary.
    expect(screen.getByRole("button", { name: /^Countersign\W+NHH-IB-7$/ }).className).toContain("btn-secondary");
    expect(screen.queryByText("Record a milestone", { selector: "summary" })).toBeNull();
    expect(screen.getByText(/^Left in the band: .*15,000/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Unit price \(EGP\) for/), { target: { value: "38,500" } });
    expect(screen.getByText(/^Priced so far: .*38,500.* · left in the band: .*15,000/)).toBeTruthy();
    fireEvent.click(price);
    // UX 4-2: pricing asks first, with the total and where it falls against the band (0 used + 38,500 against 15,000).
    const dialog = screen.getByRole("alertdialog", { name: /^Price .* at .*38,500.*, .*23,500.* above the band\?$/ });
    expect(dialog.textContent).toContain("the patient decides");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/change-orders/o1/price", { lines: [{ lineId: "l1", unitEgp: 38500 }] }));
  });

  it("Finance: countersigns an interim bill after a confirmation", async () => {
    const { mutate } = setup("finance", { currentCode: "COUNTERSIGN_INTERIM_BILL", data: { ...view, changeOrders: [view.changeOrders[1]] } });
    const countersign = await screen.findByRole("button", { name: /^Countersign\W+NHH-IB-7$/ });
    expect(primaries()).toEqual([countersign]);
    fireEvent.click(countersign);
    const dialog = screen.getByRole("alertdialog", { name: /^Countersign bill .*NHH-IB-7.* for .*213,456\.78.*\?$/ });
    expect(dialog.textContent).toMatch(/against .*200,000.* authorised. The latest countersigned bill is the billed-to-date figure/);
    fireEvent.click(dialog.querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/finance/cases/c1/treatment/interim-bills/b1/countersign", undefined));
  });

  it("Operations: records a milestone for the Consultant and an interim bill from a checked document", async () => {
    const { mutate } = setup("operations");
    const onBehalf = within((await screen.findByText("Record a milestone for the Consultant", { selector: "summary" })).closest("details")!);
    expect(onBehalf.getByText(/until then the patient reads it as reported by the care team/)).toBeTruthy();
    fireEvent.change(onBehalf.getByLabelText("Milestone"), { target: { value: "DISCHARGE_PLANNED" } });
    fireEvent.change(onBehalf.getByLabelText("When it happened"), { target: { value: "2026-10-22T09:00" } });
    fireEvent.change(onBehalf.getByLabelText("Planned discharge date"), { target: { value: "2026-10-25" } });
    fireEvent.click(onBehalf.getByRole("button", { name: "Record milestone" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/milestones", expect.objectContaining({ kind: "DISCHARGE_PLANNED", plannedDischargeOn: "2026-10-25" })));

    const bill = within(screen.getByText("Record an interim bill", { selector: "summary" }).closest("details")!);
    const picker = bill.getByLabelText("Bill (case document)");
    expect(within(picker).queryByText("scan.pdf")).toBeNull();
    fireEvent.change(picker, { target: { value: "d1" } });
    fireEvent.change(bill.getByLabelText("Bill number"), { target: { value: "NHH-IB-8" } });
    fireEvent.change(bill.getByLabelText("Amount to date (EGP)"), { target: { value: "220,000" } });
    fireEvent.change(bill.getByLabelText("Issued at"), { target: { value: "2026-10-22T10:00" } });
    fireEvent.click(bill.getByRole("button", { name: "Record bill" }));
    fireEvent.click(screen.getByRole("alertdialog", { name: /^Record bill .*NHH-IB-8.* for .*220,000.*\?$/ }).querySelector(".btn-primary") as HTMLElement);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/treatment/interim-bills", { documentId: "d1", billNumber: "NHH-IB-8", amountEgp: 220000,
      billedAt: new Date("2026-10-22T10:00").toISOString() }));
    expect(primaries()).toHaveLength(0);
  });

  it("coordinator: reads the panel and the checklist without any recording or primary action", async () => {
    setup("coordinator", { currentCode: "CHANGE_ORDER_PATIENT_DECISION" });
    expect(await screen.findByText("Evidence checklist")).toBeTruthy();
    expect(screen.getByText("Awaiting the patient")).toBeTruthy();
    expect(screen.getByText(/Admission reserved/).textContent).toContain("(optional)");
    expect(screen.getByText("Procedure completed").closest("li")?.textContent).toContain("Missing");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("reads in Arabic", async () => {
    setup("finance", { locale: "ar" });
    expect(await screen.findByRole("heading", { name: "العلاج" })).toBeTruthy();
    expect(screen.getByText("الحساب الجاري")).toBeTruthy();
    expect(screen.getByText("لدى المالية للتسعير")).toBeTruthy();
    expect(screen.getByRole("button", { name: "احفظ الأسعار" })).toBeTruthy();
    // Not Finance's current treatment work: the pricing is offered but does not take the page's primary action.
    expect(primaries()).toHaveLength(0);
  });
});
