import { expect, test } from "@playwright/test";

/** Case tracking: input shaping and validation, the neutral success state, resend cooldown and honest failures. */
test.describe("track case", () => {
  test("formats the Case ID, validates both fields and sends the request the API expects", async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route("**/public/cases/recover", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
    });
    await page.goto("/en/track-case");
    await expect(page.getByRole("heading", { level: 1, name: "Track your case securely" })).toBeVisible();

    await page.getByRole("button", { name: /Send my secure tracking link/ }).click();
    await expect(page.getByText("Enter the Case ID in the format RS-2026-000123.")).toBeVisible();
    await expect(page.getByLabel("Case ID")).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);

    await page.getByLabel("Case ID").fill("rs 2026 000123");
    await expect(page.getByLabel("Case ID")).toHaveValue("RS-2026-000123");
    await page.getByLabel("Registered WhatsApp number").fill("+20 100 123 4567");
    await page.getByRole("button", { name: /Send my secure tracking link/ }).click();

    const confirmation = page.getByRole("heading", { name: "Check your WhatsApp" });
    await expect(confirmation).toBeFocused();
    expect(bodies.at(-1)).toEqual({ caseNumber: "RS-2026-000123", whatsappNumber: "+20 100 123 4567", language: "en" });
    await expect(page.getByText(/Requested for RS-2026-000123/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled();
    await page.getByRole("button", { name: "Use different details" }).click();
    await expect(page.getByLabel("Case ID")).toHaveValue("RS-2026-000123");
  });

  test("explains rate limiting instead of a generic error", async ({ page }) => {
    await page.route("**/public/cases/recover", (route) => route.fulfill({ status: 429, body: "{}" }));
    await page.goto("/en/track-case");
    await page.getByLabel("Case ID").fill("RS-2026-000123");
    await page.getByLabel("Registered WhatsApp number").fill("+201001234567");
    await page.getByRole("button", { name: /Send my secure tracking link/ }).click();
    await expect(page.locator("main [role=alert]")).toContainText("Too many attempts");
  });

  test("forgets a saved link the API no longer recognises", async ({ page }) => {
    await page.route("**/public/cases/abcdefghijklmnopqrstuvwxyz0123456789ABCD", (route) => route.fulfill({ status: 404, body: "{}" }));
    await page.goto("/en/track-case");
    await page.evaluate(() => localStorage.setItem("rehletshifaa:last-status-path", "/en/status/abcdefghijklmnopqrstuvwxyz0123456789ABCD"));
    await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("rehletshifaa:last-status-path"))).toBeNull();
    await expect(page.getByRole("link", { name: "Open my saved link" })).toHaveCount(0);
  });

  test("offers the saved link first and fits a phone in Arabic", async ({ page }) => {
    await page.route("**/public/cases/abcdefghijklmnopqrstuvwxyz0123456789ABCD", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar/track-case");
    await page.evaluate(() => localStorage.setItem("rehletshifaa:last-status-path", "/en/status/abcdefghijklmnopqrstuvwxyz0123456789ABCD"));
    await page.reload();
    await expect(page.getByRole("link", { name: /فتح الرابط المحفوظ/ })).toHaveAttribute("href", "/ar/status/abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
