import type { Page } from "@playwright/test";

import { setupPortal } from "./portal-fixture";

// UX area 4: a Finance working day on synthetic data only — one case per Finance moment: a bank transfer to verify, commercial
// terms to approve, a hospital letter above the estimate, a cashier receipt to countersign, a platform fee balance, a change
// order to price, a reconciliation to work, a variance above the band for a Finance Manager, a statement's e-invoice. Layered
// over `setupPortal` (routes registered later answer first). Every name, number and reference here is invented.
const at = (hoursAgo: number) => new Date(Date.UTC(2026, 9, 28, 9) - hoursAgo * 3600000).toISOString();
const coordinator = { coordinatorSubject: "owner", coordinatorName: "Layla Hassan" };
const base = { country: "Libya", careCategory: "cardiology", preferredLanguage: "ar", createdAt: at(900), updatedAt: at(4), version: 5, travelPackageRequested: true, myWorkCount: 1, ...coordinator };

export type FinanceCaseId = "deposit" | "approve" | "letter" | "receipt" | "fee" | "change" | "reconcile" | "variance" | "statement";
export const FINANCE_CASES: FinanceCaseId[] = ["deposit", "approve", "letter", "receipt", "fee", "change", "reconcile", "variance", "statement"];
const cases: Record<FinanceCaseId, Record<string, unknown>> = {
  deposit: { ...base, id: "deposit", caseNumber: "RS-2026-000041", patientName: "Maya Example", status: "ACCEPTED", updatedAt: at(1) },
  approve: { ...base, id: "approve", caseNumber: "RS-2026-000042", patientName: "عمر المثال", status: "PROPOSAL_PREPARATION" },
  letter: { ...base, id: "letter", caseNumber: "RS-2026-000043", patientName: "Huda Example", status: "TRAVEL_COORDINATION" },
  receipt: { ...base, id: "receipt", caseNumber: "RS-2026-000044", patientName: "Yusuf Example", status: "ARRIVAL_CONFIRMED" },
  fee: { ...base, id: "fee", caseNumber: "RS-2026-000045", patientName: "Salma Example", status: "ARRIVAL_CONFIRMED", preferredLanguage: "en", myWorkCount: 0 },
  change: { ...base, id: "change", caseNumber: "RS-2026-000046", patientName: "Karim Example", status: "TREATMENT_IN_PROGRESS" },
  reconcile: { ...base, id: "reconcile", caseNumber: "RS-2026-000047", patientName: "Nour Example", status: "DISCHARGED" },
  variance: { ...base, id: "variance", caseNumber: "RS-2026-000048", patientName: "ريم المثال", status: "DISCHARGED" },
  statement: { ...base, id: "statement", caseNumber: "RS-2026-000049", patientName: "Adam Example", status: "FOLLOW_UP", preferredLanguage: "en", myWorkCount: 0 },
};

const work = (id: string, caseId: FinanceCaseId, type: string, title: string, context: string, extra: Record<string, unknown> = {}) => ({
  id, caseId, caseNumber: cases[caseId].caseNumber, patientName: cases[caseId].patientName, caseStatus: cases[caseId].status, waitingOn: "FINANCE",
  careCategory: "cardiology", ...coordinator, documentCount: 4, type, title, context, priority: "NORMAL", status: "OPEN", blocking: false,
  dueAt: at(-20), overdue: false, createdAt: at(10), version: 0, copy: null, ...extra });
