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

/** `proposal-recorded`: the coordinator recorded the patient's acknowledgement after an Arabic call (assisted path). */
export type Scenario = "deposit-arranging" | "deposit-paid" | "proposal-ready" | "proposal-recorded" | "no-case";

/** `viewer` is the backend's per-case relation; `roles` the account's. They differ for someone who is a patient and also acts for a relative. */
/** `identity`: the case's current step is identity verification, and this is the latest submission (none when null). */
export type PatientOptions = { viewer?: "SELF" | "REPRESENTATIVE"; roles?: string[]; identity?: { status: string; rejectionReason?: string } | null };

export async function setupPatient(page: Page, scenario: Scenario, { viewer = "SELF", roles = ["PATIENT"], identity }: PatientOptions = {}) {
  await page.addInitScript(({ authority }) => {
    sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({ access_token: "synthetic", token_type: "Bearer", scope: "openid",
      profile: { sub: "patient-1", name: "Maya Example", email: "maya@example.test", roles: ["PATIENT"] }, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  }, { authority: OIDC_AUTHORITY });
  const ready = scenario === "proposal-ready";
  const paid = scenario === "deposit-paid";
  const caseSummary = ready ? { ...summary, status: "PATIENT_DECISION", waitingOn: "PATIENT" } : paid ? { ...summary, status: "TRAVEL_COORDINATION" } : summary;
  const states = ready
    ? { journeyStage: "PATIENT_DECISION", waitingOn: "PATIENT", blockers: [], currentAction: { code: "REVIEW_PROPOSAL", kind: "FOCUS" }, availableActions: ["MESSAGE_COORDINATOR"] }
    : paid ? { journeyStage: "TRAVEL_COORDINATION", waitingOn: "STAFF", blockers: [], currentAction: { code: "WAIT_COORDINATION", kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] }
    : { journeyStage: "ACCEPTED", waitingOn: "STAFF", blockers: [], currentAction: { code: "WAIT_DEPOSIT_ARRANGEMENT", kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] };
  const actions = { ...states, viewer, ...(identity !== undefined ? { currentAction: { code: "VERIFY_IDENTITY", kind: "FOCUS", blocker: "IDENTITY_NOT_VERIFIED" } } : {}) };
  const workspace = {
    caseSummary, timeline: [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: "2026-09-01T09:00:00Z" }, { type: "STATUS", label: caseSummary.status, status: caseSummary.status, occurredAt: stamp }],
    tasks: [], messages: [{ id: "m1", threadType: "PATIENT_COORDINATOR", senderRole: "COORDINATOR", senderName: "Sara Ahmed", direction: "INBOUND", body: "Welcome — I will send the deposit details shortly.", createdAt: stamp, internalOnly: false, read: false }],
    assignments: [], clinicalReviews: [], gates: null, delivery: null,
    proposal: { ...proposal, status: ready ? "RELEASED" : "ACCEPTED", assistance: scenario === "proposal-recorded"
      ? { requestedAt: "2026-09-10T09:00:00Z", decisionSource: "RECORDED_ON_BEHALF", recordedByName: "Sara Ahmed", channel: "WHATSAPP_CALL", confirmedBy: "PATIENT", conversationAt: "2026-09-11T09:00:00Z", decidedAt: "2026-09-11T09:05:00Z" }
      : null as null | Record<string, string> },
    deposit: ready ? null : paid ? { ...deposit, status: "PAID", paidDisplay: 500, balanceDisplay: 0 } : deposit,
    actions,
    patientProposal: ready ? { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v1", versionNumber: 1, currency: "USD", validUntil: "2026-12-31T00:00:00Z", releasedAt: stamp, decidedAt: null }
      : { state: "ACCEPTED", action: "VIEW_PROPOSAL", versionId: "v1", versionNumber: 1, currency: "USD", validUntil: "2026-12-31T00:00:00Z", releasedAt: stamp, decidedAt: stamp },
  };
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
    if (api === "/patient/account/session") return reply({ linked: true, currentCaseId: scenario === "no-case" ? null : "case-1", accountStatus: "ACTIVE", pendingLinkRequests: 0 });
    if (api === "/patient/account/profile") return reply({ givenName: "Maya", familyName: "Example", displayName: "Maya Example", preferredName: null, dateOfBirth: "1990-04-02", country: "Kenya", nationality: "KE", preferredLanguage: "en", email: "maya@example.test", emailVerified: true, whatsappNumber: "+254700000081", phoneVerified: true, accountStatus: "ACTIVE" });
    if (api === "/work/mine") return reply([]);
    if (api === "/clinics/mine") return reply([]);
    if (api === "/patient/cases") return reply(scenario === "no-case" ? [] : [caseSummary]);
    if (api === "/patient/cases/case-1") return reply(workspace);
    if (api === "/patient/cases/case-1/onboarding") return reply({ identity: identity ?? null });
    if (api === "/patient/cases/case-1/proposals/v1/decision") return reply({ ...proposal, status: "ACCEPTED" });
    // The Arabic assisted path: asking once opens the coordinator's work; the page then says it was asked.
    if (api === "/patient/cases/case-1/proposals/v1/assistance") { workspace.proposal.assistance = { requestedAt: "2026-10-08T09:00:00Z" }; return reply(workspace.proposal.assistance); }
    if (api.endsWith("/documents")) return reply([{ documentId: "d1", fileName: "Echo_Report.pdf", contentType: "application/pdf", sizeBytes: 1024, status: "CLEAN", createdAt: "2026-09-01T09:00:00Z" }]);
    return reply({ message: `unstubbed ${api}` }, 404);
  });
  await routeMe(page, meFor("patient-1", roles));
  return { writes, calls };
}
