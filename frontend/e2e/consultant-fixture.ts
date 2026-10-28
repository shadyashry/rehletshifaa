import type { Page } from "@playwright/test";

import { setupPortal } from "./portal-fixture";

// UX area 3: a Consultant's working day on synthetic data only — a case to review, one to assess in person, one in
// treatment, one going home, one in follow-up, and the Consultant's virtual clinic. Layered over `setupPortal` (routes
// registered later answer first). Every name, number and finding here is invented.
const at = (hoursAgo: number) => new Date(Date.UTC(2026, 9, 16, 12) - hoursAgo * 3600000).toISOString();
const coordinator = { coordinatorSubject: "owner", coordinatorName: "Layla Hassan" };
const base = { country: "Libya", careCategory: "cardiology", preferredLanguage: "ar", createdAt: at(400), updatedAt: at(4), version: 3, travelPackageRequested: true, ...coordinator };

export type ConsultantCaseId = "review" | "assess" | "treat" | "discharge" | "follow";
const cases: Record<ConsultantCaseId, Record<string, unknown>> = {
  review: { ...base, id: "review", caseNumber: "RS-2026-000011", patientName: "Maya Example", status: "CONSULTANT_REVIEW", updatedAt: at(3) },
  assess: { ...base, id: "assess", caseNumber: "RS-2026-000012", patientName: "Omar Example", status: "ARRIVAL_CONFIRMED", careCategory: "cardiology" },
  treat: { ...base, id: "treat", caseNumber: "RS-2026-000013", patientName: "Huda Example", status: "TREATMENT_IN_PROGRESS" },
  discharge: { ...base, id: "discharge", caseNumber: "RS-2026-000014", patientName: "Yusuf Example", status: "TREATMENT_IN_PROGRESS" },
  follow: { ...base, id: "follow", caseNumber: "RS-2026-000015", patientName: "Salma Example", status: "FOLLOW_UP", preferredLanguage: "en" },
};

const work = (id: string, caseId: ConsultantCaseId, type: string, title: string, context: string, extra: Record<string, unknown> = {}) => ({
  id, caseId, caseNumber: cases[caseId].caseNumber, patientName: cases[caseId].patientName, caseStatus: cases[caseId].status, waitingOn: "CONSULTANT",
  careCategory: "cardiology", ...coordinator, documentCount: 3, type, title, context, priority: "NORMAL", status: "OPEN", blocking: false,
  dueAt: at(-20), overdue: false, createdAt: at(10), version: 0, copy: null, ...extra });
// In the backend's order (StaffWorkQueryService.QUEUE_ORDER): most urgent, then soonest due.
const workItems = [
  work("cw4", "follow", "REVIEW_COMPLICATION", "Review a reported complication", "The patient's representative reported a fever at the day-30 check.", { priority: "URGENT", overdue: true, dueAt: at(2) }),
  work("cw1", "review", "CLINICAL_REVIEW", "Review the case and record your recommendation", "The coordinator prepared the case; three documents are ready.", { priority: "HIGH", dueAt: at(-6) }),
  work("cw2", "treat", "COUNTERSIGN_MILESTONE", "Countersign a treatment milestone", "Operations recorded \"Procedure started\" from the hospital's admission desk."),
  // The backend's own item (DischargeService.PACK_WORK) with its wording code, as My work receives it.
  work("cw3", "discharge", "DISCHARGE_PACK", "Complete the discharge pack", "The medication list and the follow-up plan are still missing.", { dueAt: at(-30), copy: { code: "DISCHARGE_PACK", params: { caseNumber: "RS-2026-000014" } } }),
];

