import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { portalAlerts, setupPortal, staffView } from "./portal-fixture";

// Staff home (UX redesign pass 2, plans/staff-home.md): synthetic fixtures only.
const shots = (name: string) => path.join("../docs/ux-redesign/screenshots/pass-2", `${name}.png`);
const noOverflow = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

for (const locale of ["en", "ar"] as const) {
  for (const width of [375, 390, 768, 1024, 1440]) {
    test(`staff home ${locale} ${width}: lands where the work is, one count line, staff navigation, slim footer`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setupPortal(page, "COORDINATOR_LEAD");
      await page.goto(`/${locale}/portal`);
      const ar = locale === "ar";
      // Nothing is assigned to this coordinator, so the home opens on the cases they own.
      await expect(staffView(page, ar ? /حالاتي/ : /My cases/)).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { level: 2, name: ar ? "حالاتي" : "My cases" })).toBeVisible();
      // One navigation on screen: the header copy from md, the inline copy below it.
      const nav = page.getByRole("navigation", { name: ar ? "أقسام العمل" : "Your work" });
      await expect(nav).toHaveCount(1);
      // From md the navigation sits in the header and must stay on one line there.
      if (width >= 768) await expect.poll(() => nav.locator("li").evaluateAll(items => new Set(items.map(item => Math.round(item.getBoundingClientRect().top))).size)).toBe(1);
      // Counts are a line of filters, never a disabled zero tile; the Cards toggle is gone.
      await expect(page.locator("#dashboard-summary-title + * button:disabled")).toHaveCount(0);
      await expect(page.getByRole("button", { name: ar ? /^بطاقات$/ : /^Cards$/ })).toHaveCount(0);
      // The portal ends on the app footer: legal links, no marketing groups.
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByRole("link", { name: ar ? /الخصوصية/ : /Privacy/ })).toBeVisible();
      await expect(footer.getByText(ar ? /واتساب/ : /WhatsApp/)).toHaveCount(0);
      await expect(portalAlerts(page)).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: shots(`staff-home-${locale}-${width}`), fullPage: true });
    });
  }
}

test("an explicit view choice wins over the landing rule and the role switch lives in the account menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupPortal(page, "COORDINATOR_LEAD");
  await page.goto("/en/portal");
  await staffView(page, /Team queue/).click();
  await expect(page.getByRole("heading", { level: 2, name: "Team queue" })).toBeVisible();
  await page.reload();
  await expect(staffView(page, /Team queue/)).toHaveAttribute("aria-current", "page");
  // No row of filled role buttons above the page.
  await expect(page.getByRole("button", { name: "Coordinator", exact: true })).toHaveCount(0);
});

for (const locale of ["en", "ar"] as const) {
  test(`assigning a Consultant has one entry point with the care area chosen (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupPortal(page, "COORDINATOR");
    await page.goto(`/${locale}/portal`);
    const ar = locale === "ar";
    await page.getByRole("button", { name: ar ? "فتح" : "Open", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Maya Example" })).toBeVisible();
    const panel = page.locator("#current-action");
    await expect(panel.getByRole("group", { name: ar ? "تعيين استشاري" : "Assign a Consultant" })).toBeVisible();
    // The panel carries no CTA of its own: the form is the entry point.
    await expect(panel.getByRole("button", { name: ar ? "تعيين استشاري" : "Assign Consultant", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("combobox", { name: ar ? "مجال رعاية الحالة" : "Case care area" })).toHaveValue("cardiology");
    // The fixture has no eligible Consultant: the coordinator gets a next step, not a dead end.
    await expect(panel.getByRole("button", { name: ar ? "اختر مجال رعاية آخر" : "Choose another care area" })).toBeVisible();
    // Nobody to choose, so no disabled submit.
    await expect(page.getByRole("button", { name: ar ? "تعيين الاستشاري" : "Assign Consultant" })).toHaveCount(0);
    await page.screenshot({ path: shots(`assign-consultant-${locale}-1440`), fullPage: true });
  });
}
