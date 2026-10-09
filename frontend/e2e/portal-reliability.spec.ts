import { expect, test, type Page } from "@playwright/test";

import { setupPatient } from "./patient-fixture";
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

/** A failed /me read leaves no known role. The portal says so and offers a retry instead of an empty page. */
const accessAlert = (page: Page, ar: boolean) => page.getByRole("alert").filter({ hasText: ar ? /تعذّر التحقق من صلاحياتك/ : /couldn't confirm your access/ });

for (const locale of ["en", "ar"] as const) {
  test(`a failed access check says so and recovers on retry (${locale})`, async ({ page }) => {
    await setupPortal(page, "COORDINATOR");
    let failing = true;
    // Registered after the fixture, so it answers first.
    await page.route("**/api/v1/me", route => failing && route.request().method() === "GET"
      ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.fallback());
    await page.goto(`/${locale}/portal`);
    const ar = locale === "ar";
    const alert = accessAlert(page, ar);
    await expect(alert).toBeVisible();
    failing = false;
    await alert.getByRole("button", { name: ar ? "إعادة المحاولة" : "Try again" }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByRole("button", { name: ar ? "فتح" : "Open", exact: true }).first()).toBeVisible();
  });
}

test("a patient whose access re-check fails is told so, not left loading, and gets the case back on retry", async ({ page }) => {
  await setupPatient(page, "deposit-paid");
  // A linked patient's session registration re-reads /me once: that second read fails.
  let reads = 0, failing = true;
  await page.route("**/api/v1/me", route => {
    if (route.request().method() !== "GET") return route.fallback();
    reads++;
    return reads >= 2 && failing ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.fallback();
  });
  await page.goto("/en/portal");
  const alert = accessAlert(page, false);
  await expect(alert).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Loading your workspace" })).toHaveCount(0);
  failing = false;
  await alert.getByRole("button", { name: "Try again" }).click();
  await expect(alert).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
});

test("a patient's case stays on screen while their access is re-read", async ({ page }) => {
  await setupPatient(page, "deposit-paid");
  // Hold the second /me read (the linked session's refresh) until the page has been checked.
  let reads = 0, release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/me", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    reads++;
    if (reads === 2) await held;
    return route.fallback();
  });
  await page.goto("/en/portal");
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { level: 1, name: "My Care" })).toBeVisible();
});

// Resending revokes the link the patient holds: it is confirmed first, and backing out sends nothing.
for (const locale of ["en", "ar"] as const) {
  test(`resending the secure link asks first (${locale})`, async ({ page }) => {
    const ar = locale === "ar";
    const { writes } = await setupPortal(page, "COORDINATOR", { assistedDecision: true, delivery: true });
    await page.goto(`/${locale}/portal`);
    await page.getByRole("button", { name: ar ? "فتح" : "Open", exact: true }).first().click();
    const resend = page.getByRole("button", { name: ar ? "إعادة الإرسال" : "Resend link" });
    const resent = () => writes.filter(w => w.path.endsWith("/resend")).length;
    await resend.click();
    const confirm = page.getByRole("alertdialog", { name: ar ? "إرسال رابط آمن جديد؟" : "Send a new secure link?" });
    await expect(confirm).toBeVisible();
    // It names where the new link goes.
    await expect(confirm).toContainText("•••• 7898");
    await expect(confirm.getByRole("button", { name: ar ? "إلغاء" : "Cancel" })).toBeFocused();
    await confirm.getByRole("button", { name: ar ? "إلغاء" : "Cancel" }).click();
    await expect(confirm).toBeHidden();
    expect(resent()).toBe(0);
    await resend.click();
    await page.getByRole("alertdialog").getByRole("button", { name: ar ? "إرسال رابط جديد" : "Send new link" }).click();
    await expect.poll(resent).toBe(1);
  });
}
