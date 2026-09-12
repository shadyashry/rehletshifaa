import { expect, test, type Page } from "@playwright/test";

import { OIDC_AUTHORITY } from "./env";

/**
 * My Care — the signed-in patient's landing: straight onto the current case, the backend's current step
 * as the strongest element, at most one primary action, the deposit truthfully arranged by our side,
 * one proposal action, one way to reach the coordinator, three destinations and nothing else.
 * Synthetic fixtures only; the real journey is covered by my-care-live.spec.ts.
 */
const stamp = "2026-09-12T09:00:00Z";
const summary = { id: "case-1", caseNumber: "RS-2026-000081", status: "ACCEPTED", patientName: "Maya Example", country: "Kenya", preferredLanguage: "en", careCategory: "cardiology",
  createdAt: "2026-09-01T09:00:00Z", updatedAt: stamp, version: 6, coordinatorName: "Sara Ahmed", doctorName: "Dr Ahmed Alashry", waitingOn: "STAFF", travelPackageRequested: false };
const proposal = { proposalId: "p1", versionId: "v1", versionNumber: 1, status: "ACCEPTED", language: "en", currency: "USD", validUntil: "2026-12-31T00:00:00Z", documentType: "PRELIMINARY_ESTIMATE",
  items: [{ id: "i1", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 4850, optional: false }], coordinatorNotes: null };
const deposit = { id: "dep-1", status: "REQUESTED", currency: "USD", totalEgp: 25000, totalDisplay: 500, paidDisplay: 0, balanceDisplay: 500, components: [], events: [] };

type Scenario = "deposit-arranging" | "deposit-paid" | "proposal-ready" | "no-case";

async function setupPatient(page: Page, scenario: Scenario) {
  await page.addInitScript(({ authority }) => {
    sessionStorage.setItem(`oidc.user:${authority}:rehletshifaa-web`, JSON.stringify({ access_token: "synthetic", token_type: "Bearer", scope: "openid",
      profile: { sub: "patient-1", name: "Maya Example", email: "maya@example.test", roles: ["PATIENT"] }, expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  }, { authority: OIDC_AUTHORITY });
  const ready = scenario === "proposal-ready";
  const paid = scenario === "deposit-paid";
  const caseSummary = ready ? { ...summary, status: "PATIENT_DECISION", waitingOn: "PATIENT" } : paid ? { ...summary, status: "TRAVEL_COORDINATION" } : summary;
  const actions = ready
    ? { journeyStage: "PATIENT_DECISION", waitingOn: "PATIENT", blockers: [], currentAction: { code: "REVIEW_PROPOSAL", kind: "FOCUS" }, availableActions: ["MESSAGE_COORDINATOR"] }
    : paid ? { journeyStage: "TRAVEL_COORDINATION", waitingOn: "STAFF", blockers: [], currentAction: { code: "WAIT_COORDINATION", kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] }
    : { journeyStage: "ACCEPTED", waitingOn: "STAFF", blockers: [], currentAction: { code: "WAIT_DEPOSIT_ARRANGEMENT", kind: "WAIT" }, availableActions: ["MESSAGE_COORDINATOR"] };
  const workspace = {
    caseSummary, timeline: [{ type: "STATUS", label: "Received", status: "RECEIVED", occurredAt: "2026-09-01T09:00:00Z" }, { type: "STATUS", label: caseSummary.status, status: caseSummary.status, occurredAt: stamp }],
    tasks: [], messages: [{ id: "m1", threadType: "PATIENT_COORDINATOR", senderRole: "COORDINATOR", senderName: "Sara Ahmed", direction: "INBOUND", body: "Welcome — I will send the deposit details shortly.", createdAt: stamp, internalOnly: false, read: false }],
    assignments: [], clinicalReviews: [], gates: null, delivery: null,
    proposal: { ...proposal, status: ready ? "RELEASED" : "ACCEPTED" },
    deposit: ready ? null : paid ? { ...deposit, status: "PAID", paidDisplay: 500, balanceDisplay: 0 } : deposit,
    actions,
    patientProposal: ready ? { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v1", versionNumber: 1, currency: "USD", validUntil: "2026-12-31T00:00:00Z", releasedAt: stamp, decidedAt: null }
      : { state: "ACCEPTED", action: "VIEW_PROPOSAL", versionId: "v1", versionNumber: 1, currency: "USD", validUntil: "2026-12-31T00:00:00Z", releasedAt: stamp, decidedAt: stamp },
  };
  const writes: { path: string; body: unknown }[] = [];
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), api = new URL(request.url()).pathname.replace("/api/v1", "");
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (request.method() !== "GET") writes.push({ path: api, body: request.postDataJSON() });
    if (api === "/account/preferences") return reply({ displayName: null, locale: "en" });
    if (api === "/patient/account/session") return reply({ linked: true, currentCaseId: scenario === "no-case" ? null : "case-1", accountStatus: "ACTIVE", pendingLinkRequests: 0 });
    if (api === "/patient/account/profile") return reply({ givenName: "Maya", familyName: "Example", displayName: "Maya Example", preferredName: null, dateOfBirth: "1990-04-02", country: "Kenya", nationality: "KE", preferredLanguage: "en", email: "maya@example.test", emailVerified: true, whatsappNumber: "+254700000081", phoneVerified: true, accountStatus: "ACTIVE" });
    if (api === "/work/mine") return reply([]);
    if (api === "/patient/cases") return reply(scenario === "no-case" ? [] : [caseSummary]);
    if (api === "/patient/cases/case-1") return reply(workspace);
    if (api === "/patient/cases/case-1/proposals/v1/decision") return reply({ ...proposal, status: "ACCEPTED" });
    if (api.endsWith("/documents")) return reply([{ documentId: "d1", fileName: "Echo_Report.pdf", contentType: "application/pdf", sizeBytes: 1024, status: "CLEAN", createdAt: "2026-09-01T09:00:00Z" }]);
    return reply({ message: `unstubbed ${api}` }, 404);
  });
  return { writes };
}

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), "no horizontal overflow").toBe(false);

