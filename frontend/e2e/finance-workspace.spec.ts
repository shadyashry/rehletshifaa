import { expect, test } from "@playwright/test";

import { setupFinanceDay } from "./finance-fixture";

// UX area 4, on the synthetic Finance fixture: the money acts Finance commits, and the page that holds them.

test("a case in treatment draws each panel once, however often it renders", async ({ page }) => {
  await setupFinanceDay(page);
  await page.goto("/en/portal?case=change");
  await page.locator("#case-heading").waitFor();
  // The panels once shared one key, and every render appended copies of them (UX 4-0): the count stays one as the page settles.
  await expect(page.locator("#treatment-panel")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 3; i++) {
    await expect(page.locator("#admission-panel")).toHaveCount(1);
    await expect(page.locator("#treatment-panel")).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.body.scrollHeight)).toBeLessThan(12000);
});

test("Finance confirms a transfer only after a question that names the amount and the reference", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=deposit");
  await page.locator("#case-heading").waitFor();
  // The deposit moment: EGP leads, nothing paid yet so no refund, and the return is the second verb behind a disclosure.
  await expect(page.getByRole("button", { name: "Record a refund" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Return to the patient" })).toBeHidden();
  await expect(page.getByLabel("Amount received (EGP)")).toHaveValue("43200");
  await page.getByRole("button", { name: "Confirm payment received" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Record EGP\s?43,200 received against .*QNB-2026-10-27-558211/);
  expect(writes.filter(w => w.path.endsWith("/payments"))).toHaveLength(0);
  await dialog.getByRole("button", { name: "Confirm payment received" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/deposit/deposits/dep1/payments").length).toBe(1);
  expect(writes.find(w => w.path.endsWith("/payments"))?.body).toMatchObject({ amountEgp: 43200 });
});

test("outside its moment the deposit is one line, with the refund behind a disclosure", async ({ page }) => {
  await setupFinanceDay(page);
  await page.goto("/ar/portal?case=letter");
  await page.locator("#case-heading").waitFor();
  await expect(page.locator("#deposit-payment")).toHaveCount(0);
  const refund = page.locator("summary", { hasText: "استرداد جزء من هذه الوديعة؟" });
  await expect(refund).toBeVisible();
  await expect(page.getByLabel("سبب الاسترداد")).toBeHidden();
});

test("commercial terms are approved after a question with the patient's total", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=approve");
  await page.locator("#case-heading").waitFor();
  await page.getByRole("button", { name: "Approve commercial terms" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Approve these terms at EGP\s?288,000\?/);
  await dialog.getByRole("button", { name: "Approve commercial terms" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/approve/proposals/v-approve/approve").length).toBe(1);
});
