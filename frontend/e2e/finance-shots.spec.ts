import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { FINANCE_CASES, setupFinanceDay } from "./finance-fixture";

// UX area 4: Finance's side of the file, shot on the synthetic Finance fixture only. `AREA4_SHOTS` names the folder under
// screenshots/area-4 (default "before", the critique's baseline); the slices write their own. One test per page, so the
// pages shoot in parallel and a slow one never costs the others.
const folder = process.env.AREA4_SHOTS ?? "before";
const shot = (name: string) => path.join("../docs/ux-redesign/screenshots/area-4", folder, `${name}.png`);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
}

for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test.describe(`Finance shots (${locale}, ${width})`, () => {
    test.beforeEach(async ({ page }) => {
      await setupFinanceDay(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    });

    test("my work", async ({ page }) => {
      await page.goto(`/${locale}/portal?view=work`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: shot(`my-work-${locale}-${width}`), fullPage: true });
    });

    for (const id of FINANCE_CASES) test(`case ${id}`, async ({ page }) => {
      test.setTimeout(120000);
      await page.goto(`/${locale}/portal?case=${id}`);
      await page.locator("#case-heading").waitFor();
      await settle(page);
      await page.screenshot({ path: shot(`case-${id}-${locale}-${width}`), fullPage: true });
    });
  });
}
