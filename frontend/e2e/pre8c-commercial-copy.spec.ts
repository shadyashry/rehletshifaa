import { expect, test, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * Pre-8C commercial copy closure, checked in the built app: the approved deposit/refund/cancellation terms are on screen
 * before the patient acknowledges an estimate and again above the activation consent; a stored range is shown as a range;
 * the exchange rate is explained as fixed for the document; a final quote is accepted, not acknowledged; expiry says so.
 * Hermetic: synthetic data only, every business call is mocked, and any unmocked API call is refused and asserted absent.
 * Screenshots go to test-results/ (not tracked).
 */
const PROPOSAL_TOKEN = "pre8c-proposal";
const ONBOARDING_TOKEN = "pre8c-activation";
const SHOTS = "test-results/pre8c-commercial-copy";

const summary = { caseNumber: "RS-2026-000930", channel: "WHATSAPP", destinationHint: "***7898", whatsappHint: "***7898", emailHint: null };
const estimate = {
  caseNumber: "RS-2026-000930", patientName: "Synthetic Patient", documentType: "PRELIMINARY_ESTIMATE", versionNumber: 1, currency: "USD",
  items: [
    { id: "i1", category: "MEDICAL", description: "Exercise stress test", quantity: 1, unitPrice: 150, optional: false },
    { id: "i2", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 8050, optional: false },
  ],
  totalMin: 7800, totalExpected: 8200, totalMax: 9400, assumptions: "Standard dual-chamber device; two-night stay.",
  includedServices: "Stress test; pacemaker implant", excludedServices: "Services not explicitly included",
  paymentTerms: "Payment schedule to be confirmed", refundTerms: "Subject to provider terms",
  validUntil: new Date(Date.now() + 14 * 86400000).toISOString(), decided: false,
  recommendedTreatment: "Dual-chamber pacemaker implantation.", depositDueDisplay: 162, consultantName: "Dr. Synthetic Consultant",
  fxRateDate: "2026-09-24",
};
const finalQuote = { ...estimate, documentType: "FINAL_TREATMENT_QUOTE", totalMin: 8100, totalExpected: 8100, totalMax: 8100,
  depositDueDisplay: undefined, depositPaidDisplay: 162, scopeChangeReason: "Confirmed after in-person assessment." };

const deposit = { required: true, status: "REQUESTED", currency: "USD", amountDue: 162, amountPaid: 0, balance: 162, satisfied: false };
const prefill = {
  caseNumber: "RS-2026-000930", caseStatus: "ACCEPTED", onboardingState: "IN_PROGRESS", profileActive: false, accountLinked: false,
  account: { status: "NOT_PROVISIONED", emailHint: null, awaitingEmail: false, emailSent: false },
  currentAction: "COMPLETE_PROFILE", journeyStage: "PROFILE", waitingOn: "STAFF",
  givenName: "Synthetic", familyName: "Patient", preferredName: null,
  candidateEmail: "synthetic@local.test", emailVerified: false, knownMobile: "+201000000930", mobileOwner: "PATIENT", phoneVerified: true,
  dateOfBirth: "1985-04-02", nationality: "EG", countryOfResidence: "EG", preferredLanguage: "en", sex: "MALE",
  submittedBy: "PATIENT", representativeName: null, representativeRelationship: null,
  requiredConsents: ["PRIVACY_DATA_PROCESSING", "CROSS_BORDER_CARE", "DEPOSIT_CANCELLATION_TERMS"], completedConsents: [], deposit,
};

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/** Refuse every business call that is not explicitly mocked, and remember it so the test can assert none happened. */
async function guard(page: Page) {
  const refused: string[] = [];
  await page.route(`${API}/**`, (route) => { refused.push(`${route.request().method()} ${route.request().url()}`); return route.abort(); });
  return refused;
}

async function openDocument(page: Page, doc: unknown, locale: "en" | "ar" = "en") {
  const refused = await guard(page);
  const base = `${API}/public/proposals/${PROPOSAL_TOKEN}`;
  await page.route(base, (r) => r.fulfill(json(summary)));
  await page.route(`${base}/request-access`, (r) => r.fulfill(json(summary)));
  await page.route(`${base}/verify`, (r) => r.fulfill(json({ grant: "grant-1" })));
  await page.route(`${base}/view`, (r) => r.fulfill(json(doc)));
  await page.goto(`/${locale}/proposal/${PROPOSAL_TOKEN}`);
  await page.getByRole("button", { name: locale === "ar" ? "إرسال الرمز" : "Send code" }).click();
  await page.getByLabel(locale === "ar" ? "أدخل الرمز المكوّن من 6 أرقام" : "Enter the 6-digit code").fill("123456");
  await page.getByRole("button", { name: locale === "ar" ? "تحقّق" : "Verify" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return refused;
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 375, height: 812 }]) {
  test(`preliminary estimate (${viewport.name}): terms before acknowledgement, range, fixed rate, no placeholders`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const refused = await openDocument(page, estimate);
    const terms = page.getByRole("region", { name: "Coordination deposit, refunds and cancellation" });
    await expect(terms).toBeVisible();
    await expect(terms).toContainText("You pay this deposit after you acknowledge your preliminary estimate");
    await expect(terms).toContainText("No refund if you cancel, or do not attend, after we have confirmed an appointment or booking for you.");
    const termsBox = await terms.boundingBox(), ackBox = await page.getByRole("checkbox").boundingBox();
    expect(termsBox!.y).toBeLessThan(ackBox!.y);
    await expect(page.getByText("$7,800 to $9,400").first()).toBeVisible();
    await expect(page.getByLabel("Estimate summary")).toContainText("Expected: $8,200");
    await expect(page.getByText(/This rate is fixed for this estimate while it is valid/)).toBeVisible();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/Payment schedule to be confirmed|Subject to provider terms|Services not explicitly included/);
    expect(text).not.toMatch(/\blive\b|real-time|official rate|central bank|within 14 days|\btax/i);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/estimate-${viewport.name}-en.png`, fullPage: true });
    expect(refused).toEqual([]);
  });
}

test("final treatment plan and quote: accepted, not medical consent, no estimate language", async ({ page }) => {
  const refused = await openDocument(page, finalQuote);
  await expect(page.getByRole("heading", { name: "Your final treatment plan and quote" })).toBeVisible();
  await expect(page.getByText("I accept this final treatment plan and quote for the confirmed services listed, at the price shown.")).toBeVisible();
  await expect(page.getByText("Accepting this quote is not medical consent. Your treating doctor will ask for separate informed consent before treatment.")).toBeVisible();
  await expect(page.getByText(/This rate is fixed for this quote while it is valid/)).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/non-binding|financial agreement|may increase or decrease/i);
  await page.screenshot({ path: `${SHOTS}/final-quote-desktop-en.png`, fullPage: true });
  expect(refused).toEqual([]);
});

test("an expired estimate can no longer be acknowledged", async ({ page }) => {
  await openDocument(page, { ...estimate, validUntil: "2020-01-01T00:00:00Z" });
  await expect(page.getByText(/This estimate has expired and can no longer be acknowledged/)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/estimate-expired-en.png` });
});

