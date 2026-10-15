import { expect, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * The secure proposal link with mocked public endpoints (synthetic data only): a summary with both contacts, a code that
 * is always accepted, and the document the caller passes. `openProposalView` walks the sealed page in either language
 * without depending on its words: the one primary action sends the code, the code field takes six digits, the form's
 * primary action verifies.
 */
export const PROPOSAL_TOKEN = "proposal-fixture-token";
const BASE = `${API}/public/proposals/${PROPOSAL_TOKEN}`;
const summary = { caseNumber: "RS-2026-000417", channel: "WHATSAPP", destinationHint: "***0417", whatsappHint: "***0417", emailHint: "s***@example.test" };

/** A preliminary estimate with a range, a coordination deposit and a foreign-currency rate date, released on 9 March. */
export const PRELIMINARY_ESTIMATE = {
  caseNumber: "RS-2026-000417", patientName: "Fatima Abdelrahman Al-Mahdi", documentType: "PRELIMINARY_ESTIMATE",
  versionNumber: 2, currency: "USD",
  items: [
    { id: "i1", category: "MEDICAL", description: "Exercise stress test", quantity: 1, unitPrice: 150, optional: false },
    { id: "i2", category: "MEDICAL", description: "Transoesophageal echocardiography with contrast", quantity: 1, unitPrice: 1800, optional: false },
    { id: "i3", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 6250, optional: false },
  ],
  totalMin: 7800, totalExpected: 8200, totalMax: 9400, includedServices: "", excludedServices: "",
  validUntil: "2099-04-09T00:00:00Z", decided: false, fxRateDate: "2026-03-09", releasedAt: "2026-03-09T10:00:00Z",
  recommendedTreatment: "Dual-chamber pacemaker implantation following the findings of the remote cardiology review.",
  risksAndLimitations: "The device model and the length of stay are confirmed after the in-person assessment.",
  depositDueDisplay: 1230, consultantName: "Dr. Yasmine Farouk Abdelaziz",
};

export async function setupProposalLink(page: Page, view: Record<string, unknown> = PRELIMINARY_ESTIMATE) {
  const ok = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(BASE, route => route.fulfill(ok(summary)));
  await page.route(`${BASE}/request-access`, route => route.fulfill(ok(summary)));
  await page.route(`${BASE}/verify`, route => route.fulfill(ok({ grant: "fixture-grant" })));
  await page.route(`${BASE}/view`, route => route.fulfill(ok(view)));
}

export async function openProposalView(page: Page) {
  await page.locator("main button.btn-primary").click();
  await page.locator("input[name=one-time-code]").fill("123456");
  await page.locator("main form button.btn-primary").click();
  await expect(page.locator("main [data-edge=tab] h1")).toBeVisible();
}
