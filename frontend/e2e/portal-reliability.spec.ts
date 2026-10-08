import { expect, test } from "@playwright/test";

import { setupPortal } from "./portal-fixture";

/**
 * Portal reliability (UX redesign pass 2, plans/portal-reliability.md): drafts survive a tab switch, a drawer shows the
 * result of what was done inside it, and an action does not disable the whole workspace. Synthetic fixtures only.
 */
test("a consultant's clinical draft survives switching tabs", async ({ page }) => {
  await setupPortal(page, "DOCTOR");
  await page.goto("/en/portal");
  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await page.getByRole("tab", { name: /Clinical/ }).click();
  const draft = page.locator("#clinical-recommendation");
  await draft.fill("Dual-chamber pacemaker; synthetic draft text");
  await page.getByRole("tab", { name: /Overview/ }).click();
  await expect(draft).toBeHidden();
  await page.getByRole("tab", { name: /Clinical/ }).click();
  await expect(draft).toHaveValue("Dual-chamber pacemaker; synthetic draft text");
});

for (const locale of ["en", "ar"] as const) {
  test(`a drawer action shows its result inside the drawer and keeps the workspace usable (${locale})`, async ({ page }) => {
    await setupPortal(page, "COORDINATOR");
    await page.goto(`/${locale}/portal`);
    const ar = locale === "ar";
    await page.getByRole("button", { name: ar ? "فتح" : "Open", exact: true }).first().click();
    await page.getByRole("button", { name: ar ? "المزيد" : "More" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: ar ? /تفعيل باقة السفر المتكاملة/ : /Turn on the full travel package/ }).click();
    // The page banner sits behind the modal; the drawer says it itself.
    await expect(drawer.getByRole("status")).toBeVisible();
    await page.keyboard.press("Escape");
    // Nothing in the workspace was left disabled or dimmed by the action.
    await expect(page.locator("fieldset[disabled]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: ar ? "المزيد" : "More" })).toBeEnabled();
  });
}
