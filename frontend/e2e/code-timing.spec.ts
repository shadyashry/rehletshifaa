import { expect, test, type Page } from "@playwright/test";

import { API } from "./env";

/**
 * The one-time-code step on a secure link: the code's lifetime said once in words, Resend waiting a minute after a send
 * (shown on the button, never a ticking clock over the field), and an expired code told apart from a wrong one.
 * Synthetic fixtures only; screenshots go to test-results (not tracked).
 */
const BASE = `${API}/public/cases/timing-token`;
const summary = { caseNumber: "RS-2026-000001", purpose: "STATUS", channel: "WHATSAPP", destinationHint: "***0001" };

async function openCodeStep(page: Page, locale: "en" | "ar") {
  await page.route(BASE, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/request-access`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/verify`, route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "VERIFICATION_EXPIRED" }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${locale}/status/timing-token`);
}

test("in English, the code step says how long the code works and makes Resend wait", async ({ page }) => {
  await openCodeStep(page, "en");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByText("The code works for 10 minutes.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send a new code in 0:[0-5]\d|^Send a new code in 1:00/ })).toBeDisabled();
  await page.screenshot({ path: "test-results/code-timing/code-step-en-390.png", fullPage: true });
  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This code has expired. Send a new one." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("in Arabic, the same step reads right-to-left with the wait on the button", async ({ page }) => {
  await openCodeStep(page, "ar");
  await page.getByRole("button", { name: "إرسال رمز التحقّق" }).click();
  await expect(page.getByText("الرمز صالح لمدة 10 دقائق.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^إرسال رمز جديد بعد [01]:\d\d$/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/code-timing/code-step-ar-390.png", fullPage: true });
});
