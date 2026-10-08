import { expect, test } from "@playwright/test";
import path from "node:path";

import { setupPatient } from "./patient-fixture";

/** My Care polish (pass 2): the patient is named, one focal surface, and the proposal drawer is a sheet on phones. */
const shots = (name: string) => path.join("../docs/ux-redesign/screenshots/pass-2", `${name}.png`);

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`My Care names the patient and keeps one focal surface (${locale} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setupPatient(page, "deposit-arranging");
      await page.goto(`/${locale}/portal`);
      await expect(page.locator("#case-heading")).toContainText("Maya Example");
      // Only the current step is a card; the other blocks are hairline sections on paper.
      await expect(page.locator("#case-heading")).not.toHaveClass(/\bcard\b/);
      await expect(page.locator("section.card")).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: shots(`my-care-${locale}-${width}`), fullPage: true });
    });
  }
}

test("the proposal drawer fills the phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "proposal-ready");
  await page.goto("/en/portal");
  await page.getByRole("button", { name: "Review proposal" }).click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box && box.width).toBeGreaterThanOrEqual(388);
  expect(box && box.height).toBeGreaterThanOrEqual(840);
  await page.screenshot({ path: shots("proposal-drawer-en-390") });
});
