import type { Page } from "@playwright/test";

import { setupPortal } from "./portal-fixture";

// UX area 5: an Operations working day on synthetic data only — a trip to arrange, a reservation waiting on the hospital's
// letter, a patient at the cashier, a cleared admission, a patient going home. Layered over `setupPortal` (routes registered
// later answer first). Every name, number and reference here is invented.
const at = (hoursAgo: number) => new Date(Date.UTC(2026, 9, 28, 9) - hoursAgo * 3600000).toISOString();
const coordinator = { coordinatorSubject: "owner", coordinatorName: "Layla Hassan" };
// `myWorkCount`: each case holds one item of My work, as the backend counts it per case (the summary line reads it).
const base = { country: "Libya", careCategory: "cardiology", preferredLanguage: "ar", createdAt: at(600), updatedAt: at(4), version: 5, travelPackageRequested: true, myWorkCount: 1, ...coordinator };

export type OperationsCaseId = "plan" | "letter" | "balance" | "admit" | "depart";
const cases: Record<OperationsCaseId, Record<string, unknown>> = {
  plan: { ...base, id: "plan", caseNumber: "RS-2026-000021", patientName: "Maya Example", status: "TRAVEL_COORDINATION", updatedAt: at(2) },
  letter: { ...base, id: "letter", caseNumber: "RS-2026-000022", patientName: "عمر المثال", status: "TRAVEL_COORDINATION" },
  balance: { ...base, id: "balance", caseNumber: "RS-2026-000023", patientName: "Huda Example", status: "ARRIVAL_CONFIRMED" },
  admit: { ...base, id: "admit", caseNumber: "RS-2026-000024", patientName: "Yusuf Example", status: "ADMISSION_READY" },
  depart: { ...base, id: "depart", caseNumber: "RS-2026-000025", patientName: "Salma Example", status: "DISCHARGED", preferredLanguage: "en" },
};

const work = (id: string, caseId: OperationsCaseId, type: string, title: string, context: string, extra: Record<string, unknown> = {}) => ({
  id, caseId, caseNumber: cases[caseId].caseNumber, patientName: cases[caseId].patientName, caseStatus: cases[caseId].status, waitingOn: "OPERATIONS",
  careCategory: "cardiology", ...coordinator, documentCount: 4, type, title, context, priority: "NORMAL", status: "OPEN", blocking: false,
  dueAt: at(-20), overdue: false, createdAt: at(10), version: 0, copy: null, ...extra });
// In the backend's order (StaffWorkQueryService.QUEUE_ORDER): most urgent, then soonest due.
const workItems = [
  work("ow3", "balance", "RECORD_HOSPITAL_BALANCE", "Record the receipt", "The patient is at the hospital's cashier; the voucher is issued.", { priority: "HIGH", dueAt: at(-2) }),
  work("ow4", "admit", "RECORD_ADMISSION_NUMBER", "Record the admission number", "Cleared for admission. The hospital's admission desk gives the number.", { dueAt: at(-4) }),
  work("ow1", "plan", "RESERVE_HOSPITAL", "Reserve the hospital", "Deposit settled. Flights, visa and the hospital reservation are still open."),
  work("ow2", "letter", "RECORD_ADMISSION_LETTER", "Record the admission letter", "Reserved at Nile Heart Hospital. The hospital's admission letter is not recorded yet.", { dueAt: at(-30) }),
  work("ow5", "depart", "CONFIRM_DEPARTURE", "Confirm the patient has left", "Return flight confirmed for this morning."),
];

const documents = [
  { documentId: "d1", fileName: "Nile Heart admission letter.pdf", contentType: "application/pdf", sizeBytes: 182000, status: "CLEAN", createdAt: at(60) },
  { documentId: "d2", fileName: "Passport copy.pdf", contentType: "application/pdf", sizeBytes: 640000, status: "CLEAN", createdAt: at(300) },
  { documentId: "d3", fileName: "Cashier receipt.jpg", contentType: "image/jpeg", sizeBytes: 210000, status: "CLEAN", createdAt: at(1) },
  { documentId: "d4", fileName: "Flight booking.pdf", contentType: "application/pdf", sizeBytes: 98000, status: "PENDING", createdAt: at(0.5) },
];
const facilities = [
  { id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "ACCREDITED", packages: [] },
  { id: "f2", name: "مستشفى الدلتا التخصصي للقلب والأوعية الدموية", city: "Alexandria", kind: "HOSPITAL", accreditationStatus: "ACCREDITED", packages: [] },
];

const actions = (stage: string, currentAction: Record<string, unknown>, available: string[] = []) =>
  ({ journeyStage: stage, waitingOn: "OPERATIONS", blockers: [], currentAction, availableActions: available });
