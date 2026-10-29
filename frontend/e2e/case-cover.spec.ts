import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { setupCoordinatorDay } from "./coordinator-fixture";

// UX area 2, slice 2-1: the staff case page's file cover and its one-next-action strip (synthetic fixtures only).
const shot = (name: string) => path.join("../docs/ux-redesign/screenshots/area-2/2-1", `${name}.png`);

async function openCase(page: Page, locale: "en" | "ar", width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await setupCoordinatorDay(page);
  await page.goto(`/${locale}/portal?case=owned`);
  await page.locator("#case-heading").waitFor();
}

for (const locale of ["en", "ar"] as const) {
  const ar = locale === "ar";
  test(`the case cover says the step, who waits and the patient's page once (${locale})`, async ({ page }) => {
    await openCase(page, locale, 1440);
    // The file tab: a 2px petrol top edge on the cover.
    await expect(page.locator('section[aria-labelledby="case-heading"]')).toHaveCSS("border-top-width", "2px");
    const strip = page.locator("#current-action");
    await expect(strip.getByText(ar ? "خطوتك" : "Your step", { exact: true })).toBeVisible();
    await expect(strip.getByRole("heading", { level: 3, name: ar ? "جهّز الحالة للاستشاري" : "Prepare the case for a Consultant" })).toBeVisible();
    await expect(strip.getByText(ar ? "ما تعرضه صفحة المريض" : "The patient's page")).toBeVisible();
    await expect(strip.getByText(ar ? "منسّقك يراجع حالتك" : "Your coordinator is reviewing your case")).toBeVisible();
    await expect(strip.getByText(ar ? /^عادةً خلال/ : "Usually within 2 working days")).toBeVisible();
    // Said once: waiting on (no rail chip, no patient-voice line in the brief), and the case number (no breadcrumb copy).
    const visible = (text: string | RegExp, exact = false) => page.getByText(text, { exact }).filter({ visible: true });
    await expect(visible(ar ? /^بانتظار$/ : /^Waiting on$/)).toHaveCount(1);
    await expect(visible(ar ? "بانتظار فريقنا" : "Waiting for our team")).toHaveCount(0);
    await expect(visible("RS-2026-000002", true)).toHaveCount(1);
    // The journey rail uses the journey markers: two reached, one current, the rest waiting.
    await expect(page.locator("aside .journey-marker")).toHaveCount(7);
    await expect(page.locator('aside .journey-marker[data-state="current"]')).toHaveCount(1);
    // The other open item on this case, not the one the step already is.
    const alsoOpen = page.getByRole("region", { name: ar ? "مهام أخرى مفتوحة في هذه الحالة" : "Also open on this case" });
    await expect(alsoOpen.getByRole("listitem")).toHaveCount(1);
    await expect(alsoOpen).toContainText(ar ? "متأخر منذ" : "Overdue since");
    // Header buttons are 44px with the Field Edge; the back control names the view.
    const back = page.getByRole("button", { name: ar ? "العودة إلى مهامي" : "Back to My work" });
    await expect(back).toBeVisible();
    for (const button of [back, page.getByRole("button", { name: ar ? /الرسائل/ : /Messages/ }), page.getByRole("button", { name: ar ? /المزيد/ : /More/ })]) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(button).toHaveCSS("border-top-color", "rgb(122, 137, 140)");
    }
    // At most one filled action on the view.
    expect(await page.locator(".btn-primary:visible").count()).toBeLessThanOrEqual(1);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot(`case-${locale}-${width}`), fullPage: true });
    }
  });

  test(`the strip stays with you, moves focus to the step without hiding it, and opens the next item (${locale})`, async ({ page }) => {
    for (const width of [1440, 390]) {
      await openCase(page, locale, width, 640);
      // The case number is isolated for bidirectional text (U+2066 … U+2069) in Arabic.
      const line = page.getByRole("region", { name: new RegExp(`^${ar ? "الحالة" : "Case"} ⁦?RS-2026-000002⁩?$`) });
      await expect(line).toHaveCount(0);
      await page.mouse.wheel(0, 2400);
      await expect(line).toBeVisible();
      await expect(line).toContainText("Maya Example");
      await expect(line).toContainText(ar ? "خطوتك: جهّز الحالة للاستشاري" : "Your step: Prepare the case for a Consultant");
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot(`case-line-${locale}-${width}`) });
      await line.getByRole("button", { name: ar ? "انتقل إلى خطوتك" : "Go to your step" }).click();
      const focused = page.locator("#current-action :focus");
      await expect(focused).toHaveCount(1);
      // WCAG 2.4.11: the focused control is on screen and not under the sticky line (or the site header).
      const box = (await focused.boundingBox())!;
      // The line itself may have gone: the jump brings the cover (and so the step) back into view.
      const bar = (await line.count()) ? await line.boundingBox() : null;
      expect(box.y).toBeGreaterThanOrEqual(bar ? bar.y + bar.height : 0);
      expect(box.y + box.height).toBeLessThanOrEqual(640);
    }
    // Next in My work: the item after this case in My work's order (the team case), opened at its top with its heading focused.
    await page.getByRole("navigation", { name: ar ? "مساحة عمل الحالة" : "Case workspace" }).getByRole("button", { name: ar ? /التالي في مهامي/ : /Next in My work/ }).click();
    await expect(page).toHaveURL(/case=team/);
    await expect(page.locator("#case-heading")).toHaveText("Omar Example");
    await expect(page.locator("#case-heading")).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
