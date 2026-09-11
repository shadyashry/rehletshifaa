import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { API } from "./env";

/**
 * Representative portal journeys against the real stack, through the real path:
 * browser -> Cloudflare -> cloudflared -> API gateway -> backend. Nothing is mocked and nothing is
 * bypassed: every business call must reach the gateway host, return no 429, and never fail to fetch.
 *
 * Journeys: the coordinator's open-case page on an acknowledged case (current action follows the real
 * blocker, no stale or premature actions, utilities behind More), the consultant's dashboard and case,
 * and the patient's dashboard, case and public proposal route.
 *
 * Skipped unless PORTAL_TEST_PASSWORD is set; PORTAL_TEST_CASE names the coordinator case to open.
 */
const PASSWORD = process.env.PORTAL_TEST_PASSWORD;
const USERNAME = process.env.PORTAL_TEST_USERNAME ?? "coordinator";
const CASE = process.env.PORTAL_TEST_CASE;
const CASE_2 = process.env.PORTAL_TEST_CASE_2;
const PASSWORDS: Record<string, string | undefined> = {
  coordinator: PASSWORD, doctor: process.env.DOCTOR_TEST_PASSWORD ?? PASSWORD, patient: process.env.PATIENT_TEST_PASSWORD ?? PASSWORD,
};

test.skip(!PASSWORD || !CASE, "PORTAL_TEST_PASSWORD and PORTAL_TEST_CASE are required for the live checks");
test.describe.configure({ mode: "serial" });

type Network = { calls: string[]; throttled: string[]; failed: string[]; offPath: string[] };

