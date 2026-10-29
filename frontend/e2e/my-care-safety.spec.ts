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
  const { writes } = await setupPatient(page, "deposit-checking", { guardian: "GUARDIAN_AUTH_MISSING" });
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
  await setupPatient(page, "deposit-checking", { guardian: "GUARDIAN_EVIDENCE_MISSING" });
  await page.goto("/ar/portal");
  await expect(page.getByRole("heading", { name: "نحتاج إلى المستند الذي يثبت أنك الوصي" })).toBeVisible();
  await expect(page.getByRole("button", { name: "استخدام هذا المستند" })).toBeVisible();
  await noSideScroll(page);
  await shot(page, "guardian-evidence-ar-390");
});

const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 synthetic") });

test("a guardian with no document on the case uploads one, sees it checked and attaches it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { writes } = await setupPatient(page, "deposit-checking", { guardian: "GUARDIAN_EVIDENCE_MISSING", documents: [] });
  await page.goto("/en/portal");
  const step = page.getByRole("region", { name: "We need the document that shows you are the guardian" });
  await expect(step.getByText(/No document on this case has passed the virus check yet/)).toBeVisible();
  await step.getByLabel("Choose a file").setInputFiles(pdf("guardianship.pdf"));
  await expect(step.getByText("guardianship.pdf passed the check and is selected.")).toBeVisible();
  await expect(step.getByRole("radio", { name: /guardianship\.pdf/ })).toBeChecked();
  await step.getByRole("checkbox", { name: /I confirm I am the patient's parent or legal guardian/ }).check();
  await shot(page, "guardian-upload-en-1440");
  await step.getByRole("button", { name: "Use this document" }).click();
  const caseWrites = () => writes.filter(w => w.path.startsWith("/patient/cases/case-1/") || w.path.startsWith("/local-uploads/"));
  await expect.poll(() => caseWrites().map(w => w.path)).toEqual(["/patient/cases/case-1/documents/presign", "/local-uploads/u1",
    "/patient/cases/case-1/documents/confirm", "/patient/cases/case-1/onboarding/consents", "/patient/cases/case-1/onboarding/guardian-evidence"]);
  expect(caseWrites()[0].body).toEqual({ originalFileName: "guardianship.pdf", contentType: "application/pdf", sizeBytes: 18 });
  expect(caseWrites()[1].body).toEqual({ bytes: 18 });
  expect(caseWrites()[4].body).toEqual({ documentId: "u1" });
});

test("in Arabic on a phone, a patient adds a document from the Documents tab and it is listed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-paid", { documents: [{ documentId: "d2", fileName: "scan.pdf", status: "PENDING", createdAt: "2026-09-02T09:00:00Z" }] });
  await page.goto("/ar/portal");
  await page.getByRole("link", { name: "المستندات" }).click();
  await expect(page.getByText("قيد الفحص")).toBeVisible();
  await page.getByLabel("اختر ملفًا").setInputFiles(pdf("lab-results.pdf"));
  await expect(page.getByText("اجتاز lab-results.pdf الفحص وأصبح ضمن مستنداتك.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "lab-results.pdf" })).toBeVisible();
  await noSideScroll(page);
  await shot(page, "documents-upload-ar-390");
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
  await expect(page.getByLabel("Your concerns").getByText("Received", { exact: true })).toBeVisible();
  expect(writes.find(w => w.path === "/patient/cases/case-1/concerns")?.body).toEqual({ type: "COMPLAINT", summary: "Nobody answered for three days." });
  await shot(page, "concern-listed-en-1440");
});

test("in Arabic on a phone, the concern form fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-paid", { concerns: [{ id: "c1", type: "ADVERSE_EVENT", status: "UNDER_REVIEW", raisedAt: "2026-10-12T09:00:00Z" }] });
  await page.goto("/ar/portal");
  await expect(page.getByText("قيد المراجعة", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "تقديم ملاحظة أو شكوى" }).click();
  await expect(page.getByRole("textbox", { name: "ماذا حدث؟" })).toBeVisible();
  await noSideScroll(page);
  await shot(page, "concern-form-ar-390");
});

test("Send my case asks the patient's age once, and it cannot be skipped", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/send-my-case");
  await expect(page.getByRole("radiogroup", { name: /عمرك/ })).toBeVisible();
  // A click before the form has hydrated does nothing (seen on the dev server): repeat it until the form answers.
  await expect(async () => {
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText("اختر الفئة العمرية.")).toBeVisible({ timeout: 1000 });
  }).toPass();
  await noSideScroll(page);
  await shot(page, "send-my-case-age-ar-390");
  await page.goto("/en/send-my-case");
  // The same hydration race as above, on the second page load.
  await expect(async () => {
    // The input is visually hidden inside its card; the visible label is what a person clicks.
    await page.getByText("I'm helping a family member or someone in my care").click();
    await expect(page.getByRole("radiogroup", { name: /The patient's age/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByText("12 to 17", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "12 to 17" })).toBeChecked();
  await shot(page, "send-my-case-age-en-390");
});