// In the backend's order (StaffWorkQueryService.QUEUE_ORDER): most urgent, then soonest due. The titles are FinanceWork's own.
const workItems = [
  work("fw1", "deposit", "DEPOSIT_RECORD", "Confirm the deposit transfer", "The patient sent a bank transfer reference for the deposit. Confirm the amount received or return it.", { priority: "HIGH", dueAt: at(-2) }),
  work("fw4", "receipt", "COUNTERSIGN_BALANCE", "Countersign the hospital receipt", "Operations recorded the cashier's receipt for the hospital balance. Check it, then countersign it.", { priority: "HIGH", dueAt: at(-3) }),
  work("fw3", "letter", "PRICE_VARIANCE", "Hospital price above the accepted estimate", "The hospital quoted more than the estimate the patient accepted. Accept it with a reason or refuse it before travel is confirmed.", { dueAt: at(2), overdue: true }),
  work("fw5", "change", "PRICE_CHANGE_ORDER", "Price a change order", "The Consultant proposed a change to the accepted treatment. Price every line; the band decides whether the patient must agree.", { dueAt: at(-6) }),
  work("fw7", "variance", "COUNTERSIGN_RECONCILIATION", "Countersign the reconciliation", "The variance on the hospital's final invoice is above the band. Approve it or return it to Finance.", { dueAt: at(-8) }),
  work("fw6", "reconcile", "RECONCILE_INVOICE", "Reconcile the hospital's final invoice", "The patient is discharged and the hospital's final invoice is in. Match its lines against what was authorised.", { dueAt: at(-30) }),
  { ...work("fw2", "approve", "APPROVE_COMMERCIAL_TERMS", "Approve commercial terms", "One line is priced outside the Consultant's approved list."), dueAt: at(-40) },
];

const documents = [
  { documentId: "d1", fileName: "Nile Heart admission letter.pdf", contentType: "application/pdf", sizeBytes: 182000, status: "CLEAN", createdAt: at(60) },
  { documentId: "d2", fileName: "Cashier receipt.jpg", contentType: "image/jpeg", sizeBytes: 210000, status: "CLEAN", createdAt: at(5) },
  { documentId: "d3", fileName: "Final invoice NHH-INV-9031.pdf", contentType: "application/pdf", sizeBytes: 320000, status: "CLEAN", createdAt: at(26) },
];

const actions = (stage: string, currentAction: Record<string, unknown>, available: string[] = []) =>
  ({ journeyStage: stage, waitingOn: "FINANCE", blockers: [], currentAction, availableActions: available });
// Finance's step is the open work item on the case (CaseActionService: WORK_ITEM with its type), or the approval step.
const item = (id: string) => {
  const w = workItems.find(row => row.id === id)!;
  return { code: "WORK_ITEM", kind: "FOCUS", title: w.title, context: w.context, workItemId: w.id, workItemVersion: 0, workType: w.type, dueAt: w.dueAt, overdue: w.overdue };
};
const none = { code: "NONE", kind: "NONE" };
const timeline = [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: at(900) }, { type: "STATUS", label: "Accepted", status: "ACCEPTED", occurredAt: at(400) }];
const travelPlan = (status: string, arrival: number | null, confirmed: number | null) =>
  ({ facilityId: "f1", facilityName: "Nile Heart Hospital", status, plannedArrival: arrival == null ? null : at(arrival), confirmedArrival: confirmed == null ? null : at(confirmed) });

// The proposal Finance approves (QA #19): one manual line, a facility package, the platform fee; USD for the patient.
const proposal = (id: string, status: string) => ({ proposalId: `p-${id}`, versionId: `v-${id}`, versionNumber: 1, status, language: "ar", currency: "USD", validUntil: at(-600),
  documentType: "PRELIMINARY_ESTIMATE", items: [
    { id: "i1", category: "MEDICAL", description: "Coronary bypass package", quantity: 1, unitPrice: 4032, optional: false },
    { id: "i2", category: "MEDICAL", description: "Bespoke lead extraction", quantity: 1, unitPrice: 1120, optional: false },
    { id: "i3", category: "PLATFORM", description: "Platform fee", quantity: 1, unitPrice: 620, optional: false },
  ] });