const documents = [
  { documentId: "d1", fileName: "Echo report.pdf", contentType: "application/pdf", sizeBytes: 482000, status: "CLEAN", createdAt: at(200) },
  { documentId: "d2", fileName: "Coronary angiogram.pdf", contentType: "application/pdf", sizeBytes: 1220000, status: "CLEAN", createdAt: at(190) },
  { documentId: "d3", fileName: "ECG.jpg", contentType: "image/jpeg", sizeBytes: 220000, status: "PENDING", createdAt: at(1) },
];
const catalog = [
  { id: "s1", serviceCode: "CARD-REV", serviceName: "Initial medical-case review", category: "Review", priceEgp: 3500, active: true },
  { id: "s2", serviceCode: "CARD-PCI", serviceName: "Coronary angioplasty with one stent (Consultant fee)", category: "Procedure", priceEgp: 45000, active: true },
  { id: "s3", serviceCode: "CARD-FU", serviceName: "Follow-up video consultation", category: "Follow-up", priceEgp: 2000, active: true },
];
const fxRates = [{ currency: "USD", rate: 0.0204, rateDate: "2026-10-15", source: "CBE" }, { currency: "LYD", rate: 0.0985, rateDate: "2026-10-15", source: "CBE" }];
const facilities = [{ id: "f1", name: "Nile Heart Hospital", city: "Cairo", kind: "HOSPITAL", accreditationStatus: "ACCREDITED",
  packages: [{ id: "p1", procedureCode: "PCI-1", name: "Cath lab, one night, standard ward", careCategory: "cardiology", minEgp: 85000, maxEgp: 110000 }] }];

const review = { id: "r1", versionNumber: 1, status: "APPROVED", recommendedTreatment: "Coronary angioplasty with one drug-eluting stent to the left anterior descending artery.",
  risksAndLimitations: "Subject to the in-person assessment and a repeat angiogram on arrival.", createdAt: at(300), proposalCurrency: "USD",
  costEstimates: [{ serviceDescription: "Coronary angioplasty with one stent (Consultant fee)", estimatedCost: 45000, currency: "EGP", catalogServiceId: "s2" }] };

const actions = (stage: string, currentAction: Record<string, unknown>, available: string[] = []) =>
  ({ journeyStage: stage, waitingOn: "CONSULTANT", blockers: [], currentAction, availableActions: available });
const timeline = [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: at(400) }, { type: "STATUS", label: "Consultant review", status: "CONSULTANT_REVIEW", occurredAt: at(30) }];
const caseView = (id: ConsultantCaseId) => {
  const caseSummary = cases[id];
  const common = { caseSummary, intakeSummary: "Adult patient with exertional chest pain; a recent angiogram shows a significant narrowing of one coronary artery. Asking for an interventional opinion in Egypt.",
    timeline, tasks: [], messages: [], assignments: [{ id: "a1", assigneeSubject: "qa-coordinator", assigneeName: "Dr Samir Example", assigneeRole: "DOCTOR", assignmentType: "PRIMARY", status: "ACTIVE", assignedAt: at(30), version: 1 }] };
  switch (id) {
    case "review": return { ...common, clinicalReviews: [], actions: actions("CONSULTANT_REVIEW", { code: "RECORD_CLINICAL_DECISION", kind: "FOCUS", workItemId: "cw1", workItemVersion: 0 }, ["RECORD_CLINICAL_DECISION"]) };
    // The backend gives the Consultant no step at arrival yet (CaseActionService: none()); the final assessment is on the page by stage.
    case "assess": return { ...common, clinicalReviews: [review], actions: actions("ARRIVAL_CONFIRMED", { code: "NONE", kind: "NONE" }) };
    case "treat": return { ...common, clinicalReviews: [review], actions: actions("TREATMENT_IN_PROGRESS", { code: "WORK_ITEM", kind: "FOCUS", workType: "COUNTERSIGN_MILESTONE", workItemId: "cw2", workItemVersion: 0, title: "Countersign a treatment milestone" }) };
    case "discharge": return { ...common, clinicalReviews: [review], actions: actions("TREATMENT_IN_PROGRESS", { code: "WORK_ITEM", kind: "FOCUS", workType: "DISCHARGE_PACK", workItemId: "cw3", workItemVersion: 0, title: "Complete the discharge pack",
      copy: { code: "DISCHARGE_PACK", params: { caseNumber: "RS-2026-000014" } } }) };
    // Discharged 30 days ago (the timeline's DISCHARGED entry is the stamp's date).
    case "follow": return { ...common, timeline: [...timeline, { type: "STATUS", label: "Discharged", status: "DISCHARGED", occurredAt: at(720) }, { type: "STATUS", label: "Follow-up", status: "FOLLOW_UP", occurredAt: at(700) }],
      clinicalReviews: [review], actions: actions("FOLLOW_UP", { code: "WORK_ITEM", kind: "FOCUS", workType: "REVIEW_COMPLICATION", workItemId: "cw4", workItemVersion: 0, title: "Review a reported complication", overdue: true }) };
  }
};

