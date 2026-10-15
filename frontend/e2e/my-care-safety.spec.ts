import { expect, test, type Page } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/**
 * P1-13 (A-05, A-06) on My Care and Send my case: the age band asked once, a guardian confirming they act for a minor (basis,
 * a scanned document of the case, the guardian consent), and "Raise a concern" as one quiet line. Synthetic fixtures only.
 * Screenshots go to test-results (not tracked).
 */
const noSideScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/p1-13/${name}.png`, fullPage: true });

test("a guardian confirms they act for the patient: consent in its own words, then basis and document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await setupPatient(page, "deposit-arranging", { guardian: "GUARDIAN_AUTH_MISSING" });
  await page.goto("/en/portal");
  const step = page.getByRole("region", { name: "Confirm you act for the patient" });
  await expect(step).toBeVisible();
  await step.getByRole("radio", { name: "Parent" }).check();
  await step.getByRole("radio", { name: /Echo_Report\.pdf/ }).check();
  await step.getByRole("checkbox", { name: /I confirm I am the patient's parent or legal guardian/ }).check();
  await shot(page, "guardian-step-en-1440");
  await step.getByRole("button", { name: "Confirm" }).click();
  const onboardingWrites = () => writes.filter(w => w.path.includes("/onboarding/"));
  await expect.poll(() => onboardingWrites().map(w => w.path)).toEqual(["/patient/cases/case-1/onboarding/consents", "/patient/cases/case-1/onboarding/subject"]);
  expect(onboardingWrites()[1].body).toMatchObject({ subjectType: "GUARDIAN", relationship: "PARENT", legalBasis: "PARENT", evidenceDocumentId: "d1", expectedVersion: 2 });
});

test("in Arabic on a phone, the guardian step reads right-to-left without side scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-arranging", { guardian: "GUARDIAN_EVIDENCE_MISSING" });
  await page.goto("/ar/portal");
  await expect(page.getByRole("heading", { name: "نحتاج إلى المستند الذي يثبت أنك الوصي" })).toBeVisible();
  await expect(page.getByRole("button", { name: "استخدام هذا المستند" })).toBeVisible();
  await noSideScroll(page);
  await shot(page, "guardian-evidence-ar-390");
});

test("Raise a concern is one quiet line that opens a short form, and the concern then shows its status", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await setupPatient(page, "deposit-paid");
  await page.goto("/en/portal");
  const action = page.getByRole("button", { name: "Raise a concern" });
  await expect(action).toBeVisible();
  await expect(action).not.toHaveClass(/btn-primary|btn-secondary/);
  await action.click();
  await page.getByRole("radio", { name: "A complaint about our service" }).check();
  await page.getByRole("textbox", { name: "What happened?" }).fill("Nobody answered for three days.");
  await shot(page, "concern-form-en-1440");
  await page.getByRole("button", { name: "Send concern" }).click();
  await expect(page.getByRole("heading", { name: "Your concerns" })).toBeVisible();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  expect(writes.find(w => w.path === "/patient/cases/case-1/concerns")?.body).toEqual({ type: "COMPLAINT", summary: "Nobody answered for three days." });
  await shot(page, "concern-listed-en-1440");
});

test("in Arabic on a phone, the concern form fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-paid", { concerns: [{ id: "c1", type: "ADVERSE_EVENT", status: "UNDER_REVIEW", raisedAt: "2026-10-12T09:00:00Z" }] });
  await page.goto("/ar/portal");
  await expect(page.getByText("قيد المراجعة")).toBeVisible();
  await page.getByRole("button", { name: "تقديم ملاحظة أو شكوى" }).click();
  await expect(page.getByRole("textbox", { name: "ماذا حدث؟" })).toBeVisible();
  await noSideScroll(page);
  await shot(page, "concern-form-ar-390");
});

test("Send my case asks the patient's age once, and it cannot be skipped", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/send-my-case");
  await expect(page.getByRole("group", { name: /عمرك/ })).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByText("اختر الفئة العمرية.")).toBeVisible();
  await noSideScroll(page);
  await shot(page, "send-my-case-age-ar-390");
  await page.goto("/en/send-my-case");
  await page.getByRole("radio", { name: /someone else/i }).check({ force: true });
  await expect(page.getByRole("group", { name: /The patient's age/ })).toBeVisible();
  await page.getByText("12 to 17", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "12 to 17" })).toBeChecked();
  await shot(page, "send-my-case-age-en-390");
});
