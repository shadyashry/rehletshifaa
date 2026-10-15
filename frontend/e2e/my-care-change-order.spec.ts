import { expect, test } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/** P1-16 session 2: a change order above the band, decided by the patient in My Care, against route mocks (no real money, no real patient). */
const order = { id: "o2", orderNumber: "RS-CO-RS-2026-000081-2", status: "AWAITING_PATIENT", emergency: false, reason: "One more night of observation in intensive care.",
  lines: [{ kind: "EXTRA_NIGHT", description: "Extra ICU night", quantity: 2, lineEgp: 24691, lineDisplay: 503.71 }], totalEgp: 24691.4, totalDisplay: 503.72,
  displayCurrency: "USD", awaitingDecision: true };
const view = { facilityName: "Nile Heart Hospital", facilityCity: "Cairo", awaitingDecisionId: "o2", changeOrders: [order],
  timeline: [{ kind: "ADMITTED", occurredAt: "2026-10-20T08:00:00Z", reportedBy: "CONSULTANT" }, { kind: "WARD", occurredAt: "2026-10-21T10:00:00Z", reportedBy: "CARE_TEAM" }] };
const decided = { ...view, awaitingDecisionId: null, changeOrders: [{ ...order, status: "ACCEPTED", awaitingDecision: false, decidedAt: "2026-10-21T13:00:00Z" }] };
const words = {
  en: { accept: "Accept the change", confirm: "Yes, accept", accepted: "Accepted" },
  ar: { accept: "اقبل التغيير", confirm: "نعم، أقبل", accepted: "مقبول" },
};

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`change order: reason, lines and cost as returned, one action, accepted after a confirmation (${locale} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const { writes } = await setupPatient(page, "deposit-paid", { treatment: { code: "REVIEW_CHANGE_ORDER", view: structuredClone(view), decided } });
      await page.goto(`/${locale}/portal`);
      const step = page.locator(".my-care-step");
      await expect(step.getByText("One more night of observation in intensive care.")).toBeVisible();
      await expect(step.getByText("RS-CO-RS-2026-000081-2")).toBeVisible();
      await expect(step.getByText(/24,691\.40|٢٤٬٦٩١٫٤٠/)).toBeVisible();
      await expect(step.getByText(/503\.72|٥٠٣٫٧٢/)).toBeVisible();
      await expect(step.locator(".btn-primary")).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await step.getByRole("button", { name: words[locale].accept }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: words[locale].confirm }).click();
      await expect.poll(() => writes.find(w => w.path === "/patient/cases/case-1/change-orders/o2/decision")?.body).toEqual({ decision: "ACCEPT", note: null });
      await expect(step.getByText(words[locale].accepted, { exact: true })).toBeVisible();
    });
  }
}