const commercial = { versionId: "v-approve", currency: "USD", fxRate: null, requiresFinanceApproval: true, policyName: "Cardiology margin", policyCareArea: "cardiology",
  policyVersion: 3, marginRate: 0.12, baseTotalEgp: 230000, marginEgp: 27600, patientTotalEgp: 288000, displayTotal: 5875.2,
  lines: [
    { id: "l1", description: "Coronary bypass package", source: "FACILITY_PACKAGE", quantity: 1, baseEgp: 180000, patientEgp: 201600, displayUnitPrice: 4032, facilityPackageId: "pkg-1", facilityName: "Nile Heart Hospital" },
    { id: "l2", description: "Bespoke lead extraction", source: "MANUAL", quantity: 1, baseEgp: 50000, patientEgp: 56000, displayUnitPrice: 1120 },
    { id: "l3", description: "Platform fee", source: "PLATFORM", quantity: 1, baseEgp: 0, patientEgp: 30400, displayUnitPrice: 620 },
  ] };
const gates = { operationsRequired: true, operationsReason: "Travel package requested", operationsCompleted: true, financeRequired: true,
  financeReasons: ["1 service is priced outside the Consultant's approved list."], financeCompleted: false, readyForRelease: false };
// DEP-3: the deposit in USD with the bank transfer reference the patient entered.
const deposit = { id: "dep1", status: "REQUESTED", currency: "USD", totalEgp: 43200, totalDisplay: 881.28, paidDisplay: 0, balanceDisplay: 881.28, paidEgp: 0, balanceEgp: 43200,
  components: [{ beneficiary: "Rehlet Shifaa", purpose: "Treatment deposit", amountEgp: 43200, amountDisplay: 881.28, refundability: "REFUNDABLE_BEFORE_TRAVEL", creditedToFinal: true }],
  events: [], transfer: { id: "t1", method: "BANK_TRANSFER", reference: "QNB-2026-10-27-558211", status: "SUBMITTED", submittedAt: at(3), version: 0 } };
const paidDeposit = { ...deposit, status: "PAID", paidDisplay: 881.28, balanceDisplay: 0, paidEgp: 43200, balanceEgp: 0, transfer: { ...deposit.transfer, status: "CONFIRMED", decidedAt: at(300) } };

const caseView = (id: FinanceCaseId) => {
  const caseSummary = cases[id];
  const common = { caseSummary, intakeSummary: "Adult patient travelling with one companion for a planned coronary procedure in Cairo.", timeline, tasks: [], messages: [], clinicalReviews: [],
    assignments: [{ id: "a1", assigneeSubject: "qa-finance", assigneeName: "Layla Hassan", assigneeRole: "FINANCE", assignmentType: "PRIMARY", status: "ACTIVE", assignedAt: at(400), version: 1 },
      { id: "a2", assigneeSubject: "ops", assigneeName: "Tarek Example", assigneeRole: "OPERATIONS", assignmentType: "PRIMARY", status: "ACTIVE", assignedAt: at(400), version: 1 }] };
  const accepted = { proposal: proposal(id, "ACCEPTED"), deposit: paidDeposit };
  switch (id) {
    case "deposit": return { ...common, proposal: proposal(id, "ACCEPTED"), deposit, actions: actions("ACCEPTED", item("fw1"), ["RECORD_DEPOSIT_PAYMENT"]) };
    case "approve": return { ...common, proposal: proposal(id, "OPERATIONS_COMPLETED"), commercial, gates,
      actions: actions("PROPOSAL_PREPARATION", { code: "APPROVE_COMMERCIAL_TERMS", kind: "FOCUS" }, ["APPROVE_COMMERCIAL_TERMS"]) };
    case "letter": return { ...common, ...accepted, travelPlan: travelPlan("CONFIRMED", -72, null), actions: actions("TRAVEL_COORDINATION", item("fw3")) };
    case "receipt": return { ...common, ...accepted, travelPlan: travelPlan("ARRIVED", 30, 28), actions: actions("ARRIVAL_CONFIRMED", item("fw4")) };
    case "fee": return { ...common, ...accepted, travelPlan: travelPlan("ARRIVED", 30, 28), actions: actions("ARRIVAL_CONFIRMED", none) };
    case "change": return { ...common, ...accepted, travelPlan: travelPlan("ARRIVED", 120, 118), actions: actions("TREATMENT_IN_PROGRESS", item("fw5")) };
    case "reconcile": return { ...common, ...accepted, travelPlan: travelPlan("ARRIVED", 400, 398), actions: actions("DISCHARGED", item("fw6")) };
    case "variance": return { ...common, ...accepted, travelPlan: travelPlan("ARRIVED", 400, 398), actions: actions("DISCHARGED", item("fw7")) };
    case "statement": return { ...common, ...accepted, travelPlan: travelPlan("ARRIVED", 700, 698), actions: actions("FOLLOW_UP", none) };
  }
};