// The P1-16/17/18 views as their own tests define them (TreatmentPanel/DischargePanel/FollowUpPanel tests), with synthetic dates.
const treatment = (caseId: string) => ({
  caseId, caseStatus: "TREATMENT_IN_PROGRESS", nextMilestoneDueAt: at(-20),
  milestones: [
    { id: "m1", kind: "ADMITTED", occurredAt: at(52), recordedRole: "CONSULTANT", recordedAt: at(51), needsCountersign: false, countersigned: false, superseded: false },
    { id: "m2", kind: "PROCEDURE_STARTED", occurredAt: at(5), recordedRole: "OPERATIONS", recordedAt: at(4.8), needsCountersign: true, countersigned: false, note: "Started on time", superseded: false },
  ],
  changeOrders: [
    { id: "o1", orderNumber: "RS-CO-RS-2026-000013-1", status: "PROPOSED", emergency: false, reason: "A second stent is needed", proposedAt: at(3),
      lines: [{ id: "l1", lineNo: 1, kind: "IMPLANT", description: "Drug-eluting stent", quantity: 1, unitEgp: null, lineEgp: null }], totalEgp: null },
  ],
  money: { packageEgp: 200000, changeOrdersEgp: 0, authorisedEgp: 200000, interimBilledEgp: 96000, interimPendingEgp: null, varianceEgp: 0, bandLimitEgp: 15000, bandUsedEgp: 0 },
  interimBills: [],
  checklist: [
    { stage: "ADMISSION", complete: true, items: [{ code: "ADMISSION_RESERVED", required: false, done: true }, { code: "ADMISSION_NUMBER", required: true, done: true }] },
    { stage: "TREATMENT", complete: false, items: [{ code: "MILESTONE_ADMITTED", required: true, done: true }, { code: "MILESTONE_PROCEDURE_COMPLETED", required: true, done: false }] },
  ],
});
const discharged = (caseId: string) => ({
  caseId, caseStatus: "FOLLOW_UP", fitToFlyHours: 72, readyForDischarge: true, reconciliationSettled: true, blockers: [],
  pack: ["DISCHARGE_SUMMARY", "MEDICATION_LIST", "OPERATIVE_NOTE", "FIT_TO_FLY"].map((kind, i) => ({ kind, requiredForDischarge: kind !== "FIT_TO_FLY", status: "DONE", recordedAt: at(730 - i) }))
    .concat([{ kind: "IMPLANT_RECORD", requiredForDischarge: false, status: "NOT_REQUIRED", recordedAt: at(0) }]),
  followUpPlan: { id: "p1", dueAt: at(500), mode: "VIDEO" },
  returnTravel: { evidenceId: "e9", mode: "FLIGHT", departureAt: at(700), reference: "MS-912", confirmedAt: at(710) }, departedAt: at(700),
});
const discharge = (caseId: string) => caseId === "follow" ? discharged(caseId) : ({
  caseId, caseStatus: "TREATMENT_IN_PROGRESS", fitToFlyHours: 72, readyForDischarge: false, reconciliationSettled: false,
  pack: [
    { kind: "DISCHARGE_SUMMARY", requiredForDischarge: true, status: "DONE", recordedAt: at(6), diagnosis: "Coronary artery disease", warningSigns: "Chest pain or breathlessness" },
    { kind: "MEDICATION_LIST", requiredForDischarge: true, status: "MISSING" },
    { kind: "OPERATIVE_NOTE", requiredForDischarge: true, status: "DONE", recordedAt: at(30) },
    { kind: "IMPLANT_RECORD", requiredForDischarge: false, status: "NOT_REQUIRED" },
    { kind: "FIT_TO_FLY", requiredForDischarge: false, status: "BEFORE_RETURN" },
  ],
  blockers: [{ code: "MEDICATION_LIST_MISSING", label: "Medication list missing" }, { code: "FOLLOW_UP_PLAN_MISSING", label: "Follow-up plan missing" }, { code: "FINAL_INVOICE_MISSING", label: "Final invoice missing" }],
});
const followUp = (caseId: string) => ({
  caseId, caseStatus: "FOLLOW_UP", reopenAvailable: false,
  window: { dischargedAt: at(720), freeDays: 30, endsAt: at(-24), closedAt: null },
  plan: { id: "p1", dueAt: at(500), mode: "VIDEO", requiredTests: "ECG the day before", instructions: null },
  contacts: [
    { id: "k1", origin: "PLAN", dueAt: at(500), mode: "VIDEO", status: "DONE", recordedAt: at(499), note: "Wound healing well" },
    { id: "k2", origin: "ADDED", dueAt: at(-48), mode: "PHONE", status: "SCHEDULED", reminderSentAt: null },
  ],
  checkIns: [
    { point: "D3", dueAt: at(650), status: "DONE", outcome: "REACHED", note: "Comfortable at home", recordedAt: at(649) },
    { point: "D14", dueAt: at(380), status: "DONE", outcome: "REACHED", recordedAt: at(379) },
    { point: "D30", dueAt: at(2), status: "DUE" },
  ],
  outcomes: [{ point: "D30", requestedAt: at(6), open: false, reportedAt: at(3), channel: "SECURE_LINK", reportedRole: "PATIENT_REPRESENTATIVE",
    pain: 3, function: 7, satisfaction: 9, complication: true, complicationNote: "Fever since yesterday", incidentId: "i1" }],
  closureBlockers: [{ code: "FOLLOW_UP_WINDOW_OPEN", label: "window open" }, { code: "COMPLICATION_UNDER_REVIEW", label: "complication" }],
});