test("lands on the current case with the deposit being arranged: one step, no fake action, authoritative money", async ({ page }) => {
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  // Straight into the care journey — no dashboard, no list, no welcome card.
  await expect(page.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible();
  await expect(page).toHaveURL(/case=case-1/);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByText("No action is required from you right now.")).toBeVisible();
  // The only buttons on the page: navigation, the account menu, the proposal link and the one message control.
  const buttons = await page.getByRole("button").allTextContents();
  expect(buttons.filter(text => /continue|pay|check status|refresh|go to case|view progress/i.test(text))).toEqual([]);
  await expect(page.getByRole("button", { name: /^view proposal/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^message(\s*\d+)?$/i })).toHaveCount(1); // the coordinator block's one control (with its unread badge)
  const depositBlock = page.getByRole("region", { name: "Deposit", exact: true });
  await expect(depositBlock).toContainText("$500");
  await expect(depositBlock).toContainText("Arranging");
  await expect(depositBlock.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/EGP|E£/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your proposal" })).toContainText("$4,850");
  await expect(page.getByRole("region", { name: "Your coordinator" })).toContainText("Sara Ahmed");
  // Header navigation is exactly three destinations.
  const nav = page.getByRole("navigation", { name: "My Care" }).first();
  await expect(nav.getByRole("button")).toHaveText(["My Care", "Documents", "Messages1"]);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-1440.png", fullPage: true });
  for (const width of [1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/my-care-deposit-${width}.png`, fullPage: true });
  }
});

test("on a phone the current step comes before everything else, and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible();
  await noOverflow(page);
  const order = await page.evaluate(() => {
    const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? Infinity;
    return { step: top("#current-step-title"), deposit: top("#deposit-title"), journey: top("[aria-label='Your care journey']"), proposal: top("#proposal-title"), coordinator: top("#coordinator-title") };
  });
  expect(order.step).toBeLessThan(order.deposit);
  expect(order.deposit).toBeLessThan(order.journey);
  expect(order.journey).toBeLessThan(order.proposal);
  expect(order.proposal).toBeLessThan(order.coordinator);
  // The current step is on the first screen.
  expect(order.step).toBeLessThan(844);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-390.png", fullPage: true });
});

test("deposit confirmed: success state, no stale arrangement step", async ({ page }) => {
  await setupPatient(page, "deposit-paid");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "We are arranging your treatment" })).toBeVisible();
  const depositBlock = page.getByRole("region", { name: "Deposit", exact: true });
  await expect(depositBlock).toContainText("Deposit received");
  await expect(depositBlock).toContainText("$500");
  await expect(page.getByText(/Arranging|Deposit arrangements|Pay deposit/)).toHaveCount(0);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-paid-1440.png", fullPage: true });
});

test("a proposal waiting for a decision is the one primary action and opens in place", async ({ page }) => {
  const { writes } = await setupPatient(page, "proposal-ready");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Your proposal is ready to review" })).toBeVisible();
  await expect(page.getByText("No action is required from you right now.")).toHaveCount(0);
  const review = page.getByRole("button", { name: "Review proposal" });
  await expect(review).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^view proposal/i })).toHaveCount(0); // not twice
  await review.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("$4,850");
  await expect(dialog.getByText(/EGP|E£/)).toHaveCount(0);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /Acknowledge estimate/ }).click();
  expect(writes.find(w => w.path.endsWith("/proposals/v1/decision"))?.body).toMatchObject({ decision: "ACKNOWLEDGED" });
});

test("Documents and Messages are one click away; Profile & Security lives in the account menu, apart from the case", async ({ page }) => {
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  await page.getByRole("navigation", { name: "My Care" }).first().getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText("Echo_Report.pdf")).toBeVisible();
  await expect(page).toHaveURL(/view=documents/);
  await page.getByRole("navigation", { name: "My Care" }).first().getByRole("button", { name: /Messages/ }).click();
  await expect(page.getByText("Welcome — I will send the deposit details shortly.")).toBeVisible();
  await page.getByLabel("Account: Maya Example", { exact: true }).click();
  await page.getByRole("button", { name: "Profile & Security", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Maya");
  await expect(dialog).toContainText("maya@example.test");
  await expect(dialog).toContainText("Verified");
  await expect(dialog.getByRole("link", { name: /Password & account security/ })).toBeVisible();
  // Nothing from the case leaks into the profile.
  await expect(dialog.getByText(/RS-2026|\$500|\$4,850|Cardiology|deposit|proposal/i)).toHaveCount(0);
  await page.screenshot({ path: "e2e/screenshots/my-care-profile-1440.png", fullPage: true });
});

test("Arabic is right-to-left with the same single-action discipline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-arranging");
  await page.goto("/ar/portal");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "رعايتي" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ترتيبات الوديعة" })).toBeVisible();
  await expect(page.getByText("لا يلزم منك أي إجراء الآن.")).toBeVisible();
  await expect(page.getByRole("button", { name: /عرض العرض/ })).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-ar-390.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-ar-1440.png", fullPage: true });
});

test("a patient with no case yet gets a calm explanation, not an empty dashboard", async ({ page }) => {
  await setupPatient(page, "no-case");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "No active case yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send my case" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
});
