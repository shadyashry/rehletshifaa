import { expect, test } from "@playwright/test";

import { API } from "./env";

/**
 * Check Case Status renders the backend's proposal answer and nothing more: no proposal control while the
 * proposal is being prepared, one "Review proposal" action for a released version — which opens the
 * proposal page straight away, with the grant handed over through session storage rather than the URL.
 */
const BASE = `${API}/public/cases/status-token`;
const summary = { caseNumber: "RS-2026-000081", purpose: "STATUS", channel: "WHATSAPP", destinationHint: "***0081" };

async function reachStatus(page: import("@playwright/test").Page, view: Record<string, unknown>) {
  await page.route(BASE, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/request-access`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/verify`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ grant: "case-grant", expiresAt: "2099-01-01T00:00:00Z" }) }));
  await page.route(`${BASE}/view`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(view) }));
  await page.goto("/en/status/status-token");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

test("no proposal control while the proposal is still being prepared", async ({ page }) => {
  await reachStatus(page, { caseNumber: "RS-2026-000081", statusEn: "Preparing your proposal", statusAr: "جارٍ إعداد عرضك", phase: "proposal", actionRequired: false, action: null,
    proposal: { state: "PREPARING", action: null, versionId: null, versionNumber: null, validUntil: null, decidedAt: null } });
  await expect(page.getByRole("heading", { name: "We are preparing your proposal" })).toBeVisible();
  await expect(page.getByText("Your proposal is being prepared. We will send you a secure link as soon as it is ready.")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /review proposal/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /proposal/i })).toHaveCount(0);
});

test("a released proposal is opened securely from the verified status session", async ({ page }) => {
  await page.route(`${BASE}/proposal-access`, async route => {
    expect(route.request().postDataJSON()).toEqual({ grant: "case-grant" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "share-token", grant: "proposal-grant", expiresAt: "2099-01-01T00:00:00Z", versionId: "v-2" }) });
  });
  // The proposal page itself: summary, then a direct view with the handed-over grant (no code requested).
  await page.route(`${API}/public/proposals/share-token`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ caseNumber: "RS-2026-000081", channel: "WHATSAPP", destinationHint: "***0081", whatsappHint: "***0081", emailHint: null }) }));
  let codeRequested = false;
  await page.route(`${API}/public/proposals/share-token/request-access`, route => { codeRequested = true; return route.fulfill({ status: 500, body: "{}" }); });
  await page.route(`${API}/public/proposals/share-token/view`, async route => {
    expect(route.request().postDataJSON()).toEqual({ grant: "proposal-grant" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      caseNumber: "RS-2026-000081", patientName: "Test Patient", documentType: "PRELIMINARY_ESTIMATE", versionNumber: 2, currency: "USD",
      items: [{ id: "i1", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 8736, optional: false }],
      totalMin: 8736, totalExpected: 8736, totalMax: 8736, validUntil: "2099-01-01T00:00:00Z", decided: false,
      recommendedTreatment: "Pacemaker implantation", consultantName: "Dr Ahmed Alashry",
    }) });
  });
  await reachStatus(page, { caseNumber: "RS-2026-000081", statusEn: "Waiting for your decision", statusAr: "بانتظار قرارك", phase: "proposal", actionRequired: false, action: null,
    proposal: { state: "READY", action: "REVIEW_PROPOSAL", versionId: "v-2", versionNumber: 2, validUntil: "2099-01-01T00:00:00Z", decidedAt: null } });
  await expect(page.getByRole("heading", { name: "Your proposal is ready to review" })).toBeVisible();
  await expect(page.getByText("No action is required from you right now.")).toHaveCount(0);
  const review = page.getByRole("button", { name: "Review proposal" });
  await expect(review).toHaveCount(1);
  await review.click();
  await page.waitForURL(/\/en\/proposal\/share-token$/);
  await expect(page.getByRole("heading", { name: "Your preliminary care estimate" })).toBeVisible();
  // USD everywhere: the line and the package figure carry the proposal currency, never EGP.
  await expect(page.getByText(/\$8,736/).first()).toBeVisible();
  await expect(page.getByText(/EGP|E£/)).toHaveCount(0);
  expect(codeRequested).toBe(false);
  expect(page.url()).not.toContain("proposal-grant");
});