// P1-15's admission view as Finance reads it.
const voucher = (caseId: string, feeBalanceEgp = 0) => ({ id: "v1", voucherNumber: `RS-V-${caseId}-1`, revision: 1, status: "ISSUED", packageTotalEgp: 200000, platformFeeEgp: 30000, depositPaidEgp: 43200,
  depositCreditEgp: 13200, feeBalanceEgp, patientPaysAtFacilityEgp: 186800, displayCurrency: "USD", fxRate: 0.0204, fxRateDate: "2026-10-20", patientPaysAtFacilityDisplay: 3810.72,
  feeBalanceDisplay: feeBalanceEgp * 0.0204, issuedAt: at(96) });
const letterRow = (amountEgp: number, countersigned: boolean) => ({ id: "e1", kind: "FACILITY_ADMISSION_LETTER", documentId: "d1", reference: "NHH-77", amountEgp, recordedRole: "OPERATIONS",
  recordedBy: "Tarek Example", recordedAt: at(20), superseded: false, ...(countersigned ? { countersignedRole: "FINANCE", countersignedAt: at(118) } : {}) });
const receiptRow = (countersigned: boolean) => ({ id: "e2", kind: "BALANCE_EVIDENCED", documentId: "d2", reference: "NHH-CASH-5521", amountEgp: 186800, recordedRole: "OPERATIONS",
  recordedBy: "Tarek Example", recordedAt: at(5), effectiveAt: at(5.5), superseded: false, ...(countersigned ? { countersignedRole: "FINANCE", countersignedAt: at(4) } : {}) });
