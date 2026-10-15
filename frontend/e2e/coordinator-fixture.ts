import type { Page } from "@playwright/test";

import { setupPortal } from "./portal-fixture";

// UX area 2: a coordinator's working day on synthetic data only — work items, a case with messages and history, and the
// WhatsApp conversations view. Layered over `setupPortal` (routes registered later answer first).
const at = (hoursAgo: number) => new Date(Date.UTC(2026, 9, 14, 12) - hoursAgo * 3600000).toISOString();
const subject = "qa-coordinator";

const workItems = [
  { id: "w1", caseId: "owned", caseNumber: "RS-2026-000002", patientName: "Maya Example", caseStatus: "INTAKE_REVIEW", waitingOn: "STAFF", careCategory: "cardiology", coordinatorSubject: subject, coordinatorName: "Layla Hassan", documentCount: 3,
    type: "REVIEW_PATIENT_RESPONSE", title: "Review the patient's reply", context: "The patient sent new information on WhatsApp.", priority: "URGENT", status: "OPEN", blocking: true, dueAt: at(-6), overdue: true, createdAt: at(30), version: 0, copy: null },
  { id: "w2", caseId: "owned", caseNumber: "RS-2026-000002", patientName: "Maya Example", caseStatus: "INTAKE_REVIEW", waitingOn: "STAFF", careCategory: "cardiology", coordinatorSubject: subject, coordinatorName: "Layla Hassan", documentCount: 3,
    type: "ASSIGN_CONSULTANT", title: "Assign a Consultant", context: "Intake is complete; route the case to a cardiology Consultant.", priority: "HIGH", status: "OPEN", blocking: false, dueAt: at(-30), overdue: false, createdAt: at(5), version: 0, copy: null },
  { id: "w3", caseId: "team", caseNumber: "RS-2026-000003", patientName: "Omar Example", caseStatus: "PATIENT_DECISION", waitingOn: "PATIENT", careCategory: "orthopedics", coordinatorSubject: "report", coordinatorName: "Team Coordinator", documentCount: 1,
    type: "FOLLOW_UP", title: "Follow up on the estimate", context: "The estimate was sent five days ago without a reply.", priority: "NORMAL", status: "OPEN", blocking: false, dueAt: null, overdue: false, createdAt: at(72), version: 0, copy: null },
];

const messages = [
  { id: "m1", threadType: "PATIENT_COORDINATOR", senderRole: "PATIENT", senderName: "Maya Example", direction: "INBOUND", body: "I uploaded the echo report from last week. My cardiologist says the valve needs attention soon.", createdAt: at(30), read: false, channel: "WHATSAPP", attachmentStatus: "CLEAN" },
  { id: "m2", threadType: "PATIENT_COORDINATOR", senderRole: "COORDINATOR", senderName: "Layla Hassan", direction: "OUTBOUND", body: "Thank you, Maya. I have the report and will share it with the Consultant today.", createdAt: at(28), read: true, channel: "PORTAL" },
  { id: "m3", threadType: "COORDINATOR_DOCTOR", senderRole: "COORDINATOR", senderName: "Layla Hassan", direction: "OUTBOUND", body: "New echo report attached; can you confirm the review window?", createdAt: at(20), read: true },
];

const conversations = [
  { id: "c1", name: "Ahmed Example", phoneHint: "+218 •••• 4417", language: "ar", ownerSubject: subject, ownerName: "Layla Hassan", lastInboundAt: at(2), windowExpiresAt: at(-22), windowOpen: true },
  { id: "c2", name: null, phoneHint: "+249 •••• 0912", language: "ar", ownerSubject: subject, ownerName: "Layla Hassan", lastInboundAt: at(40), windowExpiresAt: at(16), windowOpen: false },
];
const conversationDetail = (id: string) => {
  const summary = conversations.find(c => c.id === id) ?? conversations[0];
  return { summary, status: "OPEN", coverName: null, canReply: true, canClaim: false, canReassign: true, canClose: true,
    messages: [
      { id: "cm1", direction: "IN", senderName: null, kind: "TEXT", body: "Hello, my father needs knee surgery. Can a Consultant in Egypt look at his X-rays?", language: "en", createdAt: at(3) },
      { id: "cm2", direction: "OUT", senderName: "Layla Hassan", kind: "TEXT", body: "Of course. You can send his case and files through our secure form; I will follow it from there.", language: "en", createdAt: at(2.5) },
      { id: "cm3", direction: "IN", senderName: null, kind: "DOCUMENT", body: "", language: "en", mediaId: "f1", fileName: "knee-xray.pdf", attachmentStatus: "CLEAN", createdAt: at(2) },
    ] };
};

export async function setupCoordinatorDay(page: Page, role: "COORDINATOR" | "COORDINATOR_LEAD" = "COORDINATOR_LEAD") {
  const portal = await setupPortal(page, role, { pendingWork: false });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url()), api = url.pathname.replace("/api/v1", "");
    const reply = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    if (route.request().method() !== "GET") return route.fallback();
    if (api === "/work/mine") return reply(workItems);
    if (api === "/coordinator/conversations") return reply(url.searchParams.get("scope") === "mine" ? conversations : []);
    const conversation = api.match(/^\/coordinator\/conversations\/(c\d)$/);
    if (conversation) return reply(conversationDetail(conversation[1]));
    if (api === "/coordinator/cases/owned") {
      const caseSummary = { country: "Libya", careCategory: "cardiology", preferredLanguage: "ar", createdAt: at(80), updatedAt: at(5), version: 1, travelPackageRequested: false,
        id: "owned", caseNumber: "RS-2026-000002", patientName: "Maya Example", status: "INTAKE_REVIEW", coordinatorSubject: subject, coordinatorName: "Layla Hassan" };
      return reply({ caseSummary, intakeSummary: "Adult patient with a known mitral valve condition; recent echo shows worsening regurgitation. Asking for a surgical opinion in Egypt.",
        actions: { journeyStage: "INTAKE_REVIEW", waitingOn: "STAFF", blockers: [], waitingReason: "Waiting for our team", waitingReasonCode: "DEFAULT_STAFF",
          currentAction: { code: "ASSIGN_CONSULTANT", kind: "FOCUS" },
          patientStep: { code: "WAIT_COORDINATOR_REVIEW", kind: "WAIT", expectedWorkingDays: 2, overdue: false }, availableActions: ["REQUEST_INFORMATION", "ASSIGN_CONSULTANT", "SET_TRAVEL_PACKAGE", "CANCEL_CASE"] },
        tasks: [], assignments: [], clinicalReviews: [], messages,
        timeline: [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: at(80) }, { type: "STATUS", label: "Intake review", status: "INTAKE_REVIEW", occurredAt: at(50) }],
        patientReply: { canReply: true, ownerName: "Layla Hassan", coverName: null, coverEndsAt: null, viewerIsCover: false } });
    }
    if (api === "/cases/owned/documents") return reply([
      { documentId: "d1", fileName: "Echo report.pdf", contentType: "application/pdf", sizeBytes: 482000, status: "CLEAN", createdAt: at(30) },
      { documentId: "d2", fileName: "ECG.jpg", contentType: "image/jpeg", sizeBytes: 220000, status: "CLEAN", createdAt: at(60) },
      { documentId: "d3", fileName: "Referral letter.pdf", contentType: "application/pdf", sizeBytes: 90000, status: "PENDING", createdAt: at(1) },
    ]);
    return route.fallback();
  });
  return portal;
}
