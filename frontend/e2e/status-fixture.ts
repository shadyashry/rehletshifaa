import { expect, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * The secure status link with mocked public endpoints (synthetic data only): a summary, a code that is always accepted,
 * and the view the caller passes. `openStatusView` walks the sealed page in either language without depending on its
 * words: the one primary action sends the code, the code field takes six digits, the form's primary action verifies.
 */
export const STATUS_TOKEN = "status-fixture-token";
const BASE = `${API}/public/cases/${STATUS_TOKEN}`;
const summary = { caseNumber: "RS-2026-000417", purpose: "INFORMATION_RESPONSE", channel: "WHATSAPP", destinationHint: "***0417" };

export async function setupStatusLink(page: Page, view: Record<string, unknown>) {
  const ok = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(BASE, route => route.fulfill(ok(summary)));
  await page.route(`${BASE}/request-access`, route => route.fulfill(ok(summary)));
  await page.route(`${BASE}/verify`, route => route.fulfill(ok({ grant: "fixture-grant", expiresAt: "2099-01-01T00:00:00Z" })));
  await page.route(`${BASE}/view`, route => route.fulfill(ok({ caseNumber: summary.caseNumber, statusEn: "", statusAr: "", ...view })));
}

export async function openStatusView(page: Page) {
  await page.locator("main button.btn-primary").click();
  await page.locator("input[name=one-time-code]").fill("123456");
  await page.locator("main form button.btn-primary").click();
  await expect(page.locator("#status-now")).toBeVisible();
}

/** An information request with one text and one document item, received on 2 March (D-1 milestones). */
export const INFORMATION_REQUESTED = {
  phase: "coordinator", actionRequired: true, expectedWorkingDays: null,
  milestones: { receivedAt: "2026-03-02T09:00:00Z", consultantReviewAt: null, estimateReadyAt: null },
  action: {
    taskId: "t-1", title: "Information required", message: null, blocking: true, dueAt: "2026-03-12T00:00:00Z",
    items: [
      { id: "i-1", kind: "INFORMATION", code: "CURRENT_MEDICATION", label: "Current medication", required: true, completed: false, response: null },
      { id: "i-2", kind: "DOCUMENT", code: "LATEST_SCAN", label: "Latest echocardiogram report", required: false, completed: false, response: null },
    ],
  },
};
