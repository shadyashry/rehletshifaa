import { expect, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * The profile activation link with mocked public endpoints (synthetic data only): a summary, a code that is always
 * accepted, and the prefill the caller passes. `openActivationForm` walks the sealed page in either language without
 * depending on its words.
 */
export const ACTIVATION_TOKEN = "activation-fixture-token";
const BASE = `${API}/public/onboarding/${ACTIVATION_TOKEN}`;
const summary = { caseNumber: "RS-2026-000417", purpose: "ONBOARDING", channel: "WHATSAPP", destinationHint: "***0417" };

const deposit = { required: true, status: "REQUESTED", currency: "USD", amountDue: 1230, amountPaid: 0, balance: 1230, satisfied: false };
const notProvisioned = { status: "NOT_PROVISIONED", emailHint: null, awaitingEmail: false, emailSent: false };

/** Submitted by a representative; the number on file is theirs; a known, unverified email. */
export const REPRESENTATIVE_PREFILL = {
  caseNumber: "RS-2026-000417", caseStatus: "ACCEPTED", onboardingState: "IN_PROGRESS",
  profileActive: false, accountLinked: false, account: notProvisioned, currentAction: "COMPLETE_PROFILE", journeyStage: "PROFILE", waitingOn: "STAFF",
  givenName: "Fatima Abdelrahman", familyName: "Al-Mahdi", preferredName: null,
  candidateEmail: "fatima.almahdi@example.test", emailVerified: false, knownMobile: "+218910000417", mobileOwner: "REPRESENTATIVE", phoneVerified: true,
  dateOfBirth: null, nationality: null, countryOfResidence: "LY", preferredLanguage: "ar", sex: null,
  submittedBy: "REPRESENTATIVE", representativeName: "Abdelrahman Mohamed Al-Mahdi", representativeRelationship: "CHILD",
  requiredConsents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "MEDICAL_INFORMATION_SHARING", "DEPOSIT_CANCELLATION_TERMS"], completedConsents: [], deposit,
};

export async function setupActivationLink(page: Page, prefill: Record<string, unknown> = REPRESENTATIVE_PREFILL) {
  const ok = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(BASE, route => route.fulfill(ok(summary)));
  await page.route(`${BASE}/request-access`, route => route.fulfill(ok(summary)));
  await page.route(`${BASE}/verify`, route => route.fulfill(ok({ grant: "fixture-grant", expiresAt: "2099-01-01T00:00:00Z" })));
  await page.route(`${BASE}/profile`, route => route.fulfill(ok(prefill)));
}

export async function openActivationForm(page: Page) {
  await page.locator("main button.btn-primary").click();
  await page.locator("input[name=one-time-code]").fill("123456");
  await page.locator("main form button.btn-primary").click();
  await expect(page.locator("#act-givenName")).toBeVisible();
}
