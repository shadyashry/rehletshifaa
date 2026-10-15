import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});

import { DischargePanel, type DischargeRole } from "./DischargePanel";
import type { DischargeView } from "./portal-model";
import { renderWithWork } from "./test-copy";

/** P1-17 session 2: the staff "Discharge" panel against the mocked discharge API. */
const documents = [{ documentId: "d1", fileName: "discharge-summary.pdf", status: "CLEAN" }, { documentId: "d2", fileName: "scan.pdf", status: "PENDING" }];
const pack = (status: Record<string, string>): DischargeView["pack"] => ["DISCHARGE_SUMMARY", "MEDICATION_LIST", "OPERATIVE_NOTE", "IMPLANT_RECORD", "FIT_TO_FLY"].map(kind => ({
  kind, requiredForDischarge: kind !== "FIT_TO_FLY", status: status[kind] ?? "MISSING",
}));
const inTreatment: DischargeView = {
  caseId: "c1", caseStatus: "TREATMENT_IN_PROGRESS", fitToFlyHours: 72, readyForDischarge: false, reconciliationSettled: false,
  pack: [
    { kind: "DISCHARGE_SUMMARY", requiredForDischarge: true, status: "DONE", recordedAt: "2026-10-24T09:00:00Z", diagnosis: "Coronary artery disease", warningSigns: "Chest pain or breathlessness" },
    { kind: "MEDICATION_LIST", requiredForDischarge: true, status: "MISSING" },
    { kind: "OPERATIVE_NOTE", requiredForDischarge: true, status: "DONE", recordedAt: "2026-10-22T09:00:00Z" },
    { kind: "IMPLANT_RECORD", requiredForDischarge: false, status: "NOT_REQUIRED" },
    { kind: "FIT_TO_FLY", requiredForDischarge: false, status: "BEFORE_RETURN" },
  ],
  blockers: [{ code: "MEDICATION_LIST_MISSING", label: "Medication list missing" }, { code: "FOLLOW_UP_PLAN_MISSING", label: "Follow-up plan missing" },
    { code: "FINAL_INVOICE_MISSING", label: "Final invoice missing" }],
};
const discharged: DischargeView = {
  ...inTreatment, caseStatus: "DISCHARGED", readyForDischarge: true, blockers: [],
  pack: [...pack({ DISCHARGE_SUMMARY: "DONE", MEDICATION_LIST: "DONE", OPERATIVE_NOTE: "DONE", IMPLANT_RECORD: "NOT_REQUIRED" }).slice(0, 4),
    { kind: "FIT_TO_FLY", requiredForDischarge: false, status: "DONE", recordedAt: "2026-10-25T08:00:00Z", examinedAt: "2026-10-25T07:00:00Z", validUntil: "2026-10-28T07:00:00Z" }],
  followUpPlan: { id: "f1", dueAt: "2026-11-25T09:00:00Z", mode: "VIDEO" },
  finalInvoice: { id: "e9", kind: "FINAL_INVOICE", reference: "NHH-FI-42", amountEgp: 213456.78, effectiveAt: "2026-10-25T10:00:00Z", recordedAt: "2026-10-25T10:05:00Z", superseded: false },
  handoverLetter: { evidenceId: "h1", generatedAt: "2026-10-25T11:00:00Z", english: "Dear colleague,\nYour patient was treated for coronary artery disease.", arabic: "الزميل العزيز،\nعولج مريضكم." },
};

function setup(role: DischargeRole, props: { currentCode?: string; data?: DischargeView; locale?: "en" | "ar" } = {}) {
  const data = props.data ?? inTreatment;
  const mutate = vi.fn().mockResolvedValue(data);
  const load = vi.fn().mockResolvedValue(data) as unknown as <T>(path: string) => Promise<T>;
  renderWithWork(<DischargePanel locale={props.locale ?? "en"} role={role} caseId="c1" caseStatus={data.caseStatus ?? "TREATMENT_IN_PROGRESS"} currentCode={props.currentCode}
                                 documents={documents} busy={false} mutate={mutate} load={load}/>, props.locale ?? "en");
  return { mutate, load };
}
const primaries = () => [...document.querySelectorAll("#discharge-panel .btn-primary")];

