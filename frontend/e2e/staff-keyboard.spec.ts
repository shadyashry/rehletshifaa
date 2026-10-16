import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { setupCoordinatorDay } from "./coordinator-fixture";

// UX area 2, slice 2-2: the coordinator workspace's keyboard flow (synthetic fixtures only).
const shot = (name: string) => path.join("../docs/ux-redesign/screenshots/area-2/2-2", `${name}.png`);

async function openMyWork(page: Page, locale: "en" | "ar", width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await setupCoordinatorDay(page);
  await page.goto(`/${locale}/portal?view=work`);
  await page.locator("#staff-view [data-roving-list] [data-roving-primary]").first().waitFor();
}
const list = (page: Page) => page.locator("#staff-view:not([hidden]) [data-roving-list]");
const row = (page: Page, id: string) => list(page).locator(`[data-row="${id}"] [data-roving-primary]`);

for (const locale of ["en", "ar"] as const) {
  const ar = locale === "ar";

  test(`My work is one tab stop; keys move between rows, open, and Back returns to the row (${locale})`, async ({ page }) => {
    await openMyWork(page, locale, 1440, 640);
    await expect(list(page).locator('[data-roving-primary][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("j");
    await expect(row(page, "w1")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "w2")).toBeFocused();
    await page.keyboard.press("End");
    await expect(row(page, "w3")).toBeFocused();
    await page.keyboard.press("k");
    await expect(row(page, "w2")).toBeFocused();
    await expect(list(page).locator('[data-roving-primary][tabindex="0"]')).toHaveCount(1);
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`my-work-row-${locale}-1440`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await row(page, "w2").evaluate(node => node.closest("[data-row]")!.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`my-work-row-${locale}-390`) });
    await page.setViewportSize({ width: 1440, height: 640 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    // Shift+Tab leaves the list in one step (there is nothing else in its rows), Tab comes back to the same row.
    await page.keyboard.press("Shift+Tab");
    await expect(list(page).locator(":focus")).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(row(page, "w2")).toBeFocused();

    const scrolled = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/case=owned/);
    await expect(page.locator("#case-heading")).toBeFocused();
    await page.getByRole("button", { name: ar ? "العودة إلى مهامي" : "Back to My work" }).press("Enter");
    await expect(page).not.toHaveURL(/case=/);
    await expect(row(page, "w2")).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

    // After n, Back returns to the row of the case just closed.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/case=owned/);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/case=team/);
    await page.getByRole("button", { name: ar ? "العودة إلى مهامي" : "Back to My work" }).press("Enter");
    await expect(row(page, "w3")).toBeFocused();

    // My work has no search: / goes to My cases and its search.
    await page.keyboard.press("/");
    await expect(page).toHaveURL(/view=mine/);
    await expect(page.locator("#staff-view:not([hidden]) input[type='search']")).toBeFocused();
  });

  test(`n opens the next item, g goes to a view, / searches, and keys stay out of fields and dialogs (${locale})`, async ({ page }) => {
    await openMyWork(page, locale);
    await page.keyboard.press("j");
    await page.keyboard.press("Enter");
    await expect(page.locator("#case-heading")).toBeFocused();
    // A drawer is modal: n does nothing under it.
    await page.getByRole("button", { name: ar ? /الرسائل/ : /Messages/ }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/case=owned/);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/case=team/);
    await expect(page.locator("#case-heading")).toHaveText("Omar Example");

    // g then c: My cases, from the case; the view's heading takes the focus.
    await page.keyboard.press("g");
    await page.keyboard.press("c");
    await expect(page).toHaveURL(/view=mine/);
    await expect(page.locator("#portal-title")).toBeFocused();
    await expect(list(page).locator('[data-roving-primary][tabindex="0"]')).toHaveCount(1);
    // In the queue the row's other controls join the tab order only while the list has the focus.
    await expect(list(page).locator('button:not([data-roving-primary])[tabindex="0"]')).toHaveCount(0);
    await page.keyboard.press("j");
    await expect(list(page).locator('[data-roving-primary]').first()).toBeFocused();
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot(`my-cases-row-${locale}-1440`) });
    await page.keyboard.press("Shift+Tab");
    await expect(list(page).locator(":focus")).toHaveCount(1);
    // Back from a case opened in the queue returns to its row there, and the row's other controls leave the tab order.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("#case-heading")).toBeFocused();
    await page.getByRole("button", { name: ar ? /^العودة إلى/ : /^Back to/ }).press("Enter");
    await expect(list(page).locator("[data-roving-primary]").first()).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(list(page).locator('button:not([data-roving-primary])[tabindex="0"]')).toHaveCount(0);

    // `/` searches; typed letters stay in the field.
    await page.keyboard.press("/");
    const search = page.locator("#staff-view:not([hidden]) input[type='search']");
    await expect(search).toBeFocused();
    await page.keyboard.type("jk");
    await expect(search).toHaveValue("jk");
    await search.fill("");

    // g then t: the Team queue; Arrow keys there are the list's own.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("g");
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/view=team/);
  });

  test(`? names every key and the off switch is kept in this browser (${locale})`, async ({ page }) => {
    for (const width of [1440, 390]) {
      await openMyWork(page, locale, width, 900);
      await page.keyboard.press("?");
      const help = page.getByRole("dialog", { name: ar ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts" });
      await expect(help).toBeVisible();
      for (const text of ar ? ["في القائمة", "مهامي", "حالاتي", "قائمة الفريق", "المحادثات", "البحث في الحالات", "فتح العنصر التالي في مهامي"]
                            : ["In a list", "My work", "My cases", "Team queue", "Conversations", "Search cases", "Open the next item in My work"])
        await expect(help).toContainText(text);
      await page.waitForTimeout(250);
      await page.screenshot({ path: shot(`help-${locale}-${width}`) });
      await page.keyboard.press("Escape");
      await expect(help).toHaveCount(0);
      // The focus returns to where it was.
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }
    const trigger = page.getByRole("button", { name: ar ? /اختصارات لوحة المفاتيح/ : /Keyboard shortcuts/ });
    await trigger.click();
    await page.getByRole("checkbox", { name: ar ? /اختصارات بمفتاح واحد/ : /Single-key shortcuts/ }).uncheck();
    await page.getByRole("button", { name: ar ? "إغلاق" : "Close" }).click();
    await expect(trigger).toBeFocused();
    await page.reload();
    await list(page).locator("[data-roving-primary]").first().waitFor();
    await page.keyboard.press("j");
    await expect(list(page).locator(":focus")).toHaveCount(0);
    await page.keyboard.press("?");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toContainText(ar ? "متوقفة" : "off");
    // Widget keys stay: the list still moves by arrow.
    await row(page, "w1").focus();
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "w2")).toBeFocused();
  });
}
