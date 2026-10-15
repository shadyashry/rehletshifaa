import { expect, test } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/** P1-17 session 2: going home and the statement in My Care, against route mocks (no real money, no real patient). */
const view = {
  discharged: true,
  documents: [{ kind: "DISCHARGE_SUMMARY", documentId: "d1", recordedAt: "2026-10-24T09:00:00Z" }],
  medications: [{ name: "Aspirin", dose: "75 mg", frequency: "Once a day", duration: "Lifelong" }],
  warningSigns: "Chest pain, breathlessness or bleeding from the wound.",
  followUpDueAt: "2026-11-25T09:00:00Z", followUpMode: "VIDEO", returnMode: "FLIGHT", returnDepartureAt: "2026-10-27T09:00:00Z", departed: false,
  handoverLetter: { evidenceId: "h1", generatedAt: "2026-10-25T11:00:00Z", english: "Dear colleague,\nYour patient was treated for coronary artery disease.", arabic: "الزميل العزيز،\nعولج مريضكم." },
};
// Odd figures on purpose: the statement is shown exactly as returned.
const statement = {
  id: "s1", kind: "DISCHARGE", statementNumber: "RS-ST-RS-2026-000081-1", revision: 1, issuedAt: "2026-10-26T09:00:00Z", displayCurrency: "USD",
  totals: { packageEgp: 200000, changeOrdersEgp: 24691, medicalChargedEgp: 224691, platformFeeEgp: 33703.65, totalChargedEgp: 258394.65, totalChargedDisplay: 5271.25, depositPaidEgp: 38759.2,
    feeBalancePaidEgp: 0, paidAtFacilityEgp: 224000, refundedEgp: 0, balanceDueEgp: 0, balanceDueDisplay: 0, creditDueEgp: 4364.55, creditDueDisplay: 89.04 },
  lines: [{ kind: "PACKAGE", description: "Coronary stent package", amountEgp: 200000, amountDisplay: 4080 }, { kind: "PLATFORM_FEE", amountEgp: 33703.65, amountDisplay: 687.55 },
    { kind: "DEPOSIT_PAID", amountEgp: -38759.2, amountDisplay: -790.69 }, { kind: "PAID_AT_FACILITY", amountEgp: -224000, amountDisplay: -4569.6 }],
};
const words = {
  en: { warning: "Get medical help at once if", medicines: "Your medicines", credit: "Credit due", pending: /Your statement is ready once/ },
  ar: { warning: "اطلب المساعدة الطبية فورًا إذا", medicines: "أدويتك", credit: "رصيد مستحق للمريض", pending: /يصبح كشف حسابك جاهزًا/ },
};

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`follow-up: warning signs, medicines and the statement as returned, nothing to do (${locale} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await setupPatient(page, "deposit-paid", { discharge: { code: "FOLLOW_UP", view, statements: [statement] } });
      await page.goto(`/${locale}/portal`);
      const step = page.locator(".my-care-step");
      await expect(step.getByRole("heading", { name: words[locale].warning })).toBeVisible();
      await expect(step.getByText("Chest pain, breathlessness or bleeding from the wound.")).toBeVisible();
      await expect(step.getByRole("heading", { name: words[locale].medicines })).toBeVisible();
      await expect(step.getByText("Aspirin")).toBeVisible();
      await expect(step.getByText("RS-ST-RS-2026-000081-1")).toBeVisible();
      await expect(step.getByText(/258,394\.65|٢٥٨٬٣٩٤٫٦٥/)).toBeVisible();
      await expect(step.getByText(words[locale].credit)).toBeVisible();
      await expect(step.getByText(/89\.04|٨٩٫٠٤/).last()).toBeVisible();
      await expect(step.locator(".btn-primary")).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test(`going home before the statement: the step says when it comes (${locale})`, async ({ page }) => {
    await setupPatient(page, "deposit-paid", { discharge: { code: "GOING_HOME", view, statements: [] } });
    await page.goto(`/${locale}/portal`);
    const step = page.locator(".my-care-step");
    await expect(step.getByText(words[locale].pending)).toBeVisible();
    await expect(step.getByText("Aspirin")).toBeVisible();
  });
}