const admission = (id: FinanceCaseId) => {
  const reserved = { caseId: id, emergencyOverride: false, admissionId: "a1", facilityId: "f1", facilityName: "Nile Heart Hospital", facilityCity: "Cairo", plannedAdmissionAt: at(-40),
    letterReferenceMaxEgp: 240000, balanceOwedEgp: 0, feeBalanceOwedEgp: 0 };
  switch (id) {
    case "letter": return { ...reserved, caseStatus: "TRAVEL_COORDINATION", admissionStatus: "RESERVED", letterCheck: "VARIANCE_OPEN", pointOfNoReturnApproved: false,
      admissionBlockers: ["PRICE_VARIANCE_OPEN", "VOUCHER_NOT_ISSUED", "BALANCE_NOT_EVIDENCED"], evidence: [letterRow(262500, false)] };
    case "receipt": return { ...reserved, caseStatus: "ARRIVAL_CONFIRMED", admissionStatus: "CONFIRMED", letterCheck: "WITHIN_ESTIMATE", pointOfNoReturnApproved: true, pointOfNoReturnAt: at(30),
      voucher: voucher(id), balanceOwedEgp: 186800, admissionBlockers: ["BALANCE_NOT_EVIDENCED"], evidence: [letterRow(230000, true), receiptRow(false)] };
    case "fee": return { ...reserved, caseStatus: "ARRIVAL_CONFIRMED", admissionStatus: "CONFIRMED", letterCheck: "WITHIN_ESTIMATE", pointOfNoReturnApproved: true, pointOfNoReturnAt: at(30),
      voucher: voucher(id, 12500), feeBalanceOwedEgp: 12500, admissionBlockers: ["FEE_BALANCE_NOT_PAID"], evidence: [letterRow(230000, true), receiptRow(true)] };
    case "change": return { ...reserved, caseStatus: "TREATMENT_IN_PROGRESS", admissionStatus: "ADMITTED", letterCheck: "WITHIN_ESTIMATE", pointOfNoReturnApproved: true, pointOfNoReturnAt: at(130),
      admissionNumber: "NHH-ADM-30117", voucher: voucher(id), admissionBlockers: [], evidence: [letterRow(230000, true), receiptRow(true)] };
    default: return null;
  }
};
// P1-16's treatment view: a change order to price and an interim bill to countersign.
const treatment = {
  caseId: "change", caseStatus: "TREATMENT_IN_PROGRESS", nextMilestoneDueAt: at(-20),
  milestones: [{ id: "m1", kind: "ADMITTED", occurredAt: at(100), recordedRole: "CONSULTANT", recordedAt: at(99), needsCountersign: false, countersigned: false, superseded: false },
    { id: "m2", kind: "PROCEDURE_COMPLETED", occurredAt: at(50), recordedRole: "CONSULTANT", recordedAt: at(49), needsCountersign: false, countersigned: false, superseded: false }],
  changeOrders: [
    { id: "o1", orderNumber: "RS-CO-RS-2026-000046-1", status: "PROPOSED", emergency: false, reason: "A second stent is needed", proposedBy: "Dr. Example", proposedAt: at(7),
      lines: [{ id: "l1", lineNo: 1, kind: "IMPLANT", description: "Drug-eluting stent", quantity: 1, unitEgp: null, lineEgp: null },
        { id: "l2", lineNo: 2, kind: "EXTRA_NIGHT", description: "Extra ICU night", quantity: 2, unitEgp: null, lineEgp: null }], totalEgp: null },
  ],
  money: { packageEgp: 200000, changeOrdersEgp: 0, authorisedEgp: 200000, interimBilledEgp: 96500, interimPendingEgp: 96500, varianceEgp: -103500, bandLimitEgp: 15000, bandUsedEgp: 0 },
  interimBills: [{ id: "b1", kind: "INTERIM_BILL", reference: "NHH-IB-7", amountEgp: 96500, effectiveAt: at(30), recordedRole: "OPERATIONS", recordedAt: at(29), superseded: false }],
  checklist: [{ stage: "TREATMENT", complete: false, items: [{ code: "MILESTONE_ADMITTED", required: true, done: true }, { code: "MILESTONE_PROCEDURE_COMPLETED", required: true, done: true }] }],
};
// P1-17's reconciliation: the authorised side, the invoice lines, the statements.
const quote = [
  { source: "PACKAGE", matchedId: null, orderNumber: "RS-AV-1", description: "Coronary bypass package", quantity: 1, authorisedEgp: 200000 },
  { source: "CHANGE_ORDER_LINE", matchedId: "col-1", orderNumber: "RS-CO-2", kind: "EXTRA_NIGHT", description: "Extra ICU night", quantity: 2, authorisedEgp: 24690 },
];
const invoice = { evidenceId: "e7", invoiceNumber: "NHH-INV-9031", amountEgp: 247350, issuedAt: at(27), documentId: "d3", countersigned: true };
const statement = (id: string) => ({
  id: "s1", kind: "DISCHARGE", statementNumber: `RS-ST-${id}-1`, revision: 1, current: true, issuedAt: at(200), displayCurrency: "USD", fxRate: 0.0204, issuedBy: "Finance",
  totals: { packageEgp: 200000, changeOrdersEgp: 24690, medicalChargedEgp: 224690, platformFeeEgp: 30000, totalChargedEgp: 254690, totalChargedDisplay: 5195.68, depositPaidEgp: 43200,
    feeBalancePaidEgp: 0, paidAtFacilityEgp: 186800, refundedEgp: 0, balanceDueEgp: 24690, balanceDueDisplay: 503.68, creditDueEgp: 0, creditDueDisplay: 0 },
  lines: [{ kind: "PACKAGE", description: "Coronary bypass package", amountEgp: 200000, amountDisplay: 4080 }, { kind: "CHANGE_ORDER", description: "Extra ICU night × 2", amountEgp: 24690, amountDisplay: 503.68 },
    { kind: "PLATFORM_FEE", amountEgp: 30000, amountDisplay: 612 }, { kind: "DEPOSIT_PAID", amountEgp: -43200, amountDisplay: -881.28 }, { kind: "PAID_AT_FACILITY", amountEgp: -186800, amountDisplay: -3810.72 }],
});
const reconciliation = (id: FinanceCaseId) => {
  const opened = { caseId: id, caseStatus: cases[id].status, finalInvoice: invoice, reconciliationId: "rc1", authorisedEgp: 224690, bandLimitEgp: 15000, quote, needsCountersign: false,
    paidAtFacilityEgp: 186800, openedBy: "Finance", openedAt: at(20), facilityName: "Nile Heart Hospital", statements: [] as unknown[] };
  const lines = [
    { lineNo: 1, description: "Coronary bypass package", invoiceEgp: 200000, source: "PACKAGE", authorisedEgp: 200000, chargedEgp: 200000, varianceEgp: 0, varianceCode: "WITHIN_BAND" },
    { lineNo: 2, description: "ICU night", invoiceEgp: 24690, source: "CHANGE_ORDER_LINE", matchedId: "col-1", authorisedEgp: 24690, chargedEgp: 24690, varianceEgp: 0, varianceCode: "WITHIN_BAND" },
    { lineNo: 3, description: "Telemetry monitoring, 4 days", invoiceEgp: 22660, source: "NONE", authorisedEgp: null, chargedEgp: 0, varianceEgp: 22660, varianceCode: "UNAPPROVED_EXTRA" },
  ];
  switch (id) {
    case "reconcile": return { ...opened, status: "OPEN", lines: [] };
    case "variance": return { ...opened, status: "AWAITING_COUNTERSIGN", needsCountersign: true, lines, chargedEgp: 224690, varianceEgp: 22660, disputedEgp: 22660, submittedBy: "Finance", submittedAt: at(9),
      note: "Telemetry was ordered by the ward and not on the change order." };
    case "statement": return { ...opened, caseStatus: "FOLLOW_UP", status: "CLOSED", lines: lines.slice(0, 2), finalInvoice: { ...invoice, amountEgp: 224690 }, chargedEgp: 224690, varianceEgp: 0, disputedEgp: 0,
      submittedAt: at(230), settledAt: at(210), statements: [statement(id)] };
    default: return null;
  }
};

export async function setupFinanceDay(page: Page) {
  const portal = await setupPortal(page, "FINANCE", { pendingWork: false });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url()), api = url.pathname.replace("/api/v1", "");
    const reply = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    if (route.request().method() !== "GET") return route.fallback();
    if (api === "/work/mine") return reply(workItems);
    if (api === "/finance/cases") return reply(Object.values(cases));
    const one = api.match(/^\/finance\/cases\/([a-z]+)(\/.*)?$/);
    if (one && (FINANCE_CASES as string[]).includes(one[1])) {
      const id = one[1] as FinanceCaseId, rest = one[2];
      const view = (data: unknown) => data ? reply(data) : route.fulfill({ status: 404, body: "" });
      if (!rest) return reply(caseView(id));
      if (rest === "/admission") return view(admission(id));
      if (rest === "/treatment") return view(id === "change" ? treatment : null);
      if (rest === "/reconciliation") return view(reconciliation(id));
      return reply([]);
    }
    if (/^\/cases\/[a-z]+\/documents$/.test(api)) return reply(documents);
    return route.fallback();
  });
  return portal;
}
