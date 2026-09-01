import { expect, test } from "@playwright/test";

test("English portal offers secure sign in", async ({ page }) => {
  await page.goto("/en/portal");

  await expect(page.getByRole("heading", { name: "Secure care portal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in securely" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("Arabic portal renders right-to-left", async ({ page }) => {
  await page.goto("/ar/portal");

  await expect(page.getByRole("heading", { name: "بوابة رحلة الشفاء الآمنة" })).toBeVisible();
  await expect(page.getByRole("button", { name: "تسجيل الدخول الآمن" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
