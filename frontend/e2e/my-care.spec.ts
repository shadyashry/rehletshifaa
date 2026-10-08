import { expect, test, type Page } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/**
 * My Care — the signed-in patient's landing: straight onto the current case, the backend's current step
 * as the strongest element, at most one primary action, the deposit truthfully arranged by our side,
 * one proposal action, one way to reach the coordinator, three destinations and nothing else.
 * Synthetic fixtures only; the real journey is covered by my-care-live.spec.ts.
 */
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), "no horizontal overflow").toBe(false);

test("lands on the current case with the deposit being arranged: one step, no fake action, authoritative money", async ({ page }) => {
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  // Straight into the care journey — no dashboard, no list, no welcome card.
  await expect(page.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible();
  await expect(page).toHaveURL(/case=case-1/);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByText("No action is required from you right now.")).toBeVisible();
  // The only buttons on the page: navigation, the account menu, the proposal link and the one message control.
  const buttons = await page.getByRole("button").allTextContents();
  expect(buttons.filter(text => /continue|pay|check status|refresh|go to case|view progress/i.test(text))).toEqual([]);
  await expect(page.getByRole("button", { name: /^view proposal/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^message(\s*\d+)?$/i })).toHaveCount(1); // the coordinator block's one control (with its unread badge)
  const depositBlock = page.getByRole("region", { name: "Coordination deposit", exact: true });
  await expect(depositBlock).toContainText("$500");
  await expect(depositBlock).toContainText("Arranging");
  await expect(depositBlock.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/EGP|E£/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Preliminary care estimate" })).toContainText("$4,850");
  await expect(page.getByRole("region", { name: "Your coordinator" })).toContainText("Sara Ahmed");
  // Header navigation is exactly three destinations.
  const nav = page.getByRole("navigation", { name: "My Care" }).first();
  await expect(nav.getByRole("button")).toHaveText(["My Care", "Documents", "Messages1"]);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-1440.png", fullPage: true });
  for (const width of [1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/my-care-deposit-${width}.png`, fullPage: true });
  }
});

test("a linked patient registers the session once and the page settles instead of reloading", async ({ page }) => {
  const { calls } = await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible();
  await page.waitForTimeout(1500);
  const settled = { ...calls };
  // One registration per signed-in subject; /me is read on sign-in and refreshed once because the session is linked.
  expect(settled.session).toBe(1);
  expect(settled.me).toBeLessThanOrEqual(2);
  expect(settled.roleless, "no role-scoped URL is built while /me reloads").toBe(0);
  await page.waitForTimeout(1000);
  expect(calls, "nothing is re-requested once the page has settled").toEqual(settled);
  await expect(page.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible();
});

test("on a phone the current step comes before everything else, and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Deposit arrangements" })).toBeVisible();
  await noOverflow(page);
  const order = await page.evaluate(() => {
    const top = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().top ?? Infinity;
    return { step: top("#current-step-title"), deposit: top("#deposit-title"), journey: top("[aria-label='Your care journey']"), proposal: top("#proposal-title"), coordinator: top("#coordinator-title") };
  });
  expect(order.step).toBeLessThan(order.deposit);
  expect(order.deposit).toBeLessThan(order.journey);
  expect(order.journey).toBeLessThan(order.proposal);
  expect(order.proposal).toBeLessThan(order.coordinator);
  // The current step is on the first screen.
  expect(order.step).toBeLessThan(844);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-390.png", fullPage: true });
});

test("deposit confirmed: success state, no stale arrangement step", async ({ page }) => {
  await setupPatient(page, "deposit-paid");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "We are arranging your treatment" })).toBeVisible();
  const depositBlock = page.getByRole("region", { name: "Coordination deposit", exact: true });
  await expect(depositBlock).toContainText("Deposit received");
  await expect(depositBlock).toContainText("$500");
  await expect(page.getByText(/Arranging|Deposit arrangements|Pay deposit/)).toHaveCount(0);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-paid-1440.png", fullPage: true });
});

test("a proposal waiting for a decision is the one primary action and opens in place", async ({ page }) => {
  const { writes } = await setupPatient(page, "proposal-ready");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Your proposal is ready to review" })).toBeVisible();
  await expect(page.getByText("No action is required from you right now.")).toHaveCount(0);
  const review = page.getByRole("button", { name: "Review proposal" });
  await expect(review).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^view proposal/i })).toHaveCount(0); // not twice
  await review.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("$4,850");
  await expect(dialog.getByText(/EGP|E£/)).toHaveCount(0);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /Acknowledge estimate/ }).click();
  expect(writes.find(w => w.path.endsWith("/proposals/v1/decision"))?.body).toMatchObject({ decision: "ACKNOWLEDGED" });
});

test("Documents and Messages are one click away; Profile & Security lives in the account menu, apart from the case", async ({ page }) => {
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en/portal");
  await page.getByRole("navigation", { name: "My Care" }).first().getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText("Echo_Report.pdf")).toBeVisible();
  await expect(page).toHaveURL(/view=documents/);
  await page.getByRole("navigation", { name: "My Care" }).first().getByRole("button", { name: /Messages/ }).click();
  await expect(page.getByText("Welcome — I will send the deposit details shortly.")).toBeVisible();
  await page.getByLabel("Account: Maya Example", { exact: true }).click();
  await page.getByRole("button", { name: "Profile & Security", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Maya");
  await expect(dialog).toContainText("maya@example.test");
  await expect(dialog).toContainText("Verified");
  await expect(dialog.getByRole("link", { name: /Password & account security/ })).toBeVisible();
  // Nothing from the case leaks into the profile.
  await expect(dialog.getByText(/RS-2026|\$500|\$4,850|Cardiology|deposit|proposal/i)).toHaveCount(0);
  await page.screenshot({ path: "e2e/screenshots/my-care-profile-1440.png", fullPage: true });
});

test("Arabic is right-to-left with the same single-action discipline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-arranging");
  await page.goto("/ar/portal");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "رعايتي" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ترتيبات الوديعة" })).toBeVisible();
  await expect(page.getByText("لا يلزم منك أي إجراء الآن.")).toBeVisible();
  await expect(page.getByRole("button", { name: /عرض العرض/ })).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-ar-390.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "e2e/screenshots/my-care-deposit-ar-1440.png", fullPage: true });
});

test("whose care it is follows the case, not the account's roles", async ({ page }) => {
  // A patient with their own record who also acts for a relative, looking at the relative's case.
  await setupPatient(page, "deposit-arranging", { viewer: "REPRESENTATIVE", roles: ["PATIENT", "PATIENT_REPRESENTATIVE"] });
  await page.goto("/en/portal");
  await expect(page.getByText(/Care for ⁨?Maya Example/)).toBeVisible();
  await page.goto("/ar/portal");
  await expect(page.getByText(/رعاية ⁨?Maya Example/)).toBeVisible();
});

test("a representative account looking at its own case sees the bare name", async ({ page }) => {
  await setupPatient(page, "deposit-arranging", { viewer: "SELF", roles: ["PATIENT_REPRESENTATIVE"] });
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
  await expect(page.getByText(/Care for/)).toHaveCount(0);
});

test("a patient with no case yet gets a calm explanation, not an empty dashboard", async ({ page }) => {
  await setupPatient(page, "no-case");
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "No active case yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send my case" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
});
