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

// UX 4-2: the treatment and the settlement.
test("a change order is priced after a question with its total and where it falls against the band", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=change");
  const panel = page.locator("#treatment-panel");
  await panel.getByLabel(/Unit price \(EGP\) for .*Drug-eluting stent/).fill("38,500");
  await panel.getByLabel(/Unit price \(EGP\) for .*Extra ICU night/).fill("12345");
  await expect(panel).toContainText(/Priced so far: .*EGP\s?63,190.* · left in the band: .*EGP\s?15,000/);
  await panel.getByRole("button", { name: "Save prices" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Price .*RS-CO-RS-2026-000046-1.* at .*EGP\s?63,190.*, .*EGP\s?48,190.* above the band\?/);
  await expect(dialog).toContainText("the patient decides");
  expect(writes.filter(w => w.path.endsWith("/price"))).toHaveLength(0);
  await dialog.getByRole("button", { name: "Save prices" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/change/change-orders/o1/price").length).toBe(1);
  expect(writes.find(w => w.path.endsWith("/price"))?.body).toMatchObject({ lines: [{ lineId: "l1", unitEgp: 38500 }, { lineId: "l2", unitEgp: 12345 }] });
});

test("the reconciliation names the hospital and its city, states the verdict and submits the lines after a question", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=reconcile");
  const panel = page.locator("#reconciliation-panel");
  await expect(panel).toContainText(/Nile Heart Hospital.* · .*Cairo/);
  await expect(panel).toContainText(/The invoice is .*EGP\s?22,660.* above what was authorised: .*EGP\s?7,660.* above the band of .*EGP\s?15,000/);
  await panel.getByLabel("Description on the invoice").fill("Coronary bypass package, all in");
  await panel.getByLabel("Amount (EGP)", { exact: true }).fill("247,350");
  await panel.getByLabel("Authorised by").selectOption("PACKAGE");
  await panel.getByLabel("Paid at the hospital (EGP)").fill("186,800");
  await panel.getByRole("button", { name: "Submit the reconciliation" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Submit lines totalling .*EGP\s?247,350.* against the invoice's .*EGP\s?247,350.*\?/);
  await expect(dialog).toContainText(/Paid at the hospital: .*EGP\s?186,800/);
  await dialog.getByRole("button", { name: "Submit the reconciliation" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/reconcile/reconciliation/submit").length).toBe(1);
  expect(writes.find(w => w.path.endsWith("/submit"))?.body).toMatchObject({ lines: [{ invoiceEgp: 247350, source: "PACKAGE" }], paidAtFacilityEgp: 186800 });
});

test("on a phone in Arabic the Manager reads the verdict, then two equal acts, then the ledger as stacked rows", async ({ page }) => {
  await setupFinanceDay(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/portal?case=variance");
  const panel = page.locator("#reconciliation-panel");
  const verdict = panel.getByText(/فوق حد النطاق البالغ/);
  await expect(verdict).toBeVisible();
  const approve = panel.getByRole("button", { name: "اعتماد الفرق" });
  const giveBack = panel.getByRole("button", { name: "إعادة إلى الفريق المالي" });
  await expect(approve).toHaveClass(/btn-primary/);
  await expect(giveBack).toHaveClass(/btn-secondary/);
  const [v, a] = await Promise.all([verdict.boundingBox(), approve.boundingBox()]);
  expect(v!.y).toBeLessThan(a!.y);
  // The ledger: stacked rows on a phone, the table hidden; nothing scrolls the page sideways.
  await expect(panel.locator("table")).toBeHidden();
  await expect(panel.getByRole("list", { name: "فاتورة المستشفى" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a statement's totals read gross and net, and its e-invoice is recorded after a question", async ({ page }) => {
  const { writes } = await setupFinanceDay(page);
  await page.goto("/en/portal?case=statement");
  const panel = page.locator("#reconciliation-panel");
  await expect(panel).toContainText("Total charged (gross, before payments)");
  await expect(panel).toContainText("Balance due (net of payments)");
  await panel.locator("summary", { hasText: "Record the e-invoice reference" }).click();
  await panel.getByLabel("E-invoice reference").fill("ETA-2026-55190");
  await panel.getByRole("button", { name: "Record the reference" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(/Record e-invoice .*ETA-2026-55190.* on statement .*RS-ST-statement-1.*\?/);
  await dialog.getByRole("button", { name: "Record the reference" }).click();
  await expect.poll(() => writes.filter(w => w.path === "/finance/cases/statement/statements/s1/e-invoice").length).toBe(1);
});
