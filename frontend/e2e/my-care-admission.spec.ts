import { expect, test } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/** P1-15 session 2: arrival, the voucher and the hospital balance in My Care, against route mocks (no real money, no real patient). */
const view = { facilityName: "Nile Heart Hospital", facilityCity: "Cairo", plannedAdmissionAt: "2026-10-20T08:00:00Z", voucherNumber: "RS-V-RS-2026-000081-1",
  payAtFacilityEgp: 195432.1, payAtFacilityDisplay: 3987.65, feeBalanceEgp: 0, feeBalanceDisplay: 0, depositCreditEgp: 4500, displayCurrency: "USD", balanceState: "DUE", cleared: false };

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`pay the balance at the hospital: voucher and amounts, no page scroll (${locale} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setupPatient(page, "deposit-paid", { admission: { code: "PAY_BALANCE", view } });
      await page.goto(`/${locale}/portal`);
      const step = page.locator(".my-care-step");
      await expect(step.getByText("RS-V-RS-2026-000081-1")).toBeVisible();
      await expect(step.getByText(/195,432\.10|١٩٥٬٤٣٢٫١٠/)).toBeVisible();
      await expect(step.locator(".btn-primary")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

test("confirm arrival: one action, confirmed, then sent", async ({ page }) => {
  const { writes } = await setupPatient(page, "deposit-paid", { admission: { code: "CONFIRM_ARRIVAL", view: { ...view, voucherNumber: null, balanceState: "NO_VOUCHER" } } });
  await page.goto("/en/portal");
  await expect(page.getByRole("heading", { name: "Tell us when you have arrived" })).toBeVisible();
  await page.getByRole("button", { name: "I have arrived" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes, I have arrived" }).click();
  await expect.poll(() => writes.some(w => w.path === "/patient/cases/case-1/arrived")).toBe(true);
});

test("cleared for admission says when, in Arabic", async ({ page }) => {
  await setupPatient(page, "deposit-paid", { admission: { code: "CLEARED_FOR_ADMISSION", view: { ...view, balanceState: "PAID", cleared: true } } });
  await page.goto("/ar/portal");
  await expect(page.getByRole("heading", { name: "اعتُمد دخولك إلى المستشفى" })).toBeVisible();
  await expect(page.getByText(/اعتُمد دخولك إلى المستشفى في/)).toBeVisible();
});
