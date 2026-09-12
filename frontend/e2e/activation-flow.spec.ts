import { expect, test, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * The patient journey as a patient sees it: complete profile (pre-filled from the case), secure the account
 * through the identity provider, then — separately — the case deposit. The backend is mocked so the run is
 * hermetic; what is verified is that the three concerns never share a screen or a button, and that the
 * patient never re-enters what they already shared.
 */
const TOKEN = "activation-token";
const BASE = `${API}/public/onboarding`;

const deposit = { required: true, status: "REQUESTED", currency: "EGP", amountDue: 3000, amountPaid: 0, balance: 3000, satisfied: false };
const notProvisioned = { status: "NOT_PROVISIONED", emailHint: null, awaitingEmail: false, emailSent: false };
const setupPending = { status: "SETUP_PENDING", emailHint: "m***@local.test", awaitingEmail: true, emailSent: true };
const active = { status: "ACTIVE", emailHint: "m***@local.test", awaitingEmail: false, emailSent: false };
const prefill = {
  caseNumber: "RS-2026-000030", caseStatus: "ACCEPTED", onboardingState: "IN_PROGRESS",
  profileActive: false, accountLinked: false, account: notProvisioned, currentAction: "COMPLETE_PROFILE", journeyStage: "PROFILE", waitingOn: "STAFF",
  givenName: "Mohamed", familyName: "Ahmed", preferredName: null, legacyFullName: null, nameConfirmationRequired: false,
  candidateEmail: "m@local.test", emailVerified: false, knownMobile: "+201010447898", mobileOwner: "PATIENT", phoneVerified: true,
  dateOfBirth: "1985-04-02", nationality: "EG", countryOfResidence: "KE", preferredLanguage: "en", sex: "MALE",
  submittedBy: "PATIENT", representativeName: null, representativeRelationship: null,
  requiredConsents: ["COORDINATION"], completedConsents: [], deposit,
};

type Stage = "SET_UP_ACCOUNT" | "NONE" | "CONTINUE_IN_PORTAL";

async function mockBackend(page: Page, afterActivate: Stage = "SET_UP_ACCOUNT") {
  const summary = { caseNumber: "RS-2026-000030", channel: "WHATSAPP", destinationHint: "***7898", whatsappHint: "***7898", emailHint: null };
  const account = afterActivate === "SET_UP_ACCOUNT" ? setupPending : active;
  await page.route(`${BASE}/${TOKEN}`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/request-access`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/verify`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ grant: "grant-1" }) }));
  await page.route(`${BASE}/${TOKEN}/profile`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prefill) }));
  await page.route(`${BASE}/${TOKEN}/activate`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    profileActive: true, accountLinked: false, account, caseNumber: "RS-2026-000030", caseStatus: "ACCEPTED",
    onboardingState: "COMPLETED", currentAction: afterActivate,
    journeyStage: afterActivate === "SET_UP_ACCOUNT" ? "ACCOUNT_SETUP" : afterActivate === "NONE" ? "DEPOSIT" : "CARE_COORDINATION", waitingOn: "STAFF", deposit,
  }) }));
  await page.route(`${BASE}/${TOKEN}/resend-setup`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(setupPending) }));
  await page.route(`${BASE}/${TOKEN}/deposit`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deposit) }));
}

async function reachForm(page: Page, locale: "en" | "ar" = "en") {
  await page.goto(`/${locale}/activate/${TOKEN}`);
  await page.getByRole("button", { name: locale === "ar" ? /إرسال|الرمز/ : /send|code/i }).first().click();
  await page.getByRole("textbox").first().fill("123456");
  await page.getByRole("button", { name: locale === "ar" ? /تحقق|تأكيد|متابعة/ : /verify|continue/i }).first().click();
  await expect(page.getByRole("heading", { name: locale === "ar" ? /ملفك|بياناتك/ : /profile|details/i }).first()).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  const bad = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) offenders.push(`${el.tagName}.${el.className}`.slice(0, 90));
    });
    return { scrolls: doc.scrollWidth > doc.clientWidth + 1, offenders: offenders.slice(0, 4) };
  });
  expect(bad.offenders, `outside viewport: ${bad.offenders.join(" | ")}`).toEqual([]);
  expect(bad.scrolls, "document scrolls horizontally").toBe(false);
}