// P1-15's admission view (AdmissionPanel mounts for the Consultant from arrival through treatment), as its own test defines it.
const admission = (caseId: string, caseStatus: string) => ({
  caseId, caseStatus, pointOfNoReturnApproved: caseStatus !== "ARRIVAL_CONFIRMED", emergencyOverride: false, admissionId: "a1", facilityId: "f1", facilityName: "Nile Heart Hospital", facilityCity: "Cairo",
  plannedAdmissionAt: at(-40), admissionStatus: caseStatus === "ARRIVAL_CONFIRMED" ? "CONFIRMED" : "ADMITTED", letterCheck: "WITHIN_ESTIMATE", letterReferenceMaxEgp: 240000,
  voucher: { id: "v1", voucherNumber: `RS-V-${caseId}-1`, revision: 1, status: "ISSUED", packageTotalEgp: 200000, platformFeeEgp: 30000, depositPaidEgp: 34500, depositCreditEgp: 4500,
    feeBalanceEgp: 0, patientPaysAtFacilityEgp: 195500, displayCurrency: "USD", fxRate: 0.0204, fxRateDate: "2026-10-12", patientPaysAtFacilityDisplay: 3988.2, feeBalanceDisplay: 0, issuedAt: at(96) },
  balanceOwedEgp: caseStatus === "ARRIVAL_CONFIRMED" ? 195500 : 0, feeBalanceOwedEgp: 0, admissionBlockers: caseStatus === "ARRIVAL_CONFIRMED" ? ["BALANCE_NOT_EVIDENCED"] : [],
  evidence: [{ id: "e1", kind: "FACILITY_ADMISSION_LETTER", documentId: "d1", reference: "NHH-77", amountEgp: 230000, recordedRole: "OPERATIONS", recordedAt: at(120), superseded: false,
    countersignedRole: "FINANCE", countersignedAt: at(118) }],
});