const timeline = [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: at(600) }, { type: "STATUS", label: "Travel coordination", status: "TRAVEL_COORDINATION", occurredAt: at(120) }];
const travelPlan = (status: string, arrival: number | null, confirmed: number | null) =>
  ({ facilityId: "f1", facilityName: "Nile Heart Hospital", status, plannedArrival: arrival == null ? null : at(arrival), confirmedArrival: confirmed == null ? null : at(confirmed) });
const caseView = (id: OperationsCaseId) => {
  const caseSummary = cases[id];
  const common = { caseSummary, intakeSummary: "Adult patient travelling with one companion for a planned coronary procedure in Cairo.", timeline, tasks: [], messages: [], clinicalReviews: [],
    assignments: [{ id: "a1", assigneeSubject: "qa-coordinator", assigneeName: "Layla Hassan", assigneeRole: "OPERATIONS", assignmentType: "PRIMARY", status: "ACTIVE", assignedAt: at(120), version: 1 }] };
  switch (id) {
    case "plan": return { ...common, travelPlan: { facilityId: null, facilityName: null, status: "PLANNING", plannedArrival: null, confirmedArrival: null },
      actions: actions("TRAVEL_COORDINATION", { code: "RESERVE_HOSPITAL", kind: "FOCUS" }, ["RESERVE_HOSPITAL", "UPDATE_TRAVEL_PLAN"]) };
    case "letter": return { ...common, travelPlan: travelPlan("CONFIRMED", -72, null),
      actions: actions("TRAVEL_COORDINATION", { code: "RECORD_ADMISSION_LETTER", kind: "FOCUS" }, ["RECORD_ADMISSION_LETTER", "UPDATE_TRAVEL_PLAN"]) };
    case "balance": return { ...common, travelPlan: travelPlan("ARRIVED", 30, 28), timeline: [...timeline, { type: "STATUS", label: "Arrived", status: "ARRIVAL_CONFIRMED", occurredAt: at(28) }],
      actions: actions("ARRIVAL_CONFIRMED", { code: "RECORD_HOSPITAL_BALANCE", kind: "FOCUS" }) };
    case "admit": return { ...common, travelPlan: travelPlan("ARRIVED", 50, 48), timeline: [...timeline, { type: "STATUS", label: "Cleared", status: "ADMISSION_READY", occurredAt: at(3) }],
      actions: actions("ADMISSION_READY", { code: "RECORD_ADMISSION_NUMBER", kind: "FOCUS" }) };
    case "depart": return { ...common, travelPlan: travelPlan("ARRIVED", 400, 398), timeline: [...timeline, { type: "STATUS", label: "Discharged", status: "DISCHARGED", occurredAt: at(20) }],
      actions: actions("DISCHARGED", { code: "CONFIRM_DEPARTURE", kind: "FOCUS" }) };
  }
};

// P1-15's admission view (AdmissionPanel), as its own test defines it.
const voucher = (caseId: string) => ({ id: "v1", voucherNumber: `RS-V-${caseId}-1`, revision: 1, status: "ISSUED", packageTotalEgp: 200000, platformFeeEgp: 30000, depositPaidEgp: 34500,
  depositCreditEgp: 4500, feeBalanceEgp: 0, patientPaysAtFacilityEgp: 195500, displayCurrency: "USD", fxRate: 0.0204, fxRateDate: "2026-10-20", patientPaysAtFacilityDisplay: 3988.2, feeBalanceDisplay: 0, issuedAt: at(96) });
const letterRow = { id: "e1", kind: "FACILITY_ADMISSION_LETTER", documentId: "d1", reference: "NHH-77", amountEgp: 230000, recordedRole: "OPERATIONS", recordedAt: at(120), superseded: false,
  countersignedRole: "FINANCE", countersignedAt: at(118) };
