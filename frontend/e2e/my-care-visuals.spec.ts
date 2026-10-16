import { expect, test } from "@playwright/test";
import path from "node:path";

import { setupPatient, type Scenario } from "./patient-fixture";

/**
 * UX 1c-1 (patient visuals, My Care + deposit): every visual is drawn from a field the backend sent — the earlier pages
 * of the file and the journey's dates from `milestones`, the payment track and the receipt's stamps from the deposit
 * and its transfer, the received-of-total bar from a part payment. Synthetic fixtures only.
 */
const shots = (name: string) => path.join("../docs/ux-redesign/screenshots/1c-1", `${name}.png`);
const scenarios: Scenario[] = ["consultant-review", "proposal-ready", "pay-deposit-rejected", "deposit-checking", "deposit-paid"];

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    for (const scenario of scenarios) {
      test(`My Care visuals: ${scenario} (${locale} ${width})`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await setupPatient(page, scenario);
        await page.goto(`/${locale}/portal`);
        await expect(page.locator("#current-step-title")).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: shots(`${scenario}-${locale}-${width}`), fullPage: true });
      });
    }
  }
}

test("the file grows one stamped sheet per dated moment the journey reached, and the journey prints those dates", async ({ page }) => {
  await setupPatient(page, "consultant-review");
  await page.goto("/en/portal");
  // In review: the page itself carries the "In review" stamp; "Case received" is the one sheet behind it.
  const sheets = page.getByRole("list", { name: "Earlier in your file" });
  await expect(sheets.getByRole("listitem")).toHaveCount(1);
  await expect(sheets).toContainText("Case received");
  await expect(sheets).toContainText("Received, Sep 1");
  await expect(page.getByText("Your file · 2 pages")).toBeVisible();
  const journey = page.getByRole("region", { name: "Your care journey" });
  await expect(journey.locator("time")).toHaveCount(2);

  await page.goto("about:blank");
  await setupPatient(page, "deposit-paid");
  await page.goto("/en/portal");
  await expect(page.getByRole("list", { name: "Earlier in your file" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Your care journey" }).locator("time")).toHaveCount(3);
});

test("the deposit is tracked: checking stamped Sent, confirmed stamped Received, a part payment as a bar", async ({ page }) => {
  await setupPatient(page, "deposit-checking");
  await page.goto("/en/portal");
  const track = page.getByRole("list", { name: "Payment steps" });
  await expect(track.locator("[aria-current='step']")).toContainText("Finance checks it");
  await expect(page.locator(".pay-receipt")).toContainText("Sent, Sep 12");
  // A sent reference has no amount: nothing fills a bar while Finance checks it.
  await expect(page.locator(".pay-paid-bar")).toHaveCount(0);

  await page.goto("about:blank");
  await setupPatient(page, "deposit-paid");
  await page.goto("/en/portal");
  await expect(page.getByRole("list", { name: "Payment steps" }).locator("[aria-current='step']")).toHaveCount(0);
  await expect(page.locator(".pay-receipt")).toContainText("Received, Sep 13");

  await page.goto("about:blank");
  await setupPatient(page, "pay-deposit-rejected");
  await page.goto("/ar/portal");
  await expect(page.getByRole("list", { name: "خطوات الدفع" }).locator("[aria-current='step']")).toContainText("تدفع وترسل");
  await expect(page.getByRole("img", { name: /استُلم .*200.* من وديعة قيمتها .*500/ })).toBeVisible();
});