async function completeProfile(page: Page) {
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < await boxes.count(); i++) { const box = boxes.nth(i); if (!(await box.isChecked())) await box.check(); }
  await page.getByRole("button", { name: /^continue$/i }).click();
}

test("the profile is pre-filled from the case and never asks for case data or a registration", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await reachForm(page);

  await expect(page.getByText(/we've filled in what you already shared/i)).toBeVisible();
  await expect(page.getByLabel("Given name(s)")).toHaveValue("Mohamed");
  await expect(page.getByLabel(/^Family name \/ surname/)).toHaveValue("Ahmed");
  await expect(page.getByText("+201010447898")).toBeVisible();
  // The known email is a masked candidate with an explicit choice — not silently the account email.
  await expect(page.getByText("m***@local.test")).toBeVisible();
  await expect(page.getByRole("radio", { name: /use this email/i })).toBeVisible();
  // Mobile ownership is asked, never assumed.
  await expect(page.getByRole("radio", { name: /^me$/i })).toBeVisible();
  for (const gone of [/pay/i, /deposit/i, /payment status/i, /register/i])
    expect(await page.getByRole("button", { name: gone }).count(), `unexpected control on the profile step: ${gone}`).toBe(0);
  expect(await page.getByLabel(/care area|clinical|documents|password/i).count()).toBe(0);
  await expectNoOverflow(page);
});

test("profile completion flows straight into account setup, with a resend and no password on screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await reachForm(page);
  await completeProfile(page);

  await expect(page.getByRole("heading", { name: /profile information is complete/i })).toBeVisible();
  await expect(page.getByText(/create your password to securely access/i)).toBeVisible();
  await expect(page.getByText("m***@local.test")).toBeVisible();
  expect(await page.getByLabel(/password/i).count()).toBe(0);
  expect(await page.getByText(/3,000/).count()).toBe(0);
  await page.getByRole("button", { name: /resend setup link/i }).click();
  await expect(page.getByText(/new setup link is on its way/i)).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/account-setup-1280.png", fullPage: true });
});

test("with the account already active the profile finishes on its own, then the deposit is offered as the next task", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page, "NONE");
  await reachForm(page);
  await completeProfile(page);

  await expect(page.getByRole("heading", { name: /your profile is ready/i })).toBeVisible();
  // No amount is on this screen: the patient finishes one task before starting the next.
  expect(await page.getByText(/3,000/).count()).toBe(0);

  await page.getByRole("button", { name: /view deposit details/i }).click();
  await expect(page.getByRole("heading", { name: /deposit arrangements/i })).toBeVisible();
  await expect(page.getByText(/3,000/).first()).toBeVisible();
  await expect(page.getByText(/no action is required from you right now/i)).toBeVisible();
  expect(await page.getByRole("button", { name: /check payment status/i }).count()).toBe(0);
  // No dominant CTA in the page content: the patient has nothing to do, so nothing shouts at them.
  expect(await page.locator("main button.btn-primary, main a.btn-primary").count()).toBe(0);
});

test("a settled deposit sends the patient straight to their case", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page, "CONTINUE_IN_PORTAL");
  await reachForm(page);
  await completeProfile(page);

  await expect(page.getByRole("heading", { name: /your profile is ready/i })).toBeVisible();
  expect(await page.getByRole("button", { name: /view deposit details/i }).count()).toBe(0);
  await expect(page.getByRole("button", { name: /go to my case/i })).toBeVisible();
});

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`activation fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockBackend(page);
    await reachForm(page);
    await expectNoOverflow(page);
    await completeProfile(page);
    await expect(page.getByRole("heading", { name: /profile information is complete/i })).toBeVisible();
    await expectNoOverflow(page);
    if (width === 390) await page.screenshot({ path: "e2e/screenshots/activation-ready-390.png", fullPage: true });
    if (width === 1440) await page.screenshot({ path: "e2e/screenshots/activation-ready-1440.png", fullPage: true });
  });
}

test("the arabic journey is right-to-left and fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page);
  await page.goto(`/ar/activate/${TOKEN}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectNoOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/activation-ar-390.png", fullPage: true });
});

test("capture the deposit stage for review", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page, "NONE");
  await reachForm(page);
  await completeProfile(page);
  await page.getByRole("button", { name: /view deposit details/i }).click();
  await page.screenshot({ path: "e2e/screenshots/deposit-stage-1280.png", fullPage: true });
});