// The virtual clinic (VirtualClinic.tsx's contract): the Consultant owns it; one practice manager helps with the schedule.
const clinic = {
  practitionerId: "pr-1", relation: "OWNER", permissions: [], version: 4, managerChangesRequireApproval: true,
  professional: { displayName: "Dr Samir Example", specialty: "Cardiology", subspecialty: "Interventional cardiology", careArea: "cardiology", careAreaEn: "Cardiology", careAreaAr: "أمراض القلب",
    credentialingStatus: "VERIFIED", credentialsCurrent: true, capabilities: [{ type: "PROCEDURE", code: "PCI", label: "Coronary angioplasty and stenting" }, { type: "PROCEDURE", code: "TAVI", label: "Transcatheter valve implantation" }],
    languages: "Arabic, English", availabilityStatus: "AVAILABLE", expectedReviewHours: 48, assignable: true, practitionerVersion: 2 },
  publicProfile: { displayName: "Dr Samir Example", headline: "Interventional cardiologist", bio: "Twenty years of practice in coronary and structural heart interventions.", languages: "Arabic, English", publishedAt: at(900) },
  draft: { displayName: "Dr Samir Example", headline: "Interventional cardiologist, Cairo", bio: "Twenty years of practice in coronary and structural heart interventions.", languages: "Arabic, English, French", status: "DRAFT", updatedAt: at(20), updatedByName: "Rana Example", updatedByRole: "PRACTICE_MANAGER" },
  services: catalog.map((s, i) => ({ id: s.id, serviceCode: s.serviceCode, serviceName: s.serviceName, serviceKind: ["INITIAL_CASE_REVIEW", "PROFESSIONAL_FEE", "FOLLOW_UP_CONSULTATION"][i], currency: "EGP",
    priceEgp: s.priceEgp, priceMaxEgp: i === 1 ? 52000 : null, effectiveFrom: "2026-09-01", validUntil: null, active: true, approvalStatus: i === 1 ? "PLATFORM_MANAGED" : "CONSULTANT_APPROVED", revision: i + 1 })),
  pendingChanges: [{ id: "sc1", serviceId: "s3", changeType: "UPDATE", serviceCode: "CARD-FU", serviceName: "Follow-up video consultation", serviceKind: "FOLLOW_UP_CONSULTATION", currency: "EGP",
    priceEgp: 2500, effectiveFrom: "2026-11-01", status: "PENDING_APPROVAL", proposedByName: "Rana Example", proposedByRole: "PRACTICE_MANAGER", proposedAt: at(20), version: 0 }],
  slots: [{ id: "sl1", startsAt: at(-26), endsAt: at(-26.5), mode: "VIDEO", status: "OPEN", note: null, version: 0 }, { id: "sl2", startsAt: at(-50), endsAt: at(-50.5), mode: "IN_PERSON", status: "OPEN", note: "Room 4", version: 0 }],
  managers: [{ id: "pm-1", name: "Rana Example", email: "rana@example.test", status: "ACTIVE", permissions: ["SCHEDULE", "PROFILE"], invitedAt: at(1000), version: 1 }],
};
// P1-19's real contract (`AffiliationsView`, UX 3-3): a current declaration ending within the month, an earlier one it replaced, and one
// facility used before it was declared. The review fields are null for the Consultant, as the backend sends them.
const declared = (id: string, hoursAgo: number, validHoursAhead: number, lines: { facilityId: string; facilityName: string; kind: string }[], supersededAt: string | null) => ({
  id, practitionerId: "pr-1", consultantName: "Dr Samir Example", declaredAt: at(hoursAgo), validUntil: at(-validHoursAhead), current: !supersededAt, supersededAt,
  attestationVersion: "affiliation-attestation-2026-10", reviewStatus: null, reviewedAt: null, reviewNote: null, lines });
