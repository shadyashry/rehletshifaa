import { expect, test, type Page } from "@playwright/test";

import path from "node:path";

import { setupPortal, staffView } from "./portal-fixture";

const shots = (name: string) => path.join("..", "docs", "ux-redesign", "screenshots", "pass-3", `${name}.png`);

/**
 * Pass 3 portal P2s (docs/ux-redesign/plans/portal-p2-pass-3.md): unsent text asks before the case closes, and the
 * staff view lives in the URL. Synthetic fixtures only.
 */
const openFirstCase = async (page: Page, ar = false) => {
  await page.getByRole("button", { name: ar ? "فتح" : "Open", exact: true }).first().click();
  await expect(page.locator("#case-heading")).toBeVisible();
};
const draftField = (page: Page) => page.locator("textarea:visible").first();
/** A Consultant's clinical review is the longest text typed in a case. */
const openClinicalReview = async (page: Page, ar = false) => {
  await openFirstCase(page, ar);
  await page.getByRole("tab", { name: ar ? /الملف السريري/ : /Clinical/ }).click();
};

for (const locale of ["en", "ar"] as const) {
  test(`leaving a case with unsent text asks first, in the page's language (${locale})`, async ({ page }) => {
    const ar = locale === "ar";
    await setupPortal(page, "DOCTOR");
    await page.goto(`/${locale}/portal`);
    await openClinicalReview(page, ar);
    await draftField(page).fill("Synthetic note that has not been sent");
    await page.getByRole("button", { name: ar ? /لوحة التحكم/ : /My dashboard/ }).click();
    const dialog = page.getByRole("alertdialog", { name: ar ? "مغادرة هذه الحالة؟" : "Leave this case?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: ar ? "متابعة التحرير" : "Keep editing" })).toBeFocused();
    await page.screenshot({ path: shots(`leave-case-${locale}-1440`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: shots(`leave-case-${locale}-390`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(draftField(page)).toHaveValue("Synthetic note that has not been sent");
    await page.getByRole("button", { name: ar ? /لوحة التحكم/ : /My dashboard/ }).click();
    await dialog.getByRole("button", { name: ar ? "المغادرة وتجاهل النص" : "Leave and discard the text" }).click();
    await expect(page.locator("#case-heading")).toHaveCount(0);
  });
}

test("leaving a case without typed text never asks", async ({ page }) => {
  await setupPortal(page, "COORDINATOR");
  await page.goto("/en/portal");
  await openFirstCase(page);
  await page.getByRole("button", { name: /My dashboard/ }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator("#case-heading")).toHaveCount(0);
});

test("the staff view is in the URL: deep links, Back/Forward and new tabs reach it", async ({ page }) => {
  await setupPortal(page, "COORDINATOR_LEAD");
  await page.goto("/en/portal?view=team");
  await expect(staffView(page, /Team queue/)).toHaveAttribute("aria-current", "page");
  await expect(staffView(page, /My work/)).toHaveAttribute("href", /view=work/);
  await staffView(page, /My work/).click();
  await expect(page).toHaveURL(/view=work/);
  await expect(staffView(page, /My work/)).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/view=team/);
  await expect(staffView(page, /Team queue/)).toHaveAttribute("aria-current", "page");
});

test("picking a view from inside a case moves focus to that view's visible heading", async ({ page }) => {
  await setupPortal(page, "COORDINATOR_LEAD");
  await page.goto("/en/portal?view=mine");
  await openFirstCase(page);
  await staffView(page, /Team queue/).click();
  const heading = page.getByRole("heading", { level: 2, name: "Team queue" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
});

test("leaving a case from My dashboard hands the focus to the view's heading", async ({ page }) => {
  await setupPortal(page, "COORDINATOR_LEAD");
  await page.goto("/en/portal?view=mine");
  await openFirstCase(page);
  await page.getByRole("button", { name: /My dashboard/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "My cases" })).toBeFocused();
});

test("Back returns to the landing view even though its URL named no view", async ({ page }) => {
  await setupPortal(page, "COORDINATOR_LEAD");
  await page.goto("/en/portal");
  // Landing picks the first view with work once the queue has loaded.
  await expect(page.locator("#staff-view h2.title")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const landed = await page.getByRole("navigation", { name: "Your work" }).locator('[aria-current="page"]').textContent();
  const other = landed?.includes("Team queue") ? /My work/ : /Team queue/;
  await staffView(page, other).click();
  await expect(staffView(page, other)).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Your work" }).locator('[aria-current="page"]')).toHaveText(landed ?? "");
});

test("browser Back with unsent text asks, Keep editing stays on the case, and leaving does not leave a dead Back step", async ({ page }) => {
  await setupPortal(page, "DOCTOR");
  await page.goto("/en/portal?view=work");
  await staffView(page, /My cases/).click();
  await openClinicalReview(page);
  await draftField(page).fill("Synthetic note that has not been sent");
  await page.goBack();
  const dialog = page.getByRole("alertdialog", { name: "Leave this case?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#case-heading")).toBeVisible();
  await expect(draftField(page)).toHaveValue("Synthetic note that has not been sent");
  await page.goBack();
  await dialog.getByRole("button", { name: "Leave and discard the text" }).click();
  await expect(page.locator("#case-heading")).toHaveCount(0);
});

test("a saved draft is not unsent text", async ({ page }) => {
  await setupPortal(page, "DOCTOR");
  await page.goto("/en/portal");
  await openClinicalReview(page);
  await draftField(page).fill("Synthetic recommendation saved as a draft");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
  await page.getByRole("button", { name: /My dashboard/ }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator("#case-heading")).toHaveCount(0);
});
