import { expect, test, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * Journey A — public patient entry, end to end against the real backend.
 * Nothing is mocked: the case number and status link come from the API, so a regression in
 * intake persistence, submission or the status hand-off fails this test.
 */

async function fillContactStep(page: Page, name: string) {
  // Structured names: given name(s) + family name/surname — never a single "full name".
  const [given, family] = name.split(" ");
  await page.getByLabel("Given name(s)").fill(given);
  await page.getByLabel(/^Family name \/ surname/).fill(family ?? "");
  await page.getByRole("combobox", { name: /country/i }).fill("Kenya");
  await page.getByRole("option", { name: /Kenya/ }).click();
  await page.getByLabel("Phone number").fill("700000000");
  await page.getByRole("button", { name: "Continue" }).click();
}

test("patient submits a case through the wizard and receives a case number and status link", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: "Start my case" }).first().click();
  await expect(page.getByRole("heading", { name: "Send Your Medical Case" })).toBeVisible();

  const whatsappLinks = page.locator('a[href^="https://wa.me/"]');
  expect(await whatsappLinks.count()).toBeGreaterThan(0);
  for (const link of await whatsappLinks.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/201010447898(?:\?|$)/);
  }

  await fillContactStep(page, "Playwright Intake");
  await page.getByRole("button", { name: "Continue" }).click(); // step 2 is entirely optional

  await page.getByText("I consent to RehletShifaa").click();
  const submit = page.getByRole("button", { name: "Send My Case" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByRole("heading", { name: "Your Case Has Been Received" })).toBeVisible();
  await expect(page.getByText(/^RS-\d{4}-\d{6}$/)).toBeVisible();
  // The status link is the patient's only way back into the case, so it must be offered here.
  await expect(page.getByRole("link", { name: "Track your case" })).toHaveAttribute("href", /\/en\/status\/[0-9a-f]{40,}/);
});

test("the wizard blocks an incomplete contact step instead of advancing", async ({ page }) => {
  await page.goto("/en/send-my-case");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please enter the given name(s).")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Case Has Been Received" })).toHaveCount(0);
});

test("consent is required before the case can be sent", async ({ page }) => {
  await page.goto("/en/send-my-case");
  await fillContactStep(page, "Playwright Consent");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Send My Case" })).toBeDisabled();
});

test("retrying after a failed submit continues the same case instead of creating a second one", async ({ page }) => {
  let creates = 0;
  let submits = 0;
  await page.route(`${API}/cases`, async route => { creates += 1; await route.continue(); });
  // Fail the first submit the way a dropped connection would, then let the retry through.
  await page.route(url => url.pathname.endsWith("/submit"), async route => {
    submits += 1;
    if (submits === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UNAVAILABLE", message: "" }) });
    await route.continue();
  });

  await page.goto("/en/send-my-case");
  await fillContactStep(page, "Playwright Retry");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("I consent to RehletShifaa").click();
  await page.getByRole("button", { name: "Send My Case" }).click();

  // The patient is told the case is unfinished, not that everything failed.
  await expect(page.locator(`[role="alert"]:not(#__next-route-announcer__)`)).toContainText("Press Send My Case again");
  await page.getByRole("button", { name: "Send My Case" }).click();
  await expect(page.getByRole("heading", { name: "Your Case Has Been Received" })).toBeVisible();

  // The whole point: one case and one patient record, not two.
  expect(creates).toBe(1);
  expect(submits).toBe(2);
});

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`intake fits ${width}px with no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en/send-my-case");
    await expect(page.getByRole("heading", { name: "Send Your Medical Case" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("the Arabic intake renders right-to-left without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ar/send-my-case");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a case for someone else records the representative separately and keeps email optional", async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route(`${API}/cases`, async route => { payload = route.request().postDataJSON(); await route.continue(); });
  await page.goto("/en/send-my-case");
  // The quiet existing-account entry sits above the form and is not a competing CTA.
  await expect(page.getByRole("link", { name: /sign in to use your saved details/i })).toBeVisible();
  await page.getByRole("radio", { name: /someone else/i }).check({ force: true });
  await page.getByLabel("Given name(s)").fill("Layla");
  await page.getByLabel(/^Family name \/ surname/).fill("Hassan");
  await page.getByRole("combobox", { name: /country/i }).fill("Kenya");
  await page.getByRole("option", { name: /Kenya/ }).click();
  await page.getByLabel("Your name").fill("Omar Hassan");
  await page.getByLabel(/relationship to the patient/i).selectOption("PARENT");
  await page.getByLabel("Phone number").fill("700000006");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Submitted by")).toBeVisible();
  await page.getByText("I consent to RehletShifaa").click();
  await page.getByRole("button", { name: "Send My Case" }).click();
  await expect(page.getByRole("heading", { name: "Your Case Has Been Received" })).toBeVisible();
  expect(payload).toMatchObject({ caseFor: "SOMEONE_ELSE", givenName: "Layla", familyName: "Hassan", representative: { name: "Omar Hassan", relationship: "PARENT" }, email: null });
  expect(payload).not.toHaveProperty("fullName");
});