const affiliations = {
  practitionerId: "pr-1", declarationCurrent: true, renewBy: at(-24 * 14), attestationVersion: "affiliation-attestation-2026-10",
  current: declared("dc2", 24 * 351, 24 * 14, [{ facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "PRIVILEGES" },
    { facilityId: "f9", facilityName: "Delta Imaging Centre", kind: "NONE_DECLARED" }], null),
  history: [declared("dc1", 24 * 720, -24 * 340, [{ facilityId: "f1", facilityName: "Nile Heart Hospital", kind: "PRIVILEGES" }], at(24 * 351))],
  flags: [{ id: "af1", caseId: "treat", caseNumber: "RS-2026-000412", practitionerId: "pr-1", consultantName: "Dr Samir Example", facilityId: "f8", facilityName: "Garden City Clinic",
    code: "UNDECLARED_FACILITY", raisedAt: at(30), clearedAt: null }],
};
const audit = [{ event: "CLINIC_SERVICE_CHANGE_PROPOSED", action: "PROPOSE", actorName: "Rana Example", actorRole: "PRACTICE_MANAGER", occurredAt: at(20) },
  { event: "CLINIC_PROFILE_PUBLISHED", action: "PUBLISH", actorName: "Dr Samir Example", actorRole: "DOCTOR", occurredAt: at(900) }];

export async function setupConsultantDay(page: Page) {
  const portal = await setupPortal(page, "DOCTOR", { pendingWork: false });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url()), api = url.pathname.replace("/api/v1", "");
    const reply = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    if (route.request().method() !== "GET") return route.fallback();
    if (api === "/work/mine") return reply(workItems);
    if (api === "/doctor/cases") return reply(Object.values(cases));
    if (api === "/doctor/me") return reply({ displayName: "Dr Samir Example", specialty: "Cardiology", subspecialty: "Interventional cardiology", careCategory: "cardiology", availabilityStatus: "AVAILABLE", credentialingStatus: "VERIFIED" });
    if (api === "/doctor/catalog") return reply(catalog);
    if (api === "/doctor/fx-rates") return reply(fxRates);
    if (api === "/facilities/directory") return reply(facilities);
    const one = api.match(/^\/doctor\/cases\/(review|assess|treat|discharge|follow)(\/.*)?$/);
    if (one) {
      const [, id, rest] = one as unknown as [string, ConsultantCaseId, string | undefined];
      if (!rest) return reply(caseView(id));
      if (rest === "/treatment") return reply(treatment(id));
      if (rest === "/discharge") return reply(discharge(id));
      if (rest === "/follow-up") return reply(followUp(id));
      if (rest === "/admission") return reply(admission(id, String(cases[id].status)));
      if (rest === "/referrals") return reply([]);
      return reply([]);
    }
    if (/^\/cases\/(review|assess|treat|discharge|follow)\/documents$/.test(api)) return reply(documents);
    if (api === "/clinics/mine") return reply([{ practitionerId: "pr-1", consultantName: "Dr Samir Example", relation: "OWNER", permissions: [] }]);
    if (api === "/clinics/pr-1") return reply(clinic);
    if (api === "/clinics/pr-1/audit") return reply(audit);
    if (api === "/clinics/pr-1/affiliations") return reply(affiliations);
    return route.fallback();
  });
  return portal;
}
