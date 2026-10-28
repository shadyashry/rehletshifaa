import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { setupOperationsDay, type OperationsCaseId } from "./operations-fixture";

// UX area 5: Operations' side of the file, shot on the synthetic Operations fixture only. `AREA5_SHOTS` names the folder under
// screenshots/area-5 (default "before", the critique's baseline); the slices write their own.
const folder = process.env.AREA5_SHOTS ?? "before";
const shot = (name: string) => path.join("../docs/ux-redesign/screenshots/area-5", folder, `${name}.png`);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
}

const CASES: OperationsCaseId[] = ["plan", "letter", "balance", "admit", "depart"];

for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test(`Operations shots (${locale}, ${width})`, async ({ page }) => {
    test.setTimeout(240000);
    await setupOperationsDay(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`/${locale}/portal?view=work`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: shot(`my-work-${locale}-${width}`), fullPage: true });
    for (const id of CASES) {
      await page.goto(`/${locale}/portal?case=${id}`);
      await page.locator("#case-heading").waitFor();
      await settle(page);
      await page.screenshot({ path: shot(`case-${id}-${locale}-${width}`), fullPage: true });
    }
  });
}
