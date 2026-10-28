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
  await expect(dialog).toContainText(/Record .?EGP\s?43,200.? received against .*QNB-2026-10-27-558211/);
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
  await expect(dialog).toContainText(/Approve these terms at .?EGP\s?288,000.?\?/);
  await dialog.getByRole("button", { name: "Approve commercial terms" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/approve/proposals/v-approve/approve").length).toBe(1);
});

// UX 4-1: the admission money.
test("the letter states its gap and is accepted only after a question with the price", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=letter");
  const panel = page.locator("#admission-panel");
  await expect(panel).toContainText(/EGP\s?22,500.* above the estimate's maximum \(.*9\.4%.*\)/);
  await panel.getByLabel("Reason", { exact: true }).fill("The hospital added an ICU night");
  await panel.getByRole("button", { name: "Accept the letter" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Accept the letter at .*EGP\s?262,500/);
  expect(writes.filter(w => w.path.endsWith("/letter/decision"))).toHaveLength(0);
  await dialog.getByRole("button", { name: "Accept the letter" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/letter/admission/letter/decision").length).toBe(1);
  expect(writes.find(w => w.path.endsWith("/letter/decision"))?.body).toMatchObject({ decision: "ACCEPT", note: "The hospital added an ICU night" });
});

test("in Arabic the letter's gap is said in words and refusing is the second verb", async ({ page }) => {
  await setupFinanceDay(page);
  await page.goto("/ar/portal?case=letter");
  const panel = page.locator("#admission-panel");
  await expect(panel).toContainText("أعلى من الحد الأقصى للتقدير المقبول");
  await expect(panel.getByRole("button", { name: "ارفض الخطاب" })).toBeHidden();
  await panel.locator("summary", { hasText: "لا يمكنك قبول هذا الخطاب؟" }).click();
  await expect(panel.getByRole("button", { name: "ارفض الخطاب" })).toBeVisible();
  // The backend's blocker codes read as words, never as lower-cased codes.
  await expect(panel).not.toContainText(/[a-z]+ [a-z]+ [a-z]+ open|not issued/);
});

test("the receipt reads against the voucher, and the fee balance is derived and asked about", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=receipt");
  await expect(page.locator("#admission-panel")).toContainText("Matches what is owed at the cashier");
  await page.goto("/en/portal?case=fee");
  const panel = page.locator("#admission-panel");
  await expect(panel).toContainText(/Platform fee .*EGP\s?55,700.* − deposit applied to the fee .*EGP\s?43,200.* = .*EGP\s?12,500/);
  await panel.getByLabel("Payment reference").fill("CIB-TRF-88120");
  await panel.getByLabel("Received at").fill("2026-10-27T11:00");
  await panel.getByRole("button", { name: "Record the fee balance" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Record .*EGP\s?12,500.* received against .*CIB-TRF-88120/);
  await dialog.getByRole("button", { name: "Record the fee balance" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/fee/admission/fee-balance").length).toBe(1);
});
