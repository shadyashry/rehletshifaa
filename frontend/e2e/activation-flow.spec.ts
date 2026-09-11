import { expect, test, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * The patient journey as a patient sees it: complete profile, profile is ready, then — separately —
 * the case deposit. The backend is mocked so the run is hermetic; what is verified is that the two
 * concerns never share a screen or a button.
 */
const TOKEN = "activation-token";
const BASE = `${API}/public/onboarding`;

const deposit = { required: true, status: "REQUESTED", currency: "EGP", amountDue: 3000, amountPaid: 0, balance: 3000, satisfied: false };
const prefill = {
  caseNumber: "RS-2026-000030", caseStatus: "ACCEPTED", onboardingState: "IN_PROGRESS",
  profileActive: false, accountLinked: false, currentAction: "COMPLETE_PROFILE", journeyStage: "PROFILE", waitingOn: "STAFF",
  fullName: "Mohamed Ahmed", email: "m@local.test", phone: "+201010447898",
  dateOfBirth: "1985-04-02", nationality: "EG", countryOfResidence: "KE", preferredLanguage: "en", sex: "MALE",
  emailVerified: true, phoneVerified: true, requiredConsents: ["COORDINATION"], completedConsents: [], deposit,
};

async function mockBackend(page: Page, activateAction = "NONE") {
  const summary = { caseNumber: "RS-2026-000030", channel: "WHATSAPP", destinationHint: "***7898", whatsappHint: "***7898", emailHint: null };
  await page.route(`${BASE}/${TOKEN}`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/request-access`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/verify`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ grant: "grant-1" }) }));
  await page.route(`${BASE}/${TOKEN}/profile`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prefill) }));
  await page.route(`${BASE}/${TOKEN}/activate`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    profileActive: true, accountLinked: false, caseNumber: "RS-2026-000030", caseStatus: "ACCEPTED",
    onboardingState: "COMPLETED", currentAction: activateAction,
    journeyStage: activateAction === "NONE" ? "DEPOSIT" : "CARE_COORDINATION", waitingOn: "STAFF", deposit,
  }) }));
  await page.route(`${BASE}/${TOKEN}/deposit`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deposit) }));
}

async function reachForm(page: Page, locale: "en" | "ar" = "en") {
  await page.goto(`/${locale}/activate/${TOKEN}`);
  await page.getByRole("button", { name: locale === "ar" ? /إرسال|الرمز/ : /send|code/i }).first().click();
  await page.getByRole("textbox").first().fill("123456");
  await page.getByRole("button", { name: locale === "ar" ? /تحقق|تأكيد/ : /verify|continue/i }).first().click();
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
  await page.getByLabel(/coordination|consent|terms/i).first().check().catch(() => {});
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: /complete my profile/i }).click();
}

test("profile completion never shows a payment control", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await reachForm(page);

  for (const gone of [/pay/i, /deposit/i, /payment status/i])
    expect(await page.getByRole("button", { name: gone }).count(), `payment control on the profile step: ${gone}`).toBe(0);
  await expect(page.getByRole("button", { name: /complete my profile/i })).toBeVisible();
  await expectNoOverflow(page);
});

test("the profile finishes on its own, then the deposit is offered as the next task", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockBackend(page);
  await reachForm(page);
  await completeProfile(page);

  await expect(page.getByRole("heading", { name: /your profile is ready/i })).toBeVisible();
  // No amount is on this screen: the patient finishes one task before starting the next.
  expect(await page.getByText(/3,000/).count()).toBe(0);

  await page.getByRole("button", { name: /view deposit details/i }).click();
  await expect(page.getByRole("heading", { name: /deposit arrangements/i })).toBeVisible();
  await expect(page.getByText(/3,000/).first()).toBeVisible();
  await expect(page.getByText(/no action is required from you right now/i)).toBeVisible();
  // Nothing on this screen is a payment, and nothing on it is a dominant CTA.
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
    await expect(page.getByRole("heading", { name: /your profile is ready/i })).toBeVisible();
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
  await mockBackend(page);
  await reachForm(page);
  await completeProfile(page);
  await page.getByRole("button", { name: /view deposit details/i }).click();
  await page.screenshot({ path: "e2e/screenshots/deposit-stage-1280.png", fullPage: true });
});
