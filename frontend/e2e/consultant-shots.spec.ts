import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { setupConsultantDay, type ConsultantCaseId } from "./consultant-fixture";

// UX area 3: the Consultant's side of the file, shot on the synthetic Consultant fixture only. `AREA3_SHOTS` names the
// folder under screenshots/area-3 (default "before", the critique's baseline); the slices write their own.
const folder = process.env.AREA3_SHOTS ?? "before";
const shot = (name: string) => path.join("../docs/ux-redesign/screenshots/area-3", folder, `${name}.png`);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
}

const CASES: [ConsultantCaseId, boolean][] = [["review", true], ["assess", true], ["treat", false], ["discharge", false], ["follow", false]];

for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test(`Consultant shots (${locale}, ${width})`, async ({ page }) => {
    test.setTimeout(240000);
    await setupConsultantDay(page);
    {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/portal?view=work`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: shot(`my-work-${locale}-${width}`), fullPage: true });
      for (const [id, clinical] of CASES) {
        await page.goto(`/${locale}/portal?case=${id}`);
        await page.locator("#case-heading").waitFor();
        await settle(page);
        if (clinical) {
          const tab = page.getByRole("tab", { name: locale === "ar" ? /سريري|السريرية/ : /^Clinical/ });
          if (await tab.count()) { await tab.first().click(); await settle(page); }
        }
        await page.screenshot({ path: shot(`case-${id}-${locale}-${width}`), fullPage: true });
      }
      await page.goto(`/${locale}/portal/virtual-clinic`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: shot(`clinic-overview-${locale}-${width}`), fullPage: true });
      const services = page.getByRole("tab", { name: locale === "ar" ? "الخدمات والأسعار" : "Services & prices" });
      if (await services.count()) { await services.click(); await settle(page); await page.screenshot({ path: shot(`clinic-services-${locale}-${width}`), fullPage: true }); }
    }
  });
}