const admission = (id: OperationsCaseId) => {
  const reserved = { caseId: id, emergencyOverride: false, admissionId: "a1", facilityId: "f1", facilityName: "Nile Heart Hospital", facilityCity: "Cairo", plannedAdmissionAt: at(-40),
    letterReferenceMaxEgp: 240000, balanceOwedEgp: 0, feeBalanceOwedEgp: 0 };
  switch (id) {
    case "plan": return { caseId: id, caseStatus: "TRAVEL_COORDINATION", emergencyOverride: false, pointOfNoReturnApproved: false, admissionBlockers: ["FINAL_QUOTE_NOT_ACCEPTED", "PROCEDURE_CONSENT_MISSING", "VOUCHER_NOT_ISSUED", "BALANCE_NOT_EVIDENCED"], evidence: [], balanceOwedEgp: null, feeBalanceOwedEgp: null };
    case "letter": return { ...reserved, caseStatus: "TRAVEL_COORDINATION", admissionStatus: "RESERVED", letterCheck: "NONE", pointOfNoReturnApproved: false,
      admissionBlockers: ["PROCEDURE_CONSENT_MISSING", "VOUCHER_NOT_ISSUED", "BALANCE_NOT_EVIDENCED"], evidence: [] };
    case "balance": return { ...reserved, caseStatus: "ARRIVAL_CONFIRMED", admissionStatus: "CONFIRMED", letterCheck: "WITHIN_ESTIMATE", pointOfNoReturnApproved: true, pointOfNoReturnAt: at(30),
      voucher: voucher(id), balanceOwedEgp: 195500, admissionBlockers: ["BALANCE_NOT_EVIDENCED"], evidence: [letterRow] };
    case "admit": return { ...reserved, caseStatus: "ADMISSION_READY", admissionStatus: "CONFIRMED", letterCheck: "WITHIN_ESTIMATE", pointOfNoReturnApproved: true, pointOfNoReturnAt: at(52),
      voucher: voucher(id), admissionBlockers: [], evidence: [letterRow, { id: "e2", kind: "BALANCE_EVIDENCED", documentId: "d3", reference: "NHH-CASH-5521", amountEgp: 195500,
        recordedRole: "OPERATIONS", recordedAt: at(6), effectiveAt: at(6.5), superseded: false, countersignedRole: "FINANCE", countersignedAt: at(4) }] };
    default: return null;
  }
};
// P1-17's discharge view (DischargePanel) after discharge: the return is booked, the departure not yet confirmed.
const discharge = (id: OperationsCaseId) => ({
  caseId: id, caseStatus: "DISCHARGED", fitToFlyHours: 72, readyForDischarge: true, reconciliationSettled: false, blockers: [],
  pack: ["DISCHARGE_SUMMARY", "MEDICATION_LIST", "OPERATIVE_NOTE", "FIT_TO_FLY"].map((kind, i) => ({ kind, requiredForDischarge: kind !== "FIT_TO_FLY", status: "DONE", recordedAt: at(30 - i) }))
    .concat([{ kind: "IMPLANT_RECORD", requiredForDischarge: false, status: "NOT_REQUIRED", recordedAt: at(0) }]),
  followUpPlan: { id: "p1", dueAt: at(-500), mode: "VIDEO" },
  finalInvoice: { id: "e7", reference: "NHH-INV-9031", amountEgp: 204000, recordedAt: at(26), effectiveAt: at(27), countersignedAt: at(22) },
  returnTravel: { evidenceId: "e9", mode: "FLIGHT", departureAt: at(-3), reference: "MS-912", confirmedAt: at(12) }, departedAt: null,
});
// P1-17's reconciliation as Operations reads it: the invoice is in, Finance is checking the lines.
const reconciliation = (id: OperationsCaseId) => ({
  caseId: id, caseStatus: "DISCHARGED", finalInvoice: { evidenceId: "e7", invoiceNumber: "NHH-INV-9031", amountEgp: 204000, issuedAt: at(27), documentId: "d1", countersigned: true },
  reconciliationId: "rc1", status: "OPEN", authorisedEgp: 200000, bandLimitEgp: 15000, quote: [], lines: [], chargedEgp: 204000, varianceEgp: 4000, disputedEgp: 0, paidAtFacilityEgp: 195500,
  needsCountersign: false, openedBy: "Finance", openedAt: at(20), facilityName: "Nile Heart Hospital", statements: [],
});

export async function setupOperationsDay(page: Page) {
  const portal = await setupPortal(page, "OPERATIONS", { pendingWork: false });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url()), api = url.pathname.replace("/api/v1", "");
    const reply = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    if (route.request().method() !== "GET") return route.fallback();
    if (api === "/work/mine") return reply(workItems);
    if (api === "/operations/cases") return reply(Object.values(cases));
    if (api === "/facilities/directory") return reply(facilities);
    const one = api.match(/^\/operations\/cases\/(plan|letter|balance|admit|depart)(\/.*)?$/);
    if (one) {
      const [, id, rest] = one as unknown as [string, OperationsCaseId, string | undefined];
      if (!rest) return reply(caseView(id));
      if (rest === "/admission") { const view = admission(id); return view ? reply(view) : route.fulfill({ status: 404, body: "" }); }
      if (rest === "/discharge") return reply(discharge(id));
      if (rest === "/reconciliation") return reply(reconciliation(id));
      return reply([]);
    }
    if (/^\/cases\/(plan|letter|balance|admit|depart)\/documents$/.test(api)) return reply(documents);
    return route.fallback();
  });
  return portal;
}
