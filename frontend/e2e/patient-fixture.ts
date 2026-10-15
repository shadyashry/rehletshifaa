import type { Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";
import { meFor, routeMe } from "./me-fixture";

/**
 * The signed-in patient for My Care specs: a synthetic OIDC session for "patient-1" and every business API mocked,
 * including a linked account session. Returns the writes it received and the browser-side request counts.
 * Synthetic fixtures only.
 */
const stamp = "2026-09-12T09:00:00Z";
const summary = { id: "case-1", caseNumber: "RS-2026-000081", status: "ACCEPTED", patientName: "Maya Example", country: "Kenya", preferredLanguage: "en", careCategory: "cardiology",
  createdAt: "2026-09-01T09:00:00Z", updatedAt: stamp, version: 6, coordinatorName: "Sara Ahmed", doctorName: "Dr Ahmed Alashry", waitingOn: "STAFF", travelPackageRequested: false };
const proposal = { proposalId: "p1", versionId: "v1", versionNumber: 1, status: "ACCEPTED", language: "en", currency: "USD", validUntil: "2026-12-31T00:00:00Z", documentType: "PRELIMINARY_ESTIMATE",
  items: [{ id: "i1", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 4850, optional: false }], coordinatorNotes: null };
const deposit = { id: "dep-1", status: "REQUESTED", currency: "USD", totalEgp: 25000, totalDisplay: 500, paidDisplay: 0, balanceDisplay: 500, components: [], events: [] };
/** `deposit-checking`: the patient entered the bank's transfer reference (DEP-3) and Finance is matching it. */
const transfer = { id: "tr-1", method: "BANK_TRANSFER", reference: "FT26091200481", status: "SUBMITTED", submittedAt: "2026-09-12T08:30:00Z" };

/** `proposal-recorded`: the coordinator recorded the patient's acknowledgement after an Arabic call (assisted path). */
/** `case-received` / `consultant-review`: the case waits for the coordinator / is with a Consultant (stamped moments, D-1). */
export type Scenario = "deposit-checking" | "deposit-paid" | "proposal-ready" | "proposal-recorded" | "case-received" | "consultant-review" | "no-case";

/** D-1: when the three stamped moments happened, as the backend sends them on the patient workspace. */
const received = "2026-09-01T09:00:00Z", consultantReview = "2026-09-04T09:00:00Z";

/** `viewer` is the backend's per-case relation; `roles` the account's. They differ for someone who is a patient and also acts for a relative. */
/** `identity`: the case's current step is identity verification, and this is the latest submission (none when null). */
/** `multipleCases`: the account also represents a relative (Omar, whose case waits on them — the session opens it) and has a closed case of its own. */
export type PatientOptions = { viewer?: "SELF" | "REPRESENTATIVE"; roles?: string[]; identity?: { status: string; rejectionReason?: string } | null; multipleCases?: boolean;
  /** The server refuses a new case with this error code (e.g. a limit on cases sent for others). */
  newCaseRefusal?: { status: number; code: string } };

export async function setupPatient(page: Page, scenario: Scenario, { viewer = "SELF", roles = ["PATIENT"], identity, multipleCases = false, newCaseRefusal }: PatientOptions = {}) {
  await page.addInitScript(({ authority }) => {
    sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({ access_token: "synthetic", token_type: "Bearer", scope: "openid",
      profile: { sub: "patient-1", name: "Maya Example", email: "maya@example.test", roles: ["PATIENT"] }, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  }, { authority: OIDC_AUTHORITY });
  const ready = scenario === "proposal-ready";
  const paid = scenario === "deposit-paid";
  // Before an estimate exists: no proposal, no deposit, and only the milestones reached so far.
  const early = scenario === "case-received" ? "RECEIVED" : scenario === "consultant-review" ? "CONSULTANT_REVIEW" : null;
  const caseSummary = early ? { ...summary, status: early, doctorName: early === "RECEIVED" ? null : summary.doctorName }
    : ready ? { ...summary, status: "PATIENT_DECISION", waitingOn: "PATIENT" } : paid ? { ...summary, status: "TRAVEL_COORDINATION" } : summary;
  const milestones = { receivedAt: received, consultantReviewAt: early === "RECEIVED" ? null : consultantReview, estimateReadyAt: early ? null : stamp };
  const states = early
    ? { journeyStage: early, waitingOn: "STAFF", blockers: [], currentAction: { code: early === "RECEIVED" ? "WAIT_COORDINATOR_REVIEW" : "WAIT_CONSULTANT_REVIEW", kind: "WAIT", expectedWorkingDays: 2 }, availableActions: ["MESSAGE_COORDINATOR"] }
    : ready
    ? { journeyStage: "PATIENT_DECISION", waitingOn: "PATIENT", blockers: [], currentAction: { code: "REVIEW_PROPOSAL", kind: "FOCUS" }, availableActions: ["MESSAGE_COORDINATOR"] }
    : paid ? { journeyStage: "TRAVEL_COORDINATION", waitingOn: "STAFF", blockers: [], currentAction: { code: "WAIT_COORDINATION", kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] }
    : { journeyStage: "ACCEPTED", waitingOn: "STAFF", blockers: [], currentAction: { code: "WAIT_PAYMENT_CHECK", kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] };
  const actions = { ...states, viewer, ...(identity !== undefined ? { currentAction: { code: "VERIFY_IDENTITY", kind: "FOCUS", blocker: "IDENTITY_NOT_VERIFIED" } } : {}) };
  const workspace = {
    caseSummary, timeline: [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: "2026-09-01T09:00:00Z" }, { type: "STATUS", label: caseSummary.status, status: caseSummary.status, occurredAt: stamp }],
    tasks: [], messages: [{ id: "m1", threadType: "PATIENT_COORDINATOR", senderRole: "COORDINATOR", senderName: "Sara Ahmed", direction: "INBOUND", body: "Welcome — I will send the deposit details shortly.", createdAt: stamp, internalOnly: false, read: false }],
    assignments: [], clinicalReviews: [], gates: null, delivery: null,
    proposal: early ? null : { ...proposal, status: ready ? "RELEASED" : "ACCEPTED", assistance: scenario === "proposal-recorded"
      ? { requestedAt: "2026-09-10T09:00:00Z", decisionSource: "RECORDED_ON_BEHALF", recordedByName: "Sara Ahmed", channel: "WHATSAPP_CALL", confirmedBy: "PATIENT", conversationAt: "2026-09-11T09:00:00Z", decidedAt: "2026-09-11T09:05:00Z" }
      : null as null | Record<string, string> },
    deposit: ready || early ? null : paid ? { ...deposit, status: "PAID", paidDisplay: 500, balanceDisplay: 0 } : { ...deposit, transfer },
    actions, milestones,
    patientProposal: early ? null : ready ? { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v1", versionNumber: 1, currency: "USD", validUntil: "2026-12-31T00:00:00Z", releasedAt: stamp, decidedAt: null }
      : { state: "ACCEPTED", action: "VIEW_PROPOSAL", versionId: "v1", versionNumber: 1, currency: "USD", validUntil: "2026-12-31T00:00:00Z", releasedAt: stamp, decidedAt: stamp },
  };
  // A relative's case waiting on the account (information requested) and a closed case of the account's own.
  const relative = { ...summary, id: "case-2", caseNumber: "RS-2026-000094", status: "INFORMATION_REQUIRED", patientName: "Omar Example", careCategory: "orthopedics",
    coordinatorName: "Layla Hassan", doctorName: null, waitingOn: "PATIENT", updatedAt: "2026-09-13T09:00:00Z", viewer: "REPRESENTATIVE" };
  const closed = { ...summary, id: "case-3", caseNumber: "RS-2025-000412", status: "CLOSED", careCategory: "general-surgery", waitingOn: null, updatedAt: "2025-11-02T09:00:00Z", viewer: "SELF" };
  const relativeWorkspace = {
    caseSummary: relative, timeline: [], tasks: [], assignments: [], clinicalReviews: [], gates: null, delivery: null, proposal: null, deposit: null, patientProposal: null,
    messages: [{ id: "m2", threadType: "PATIENT_COORDINATOR", senderRole: "COORDINATOR", senderName: "Layla Hassan", direction: "INBOUND", body: "Could you send Omar's latest knee X-ray?", createdAt: "2026-09-13T09:00:00Z", internalOnly: false, read: false }],
    actions: { journeyStage: "INFORMATION_REQUIRED", waitingOn: "PATIENT", blockers: [], currentAction: { code: "PROVIDE_INFORMATION", kind: "FOCUS" }, availableActions: ["MESSAGE_COORDINATOR"], viewer: "REPRESENTATIVE" },
    patientAction: { taskId: "t2", title: "Information required", message: "Please send Omar's latest knee X-ray and the report that came with it.", blocking: true, dueAt: "2026-09-30T09:00:00Z",
      items: [{ id: "i2", kind: "DOCUMENT", code: "XRAY", label: "Knee X-ray (last 6 months)", required: true, completed: false }] },
  };
  const closedWorkspace = { ...workspace, caseSummary: closed, deposit: null, proposal: null, patientProposal: null, messages: [],
    actions: { journeyStage: "CLOSED", waitingOn: null, blockers: [], currentAction: { code: "NONE", kind: "NONE" }, availableActions: ["MESSAGE_COORDINATOR"], viewer: "SELF" } };
  const caseList = multipleCases ? [relative, { ...caseSummary, viewer: "SELF" }, closed] : [caseSummary];
  const writes: { path: string; body: unknown }[] = [];
  // Counted from the browser side so a request storm shows up even when every call is answered: a linked patient's
  // session registration refreshes /me once; repeating it is the reload loop this suite must catch.
  const calls = { session: 0, me: 0, roleless: 0 };
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path.endsWith("/api/v1/patient/account/session")) calls.session++;
    if (request.method() === "GET" && path.endsWith("/api/v1/me")) calls.me++;
    if (path.includes("/api/v1/undefined/")) calls.roleless++;
  });
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), api = new URL(request.url()).pathname.replace("/api/v1", "");
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (request.method() !== "GET") writes.push({ path: api, body: request.postDataJSON() });
    if (api === "/account/preferences") return reply({ displayName: null, locale: "en" });
    if (api === "/patient/account/session") return reply({ linked: true, currentCaseId: scenario === "no-case" ? null : multipleCases ? "case-2" : "case-1", accountStatus: "ACTIVE", pendingLinkRequests: 0 });
    if (api === "/patient/account/profile") return reply({ givenName: "Maya", familyName: "Example", displayName: "Maya Example", preferredName: null, dateOfBirth: "1990-04-02", country: "Kenya", nationality: "KE", preferredLanguage: "en", email: "maya@example.test", emailVerified: true, whatsappNumber: "+254700000081", phoneVerified: true, accountStatus: "ACTIVE" });
    if (api === "/work/mine") return reply([]);
    if (api === "/clinics/mine") return reply([]);
    // A new case from the signed-in form: a draft, then the intake submit with its grant (synthetic).
    if (api === "/patient/cases" && request.method() === "POST" && newCaseRefusal) return reply({ code: newCaseRefusal.code, message: "refused" }, newCaseRefusal.status);
    if (api === "/patient/cases" && request.method() === "POST") return reply({ caseId: "case-new", caseNumber: "RS-2026-000120", status: "DRAFT", intakeGrant: "synthetic-grant" });
    if (api === "/cases/case-new/submit") return reply({ caseNumber: "RS-2026-000120", status: "RECEIVED", statusToken: null });
    if (api === "/patient/cases") return reply(scenario === "no-case" ? [] : caseList);
    if (multipleCases && api === "/patient/cases/case-2") return reply(relativeWorkspace);
    if (multipleCases && api === "/patient/cases/case-3") return reply(closedWorkspace);
    if (api === "/patient/cases/case-1") return reply(workspace);
    if (api === "/patient/cases/case-1/onboarding") return reply({ identity: identity ?? null });
    if (api === "/patient/cases/case-1/proposals/v1/decision") return reply({ ...proposal, status: "ACCEPTED" });
    // The Arabic assisted path: asking once opens the coordinator's work; the page then says it was asked.
    if (api === "/patient/cases/case-1/proposals/v1/assistance") { const assistance = { requestedAt: "2026-10-08T09:00:00Z" }; if (workspace.proposal) workspace.proposal.assistance = assistance; return reply(assistance); }
    if (api.endsWith("/documents")) return reply([{ documentId: "d1", fileName: "Echo_Report.pdf", contentType: "application/pdf", sizeBytes: 1024, status: "CLEAN", createdAt: "2026-09-01T09:00:00Z" }]);
    return reply({ message: `unstubbed ${api}` }, 404);
  });
  await routeMe(page, meFor("patient-1", roles));
  return { writes, calls };
}