/** Records every business API call the page makes: where it went, and whether the gateway refused it. */
function watchNetwork(page: Page): Network {
  const net: Network = { calls: [], throttled: [], failed: [], offPath: [] };
  page.on("request", request => {
    const url = request.url();
    if (!url.includes("/api/v1/")) return;
    net.calls.push(`${request.method()} ${url}`);
    if (!url.startsWith(`${API}/`)) net.offPath.push(url);
  });
  page.on("response", response => {
    if (response.url().includes("/api/v1/") && response.status() === 429) net.throttled.push(`${response.request().method()} ${response.url()}`);
  });
  page.on("requestfailed", request => { if (request.url().includes("/api/v1/")) net.failed.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`); });
  return net;
}

function expectCleanNetwork(net: Network) {
  expect(net.calls.length, "the page made business API calls").toBeGreaterThan(0);
  expect(net.offPath, "every business call goes to the gateway host").toEqual([]);
  expect(net.throttled, "no legitimate request was rate-limited").toEqual([]);
  expect(net.failed, "no request failed to fetch").toEqual([]);
}

async function signIn(page: Page, user = USERNAME, locale = "en") {
  await page.goto(`/${locale}/portal`);
  await page.getByRole("button", { name: /Sign in securely|تسجيل الدخول/ }).click();
  await page.waitForURL(/\/realms\/rehletshifaa\/protocol\/openid-connect\/auth/, { timeout: 30000 });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(PASSWORDS[user] ?? PASSWORD!);
  await page.locator("#kc-login").click();
  await page.waitForURL(new RegExp(`/${locale}/portal`), { timeout: 30000 });
}

async function openCase(page: Page, caseNumber: string, locale = "en") {
  await page.getByRole("tab", { name: locale === "ar" ? /حالاتي/ : /My cases/ }).click();
  const row = page.locator("li", { hasText: caseNumber }).first();
  await expect(row).toBeVisible({ timeout: 20000 });
  await row.getByRole("button", { name: locale === "ar" ? "فتح" : "Open", exact: true }).first().click();
  await expect(page.locator("#current-action")).toBeVisible({ timeout: 20000 });
}

const shots = path.join("e2e", "screenshots");

test("coordinator: an acknowledged case shows the real blocker, nothing stale or premature, all through the gateway", async ({ page }) => {
  const net = watchNetwork(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await openCase(page, CASE!);
  const action = page.locator("#current-action");
  await expect(action.getByRole("heading")).toHaveText(/Waiting for|Arrange the coordination deposit|Waiting for the coordination deposit/);
  // The stale and the premature actions are gone from the whole page, not just hidden in one panel.
  await expect(page.getByText(/Clinical recommendation ready — prepare the proposal/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Prepare proposal/ })).toHaveCount(0);
  await expect(page.getByText(/Assign Operations to arrange travel/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Next step for this case/ })).toHaveCount(0);
  await expect(page.getByText(/Choose the next action/)).toHaveCount(0);
  await expect(page.getByText(/Safe next action/)).toHaveCount(0);
  expect(await action.locator("button.btn-primary").count()).toBeLessThanOrEqual(1);
  // Utilities are behind More, not permanent cards; a real action round-trips through the gateway too.
  await expect(page.getByRole("heading", { name: /Request more information|Information from the patient/ })).toHaveCount(0);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: /Request more information/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Assign/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Latest proposal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View proposal" })).toHaveCount(1);
  for (const label of ["Resend link", "Messages", "View proposal", "View full journey"])
    expect(await page.getByRole("button", { name: label, exact: true }).count(), label).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  expectCleanNetwork(net);
});

// The page is client-rendered, so one sign-in serves every width: resizing never refetches.
test("coordinator: renders cleanly and without overflow from desktop to phone", async ({ page }) => {
  const net = watchNetwork(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await openCase(page, CASE!);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(shots, `coordinator-case-en-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "More", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectCleanNetwork(net);
});

test("coordinator: reads right-to-left in Arabic at desktop and phone widths", async ({ page }) => {
  const net = watchNetwork(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, USERNAME, "ar");
  await openCase(page, CASE!, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#current-action").getByText("الإجراء الحالي")).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(shots, `coordinator-case-ar-${width}.png`), fullPage: true });
  }
  expectCleanNetwork(net);
});

test("coordinator: an unactivated profile is the current action, with resend as the only utility", async ({ page }) => {
  test.skip(!CASE_2, "PORTAL_TEST_CASE_2 not set");
  const net = watchNetwork(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await openCase(page, CASE_2!);
  const action = page.locator("#current-action");
  await expect(action.getByRole("heading")).toHaveText(/Waiting for the patient to activate their profile/);
  await expect(page.getByText("Profile activation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend link", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Prepare proposal|Assign/ })).toHaveCount(0);
  await page.screenshot({ path: path.join(shots, "coordinator-case-profile-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "coordinator-case-more-1440.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "View proposal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "coordinator-case-proposal-1440.png") });
  await page.keyboard.press("Escape");
  expectCleanNetwork(net);
});

test("consultant: dashboard and case open through the gateway without a single refusal", async ({ page }) => {
  const net = watchNetwork(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "doctor");
  await expect(page.getByRole("heading", { name: /Consultant workspace/ })).toBeVisible({ timeout: 20000 });
  await page.getByRole("tab", { name: /My cases/ }).click();
  const open = page.getByRole("button", { name: "Open", exact: true }).first();
  if (await open.count()) {
    await open.click();
    await expect(page.locator("#current-action")).toBeVisible({ timeout: 20000 });
    await page.getByRole("tab", { name: "Clinical" }).click();
    await page.getByRole("tab", { name: /Documents/ }).click();
  }
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  expectCleanNetwork(net);
});

test("patient: dashboard, case and the public proposal route through the gateway without a single refusal", async ({ page }) => {
  const net = watchNetwork(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "patient");
  await expect(page.getByRole("heading", { name: "Patient" })).toBeVisible({ timeout: 20000 });
  const open = page.getByRole("button", { name: "Open", exact: true }).first();
  if (await open.count()) {
    await open.click();
    await expect(page.getByRole("button", { name: /My dashboard/ })).toBeVisible({ timeout: 20000 });
  }
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
  // The public proposal route is served by the backend through the gateway's public zone; an unknown
  // link is an honest "invalid or expired", never a network failure. Let the dashboard settle first so the
  // navigation cannot abort its in-flight refresh and masquerade as a fetch failure.
  await page.waitForLoadState("networkidle");
  await page.goto("/en/proposal/not-a-real-token");
  await expect(page.getByText(/invalid|expired|غير صالح/i).first()).toBeVisible({ timeout: 20000 });
  expectCleanNetwork(net);
});
