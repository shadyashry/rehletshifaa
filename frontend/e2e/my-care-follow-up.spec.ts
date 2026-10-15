import { expect, test } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/** P1-18 session 2: follow-up, the outcome questions and the closing statement in My Care, against route mocks (no real patient). */
const view = {
  active: true, windowEndsAt: "2026-11-24T09:00:00Z", windowClosed: false, closed: false, openOutcome: null,
  contacts: [{ dueAt: "2026-11-01T09:00:00Z", mode: "VIDEO", status: "DONE" }, { dueAt: "2026-11-15T09:00:00Z", mode: "PHONE", status: "SCHEDULED" }],
  outcomes: [],
};
const asked = { ...view, openOutcome: "D30", outcomes: [{ point: "D30", requestedAt: "2026-11-24T09:00:00Z", open: true, reportedAt: null }] };
const answered = { ...view, openOutcome: null, outcomes: [{ point: "D30", requestedAt: "2026-11-24T09:00:00Z", open: false, reportedAt: "2026-11-25T09:00:00Z" }] };
// Odd figures on purpose: the statement is shown exactly as returned.
const closing = {
  id: "s2", kind: "CLOSURE", statementNumber: "RS-SC-RS-2026-000081-1", revision: 1, issuedAt: "2026-11-25T09:00:00Z", displayCurrency: "USD",
  totals: { packageEgp: 200000, changeOrdersEgp: 0, medicalChargedEgp: 200000, platformFeeEgp: 30000, totalChargedEgp: 230000, totalChargedDisplay: 4692.31, depositPaidEgp: 34500,
    feeBalancePaidEgp: 0, paidAtFacilityEgp: 195500, refundedEgp: 0, balanceDueEgp: 0, balanceDueDisplay: 0, creditDueEgp: 0, creditDueDisplay: 0 },
  lines: [{ kind: "PACKAGE", description: "Coronary stent package", amountEgp: 200000, amountDisplay: 4080.2 }],
};
const words = {
  en: { step: "How are you doing?", notice: "Before you answer", pain: "How much pain do you have now?", function: "How well can you manage your daily activities?",
    satisfaction: "How satisfied are you with your care?", wrong: "Has anything gone wrong since you left hospital?", no: "No", send: "Send my answers",
    missing: "Answer this question.", thanks: "Thank you. Your answers reached your care team.", followUp: "Your follow-up", route: "If something goes wrong",
    done: "Your care with us is complete", statement: "Your closing statement", review: "How was your journey?" },
  ar: { step: "كيف حالك؟", notice: "قبل أن تجيب", pain: "ما مقدار الألم الذي تشعر به الآن؟", function: "إلى أي حد تستطيع القيام بأنشطتك اليومية؟",
    satisfaction: "ما مدى رضاك عن رعايتك؟", wrong: "هل حدثت أي مشكلة منذ خروجك من المستشفى؟", no: "لا", send: "إرسال إجاباتي",
    missing: "أجب عن هذا السؤال.", thanks: "شكرًا لك. وصلت إجاباتك إلى فريق رعايتك.", followUp: "متابعتك", route: "إذا حدث ما يقلقك",
    done: "اكتملت رعايتك معنا", statement: "كشفك الختامي", review: "كيف كانت رحلتك؟" },
};

for (const locale of ["en", "ar"] as const) {
  const w = words[locale];
  for (const width of [390, 1440]) {
    test(`outcome questions: the notice first, every answer required, sent with the notice version (${locale} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const { writes } = await setupPatient(page, "deposit-paid", { followUp: { code: "REPORT_OUTCOME", view: structuredClone(asked), reported: answered } });
      await page.goto(`/${locale}/portal`);
      const step = page.locator(".my-care-step");
      await expect(step.getByRole("heading", { name: w.step })).toBeVisible();
      await expect(step.getByRole("heading", { name: w.notice })).toBeVisible();
      await step.getByRole("button", { name: w.send }).click();
      await expect(step.getByText(w.missing)).toHaveCount(4);
      for (const [legend, n] of [[w.pain, "2"], [w.function, "8"], [w.satisfaction, "10"]] as const) {
        await step.getByRole("group", { name: legend }).getByText(n, { exact: true }).click();
      }
      await step.getByRole("group", { name: w.wrong }).getByText(w.no, { exact: true }).click();
      // The scale's choices keep a 44px target and the page never scrolls sideways.
      const box = await step.getByRole("group", { name: w.pain }).locator("label").first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(step.locator(".btn-primary")).toHaveCount(1);
      await step.getByRole("button", { name: w.send }).click();
      await expect(step.getByText(w.thanks)).toBeVisible();
      await expect.poll(() => writes.find(x => x.path === "/patient/cases/case-1/follow-up/outcomes/D30")?.body)
        .toEqual({ pain: 2, function: 8, satisfaction: 10, complication: false, complicationNote: null, noticeVersion: "outcome-notice-2026-10" });
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    });
  }

  test(`follow-up: the next contact, the free follow-up's end and who to turn to, nothing to do (${locale})`, async ({ page }) => {
    await setupPatient(page, "deposit-paid", { followUp: { code: "FOLLOW_UP", view } });
    await page.goto(`/${locale}/portal`);
    const step = page.locator(".my-care-step");
    await expect(step.getByRole("heading", { name: w.followUp })).toBeVisible();
    await expect(step.getByRole("heading", { name: w.route })).toBeVisible();
    await expect(step.locator(".btn-primary")).toHaveCount(0);
  });

  test(`completed: the closing statement as returned and the review the team asked for (${locale})`, async ({ page }) => {
    await setupPatient(page, "deposit-paid", { followUp: { code: "COMPLETED", view: { ...view, closed: true, windowClosed: true }, statements: [closing] } });
    await page.goto(`/${locale}/portal`);
    const step = page.locator(".my-care-step");
    await expect(step.getByRole("heading", { name: w.done })).toBeVisible();
    await expect(step.getByRole("heading", { name: w.statement })).toBeVisible();
    await expect(step.getByText("RS-SC-RS-2026-000081-1")).toBeVisible();
    await expect(step.getByText(/230,000|٢٣٠٬٠٠٠/).first()).toBeVisible();
    await expect(step.getByRole("heading", { name: w.review })).toBeVisible();
    await expect(step.getByRole("heading", { name: w.route })).toHaveCount(0);
  });
}