test("activation shows the deposit terms right above the consent that accepts them", async ({ page }) => {
  const refused = await guard(page);
  const base = `${API}/public/onboarding/${ONBOARDING_TOKEN}`;
  await page.route(base, (r) => r.fulfill(json({ caseNumber: "RS-2026-000930", purpose: "ONBOARDING", channel: "WHATSAPP", destinationHint: "***0930" })));
  await page.route(`${base}/request-access`, (r) => r.fulfill(json({ caseNumber: "RS-2026-000930", purpose: "ONBOARDING", channel: "WHATSAPP", destinationHint: "***0930" })));
  await page.route(`${base}/verify`, (r) => r.fulfill(json({ grant: "grant-1" })));
  await page.route(`${base}/profile`, (r) => r.fulfill(json(prefill)));
  await page.goto(`/en/activate/${ONBOARDING_TOKEN}`);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByRole("textbox").first().fill("123456");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: "Complete your profile" })).toBeVisible();
  const terms = page.getByRole("region", { name: "Coordination deposit, refunds and cancellation" });
  await expect(terms).toContainText("$162");
  await expect(terms).toContainText("The exchange rate used in your proposal is fixed for that proposal.");
  const consent = page.getByRole("checkbox", { name: "I have read the coordination deposit, refund and cancellation terms shown above and accept them." });
  await expect(consent).toBeVisible();
  expect((await terms.boundingBox())!.y).toBeLessThan((await consent.boundingBox())!.y);
  await terms.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/activation-consent-desktop-en.png`, fullPage: true });
  expect(refused).toEqual([]);
});

test("arabic estimate shows the approved English terms with the pending-Arabic notice, right to left", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const refused = await openDocument(page, estimate, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const terms = page.locator("#deposit-terms");
  await expect(terms).toContainText("تُعرض هذه الشروط بالإنجليزية إلى حين اعتماد صياغتها العربية.");
  await expect(terms.locator('[lang="en"]')).toContainText("Full refund if you cancel before we confirm any appointment or booking for you.");
  await noHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/estimate-mobile-ar.png`, fullPage: true });
  expect(refused).toEqual([]);
});