describe("DischargePanel — Consultant", () => {
  afterEach(cleanup);

  it("shows what blocks discharge instead of a discharge button, and the pack with each document's state", async () => {
    const { load } = setup("doctor");
    expect(await screen.findByRole("heading", { name: "Discharge" })).toBeTruthy();
    expect(load).toHaveBeenCalledWith("/doctor/cases/c1/discharge");
    expect(screen.getByText("The medication list is missing")).toBeTruthy();
    expect(screen.getByText("The hospital's final invoice is not recorded")).toBeTruthy();
    expect(screen.getByText(/there is no discharge button/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^discharge/i })).toBeNull();
    expect(screen.getByText("Coronary artery disease")).toBeTruthy();
    expect(screen.getByText("Before a return flight")).toBeTruthy();
    expect(screen.getByText("Not needed")).toBeTruthy();
    // No work of theirs here yet: nothing is filled.
    expect(primaries()).toEqual([]);
  });

  it("on COMPLETE_DISCHARGE_PACK opens the pack form on the missing medication list and records the medicines", async () => {
    const { mutate } = setup("doctor", { currentCode: "COMPLETE_DISCHARGE_PACK" });
    const form = (await screen.findByText("Record a pack document", { selector: "summary" })).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    expect((scope.getByLabelText("Document type") as HTMLSelectElement).value).toBe("MEDICATION_LIST");
    expect(primaries()).toEqual([scope.getByRole("button", { name: "Record the document" })]);
    // Only checked documents can be picked.
    expect(scope.queryByRole("option", { name: "scan.pdf" })).toBeNull();
    fireEvent.change(scope.getByLabelText("Checked case document"), { target: { value: "d1" } });
    fireEvent.change(scope.getByLabelText("Medicine"), { target: { value: "Aspirin" } });
    fireEvent.change(scope.getByLabelText("Dose"), { target: { value: "75 mg" } });
    fireEvent.change(scope.getByLabelText("How often"), { target: { value: "Once a day" } });
    fireEvent.change(scope.getByLabelText("For how long"), { target: { value: "Lifelong" } });
    fireEvent.click(scope.getByRole("button", { name: "Add a medicine" }));
    expect(scope.getAllByLabelText("Medicine")).toHaveLength(2);
    fireEvent.click(scope.getByRole("button", { name: "Remove medicine 2" }));
    fireEvent.submit(scope.getByRole("button", { name: "Record the document" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/discharge/pack", expect.objectContaining({
      kind: "MEDICATION_LIST", documentId: "d1", medications: [{ name: "Aspirin", dose: "75 mg", frequency: "Once a day", duration: "Lifelong" }], diagnosis: null, examinedAt: null })));
  });

  it("asks a fit to fly for its examination time and says how long it stays valid", async () => {
    setup("doctor");
    const form = (await screen.findByText("Record a pack document", { selector: "summary" })).closest("details")!;
    const scope = within(form);
    fireEvent.change(scope.getByLabelText("Document type"), { target: { value: "FIT_TO_FLY" } });
    expect(scope.getByLabelText("Examined at")).toBeTruthy();
    expect(scope.getByText("Valid for a return flight within 72 hours of the examination.")).toBeTruthy();
  });

  it("records the follow-up plan, and shows the letter in English and Arabic with a print button each", async () => {
    const { mutate } = setup("doctor", { currentCode: "COMPLETE_DISCHARGE_PACK", data: { ...inTreatment, pack: discharged.pack } });
    const form = (await screen.findByText("Record the follow-up plan", { selector: "summary" })).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    fireEvent.change(scope.getByLabelText("Follow-up due"), { target: { value: "2026-11-25T09:00" } });
    fireEvent.change(scope.getByLabelText("How"), { target: { value: "PHONE" } });
    fireEvent.submit(scope.getByRole("button", { name: "Record the plan" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/doctor/cases/c1/follow-ups", expect.objectContaining({ mode: "PHONE", requiredTests: null })));
    cleanup();
    setup("doctor", { data: discharged });
    expect(await screen.findByText(/Your patient was treated/)).toBeTruthy();
    expect(screen.getByText(/عولج مريضكم/).getAttribute("lang")).toBe("ar");
    expect(screen.getByRole("button", { name: /^Print\W+English$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Print\W+Arabic$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate it again" })).toBeTruthy();
  });
});

describe("DischargePanel — Operations", () => {
  afterEach(cleanup);

  it("records the final invoice on RECORD_FINAL_INVOICE as the panel's one primary action", async () => {
    const { mutate } = setup("operations", { currentCode: "RECORD_FINAL_INVOICE" });
    const form = (await screen.findByText("Record the final invoice", { selector: "summary" })).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    expect(primaries()).toEqual([scope.getByRole("button", { name: "Record the invoice" })]);
    fireEvent.change(scope.getByLabelText("Invoice document"), { target: { value: "d1" } });
    fireEvent.change(scope.getByLabelText("Invoice number"), { target: { value: " NHH-FI-42 " } });
    fireEvent.change(scope.getByLabelText("Total (EGP)"), { target: { value: "213456.78" } });
    fireEvent.change(scope.getByLabelText("Issued at"), { target: { value: "2026-10-25T10:00" } });
    fireEvent.submit(scope.getByRole("button", { name: "Record the invoice" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/discharge/final-invoice", expect.objectContaining({
      documentId: "d1", invoiceNumber: "NHH-FI-42", amountEgp: 213456.78, replaces: null })));
  });

  it("confirms a return flight on the fit to fly's window, and by land without one", async () => {
    const { mutate } = setup("operations", { currentCode: "CONFIRM_RETURN", data: discharged });
    expect(await screen.findByText("NHH-FI-42")).toBeTruthy();
    const form = screen.getByText("Confirm the return", { selector: "summary" }).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    expect(scope.getByText(/A flight needs the fit to fly to be valid at departure/)).toBeTruthy();
    fireEvent.click(scope.getByLabelText("By land"));
    expect(scope.queryByText(/A flight needs/)).toBeNull();
    fireEvent.change(scope.getByLabelText("Departure"), { target: { value: "2026-10-27T09:00" } });
    fireEvent.submit(scope.getByRole("button", { name: "Confirm the return" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/discharge/return", expect.objectContaining({ mode: "GROUND", reference: null })));
    // No departure before a confirmed return.
    expect(screen.queryByText("Confirm the departure", { selector: "summary" })).toBeNull();
  });

  it("confirms the departure once the return is confirmed, in Arabic", async () => {
    const { mutate } = setup("operations", { currentCode: "CONFIRM_DEPARTURE", locale: "ar", data: { ...discharged,
      returnTravel: { evidenceId: "r1", mode: "FLIGHT", departureAt: "2026-10-27T09:00:00Z", reference: "MS 801", fitToFlyEvidenceId: "x", confirmedAt: "2026-10-26T09:00:00Z" } } });
    expect(await screen.findByRole("heading", { name: "الخروج" })).toBeTruthy();
    expect(screen.getByText(/رحلة جوية، المغادرة/)).toBeTruthy();
    const form = screen.getByText("تأكيد المغادرة", { selector: "summary" }).closest("details")!;
    expect(form.open).toBe(true);
    const scope = within(form);
    expect(primaries()).toEqual([scope.getByRole("button", { name: "تأكيد المغادرة" })]);
    fireEvent.change(scope.getByLabelText("وقت مغادرة المريض"), { target: { value: "2026-10-27T09:30" } });
    fireEvent.submit(scope.getByRole("button", { name: "تأكيد المغادرة" }).closest("form")!);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith("/operations/cases/c1/discharge/departure", expect.objectContaining({ departedAt: expect.any(String) })));
  });

  it("is read-only for the coordinator", async () => {
    setup("coordinator", { data: discharged });
    expect(await screen.findByText("NHH-FI-42")).toBeTruthy();
    expect(screen.getByText(/being reconciled/)).toBeTruthy();
    expect(document.querySelectorAll("#discharge-panel form")).toHaveLength(0);
  });
});
