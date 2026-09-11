import { expect, test, type Page } from "@playwright/test";

/**
 * Journey G — coordinator operations against the real stack: real Keycloak sign-in, real API,
 * real database. Nothing is mocked, so this is the test that notices if authentication, the queue
 * query, ownership or the reference-data caches break.
 *
 * It is skipped unless PORTAL_TEST_PASSWORD is set, because it needs the seeded dev identities.
 */
const PASSWORD = process.env.PORTAL_TEST_PASSWORD;
const USERNAME = process.env.PORTAL_TEST_USERNAME ?? "coordinator";

test.skip(!PASSWORD, "PORTAL_TEST_PASSWORD is not set; live portal checks need the dev identities");

// Serial: three parallel workers each opening a fresh OIDC login through the tunnel is the one thing
// in this suite that races. The assertions are unaffected; only the sign-ins are queued.
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, locale = "en") {
  await page.goto(`/${locale}/portal`);
  await page.getByRole("button", { name: /Sign in securely|تسجيل الدخول/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD!);
  await page.locator("#kc-login").click();
  await page.waitForURL(new RegExp(`/${locale}/portal`), { timeout: 30000 });
}

test("a coordinator signs in and sees their real workspace", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Coordinator" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("tab", { name: /My work/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /My cases/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Team queue/ })).toBeVisible();
  // A page-level alert here means a real API call failed under real auth.
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
});

test("the team queue lists real submitted cases and offers exactly one ownership action", async ({ page }) => {
  await signIn(page);
  await page.getByRole("tab", { name: /Team queue/ }).click();
  await expect(page.getByRole("button", { name: "Take ownership" }).first()).toBeVisible({ timeout: 20000 });
  // One ownership control per case row: the duplicate-action rule for this screen.
  const rows = await page.getByRole("button", { name: "Take ownership" }).count();
  const opens = await page.getByRole("button", { name: "Open", exact: true }).count();
  expect(rows).toBeGreaterThan(0);
  expect(opens).toBe(rows);
});

test("the portal has no horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Coordinator" })).toBeVisible({ timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
