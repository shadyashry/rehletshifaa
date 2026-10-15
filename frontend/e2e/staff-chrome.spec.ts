import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { setupCoordinatorDay } from "./coordinator-fixture";

// UX area 2, slice 2-4: quieter chrome — the view's name is the page's place, the role line and the count line on My work
// only, Out of office as one line, one tab style — and the area's closing shots (synthetic fixtures only).
const after = (name: string) => path.join("../docs/ux-redesign/screenshots/area-2/after", `${name}.png`);
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function blocking(page: Page) {
  const result = await new AxeBuilder({ page }).include("main").withTags(TAGS).analyze();
  return result.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`);
}

for (const locale of ["en", "ar"] as const) {
  const ar = locale === "ar";
  const copy = ar
    ? { work: "مهامي", mine: "حالاتي", team: "قائمة الفريق", conversations: "المحادثات", role: "راجع الحالات ونسّق الخطوة التالية للرعاية.", overdue: "حالة واحدة متأخرة",
        away: "خارج المكتب", none: "لا توجد تغطية محددة", glance: "نظرة سريعة", showing: "الحالات:", messages: /الرسائل/, nav: "أقسام العمل" }
    : { work: "My work", mine: "My cases", team: "Team queue", conversations: "Conversations", role: "Review cases and coordinate the next step in care.", overdue: "1 case overdue",
        away: "Out of office", none: "No cover set", glance: "At a glance", showing: "Showing:", messages: /Messages/, nav: "Your work" };

  test(`the page is named by its view; the role and count lines stay on My work (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupCoordinatorDay(page);
    await page.goto(`/${locale}/portal?view=work`);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(copy.work);
    await expect(page.getByText(copy.role)).toBeVisible();
    await expect(page.getByRole("region", { name: copy.glance })).toBeAttached();
    // Overdue work of this coordinator's own: the alert ink.
    await expect(page.getByRole("button", { name: copy.overdue })).toHaveCSS("color", "rgb(140, 43, 40)");
    // Out of office: one closed line that already says where things stand.
    const away = page.locator("details").filter({ hasText: copy.away });
    await expect(away).not.toHaveAttribute("open", "");
    await expect(away.locator("summary")).toContainText(copy.none);
    // One tab style: the current place is underlined in the header navigation (a nav with aria-current, not pressed buttons).
    const current = page.getByRole("navigation", { name: copy.nav }).locator('[aria-current="page"]').first();
    await expect(current).toHaveCSS("border-bottom-width", "2px");
    await expect(page.locator("[aria-pressed]").filter({ hasText: copy.work })).toHaveCount(0);

    await page.goto(`/${locale}/portal?view=mine`);
    await expect(h1).toHaveText(copy.mine);
    await expect(page.getByText(copy.role)).toHaveCount(0);
    await expect(page.getByRole("region", { name: copy.glance })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: copy.mine })).toHaveCount(0);

    await page.goto(`/${locale}/portal?view=conversations`);
    await expect(h1).toHaveText(copy.conversations);
    await expect(page.getByRole("heading", { level: 2, name: copy.conversations })).toHaveCount(0);
  });

  test(`the count line's filter follows to the list it opens, as a chip (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupCoordinatorDay(page);
    await page.goto(`/${locale}/portal?view=work`);
    await page.getByRole("button", { name: copy.overdue }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.mine);
    await expect(page.getByText(copy.showing)).toBeVisible();
  });

  test(`a case opened from My work takes the focus on its heading once its page has mounted (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupCoordinatorDay(page);
    // The case page arrives late (as under load): the focus must still land on its heading, not be lost in one frame.
    await page.route("**/_next/static/chunks/**", async route => { await new Promise(resolve => setTimeout(resolve, 150)); await route.fallback(); });
    await page.goto(`/${locale}/portal?view=work`);
    await page.locator("#staff-view [data-roving-list] [data-row] button").first().click();
    await expect(page.locator("#case-heading")).toBeFocused();
    // The page's own h1 names the case for assistive technology; the cover names the patient visibly.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar ? "الحالة RS-2026-000002" : "Case RS-2026-000002");
  });

  test(`closing shots of the coordinator workspace (${locale})`, async ({ page }) => {
    test.setTimeout(120_000);
    await setupCoordinatorDay(page);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const [view, name] of [["work", "my-work"], ["mine", "my-cases"], ["team", "team-queue"], ["conversations", "conversations"]] as const) {
        await page.goto(`/${locale}/portal?view=${view}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy[view]);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(200);
        await page.screenshot({ path: after(`${name}-${locale}-${width}`), fullPage: true });
        if (width === 1440) expect(await blocking(page)).toEqual([]);
      }
      await page.goto(`/${locale}/portal?case=owned`);
      await page.locator("#case-heading").waitFor();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(200);
      await page.screenshot({ path: after(`case-${locale}-${width}`), fullPage: true });
      if (width === 1440) expect(await blocking(page)).toEqual([]);
      await page.getByRole("button", { name: copy.messages }).first().click();
      await page.locator("dialog[open]").waitFor();
      await page.waitForTimeout(250);
      await page.screenshot({ path: after(`case-messages-${locale}-${width}`) });
    }
  });
}
