import { expect, test, type Page } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/**
 * A signed-in patient's next case, for themselves or for someone in their care (journey finding MC-1): the form asks who
 * it is for, only the person's name, country and the relationship when it is someone else, and reuses the account's own
 * saved contact details. The header never offers "Sign in" to someone already signed in. Synthetic fixtures only.
 */
const createBody = (writes: { path: string; body: unknown }[]) => writes.find(w => w.path === "/patient/cases")?.body as Record<string, unknown> | undefined;

async function consentAndSend(page: Page) {
  await page.getByText("I consent to RehletShifaa").click();
  await page.getByRole("button", { name: "Send my new case" }).click();
}

test("a signed-in patient sends a case for someone else: who, relationship, and their own saved contact", async ({ page }) => {
  const { writes } = await setupPatient(page, "deposit-arranging");
  await page.goto("/en/send-my-case");
  await expect(page.getByText("Signed in as")).toBeVisible();
  await page.getByText("Someone else", { exact: true }).click();
  await expect(page.getByText(/follow this case in My Care as their representative/)).toBeVisible();
  // No contact fields: the account's own saved details are used.
  await expect(page.getByLabel("Phone number")).toHaveCount(0);
  await page.getByLabel("Given name(s)").fill("Omar");
  await page.getByLabel(/^Family name \/ surname/).fill("Example");
  await page.getByRole("combobox", { name: /country of residence/i }).fill("Kenya");
  await page.getByRole("listbox").getByRole("option", { name: /Kenya/ }).click();
  await page.getByLabel("Your relationship to the patient").selectOption("PARENT");
  await page.screenshot({ path: "../docs/ux-redesign/screenshots/my-care/new-case-someone-else-en-1440.png", fullPage: true });
  await consentAndSend(page);
  await expect(page.getByText("RS-2026-000120")).toBeVisible();
  expect(createBody(writes)).toMatchObject({ caseFor: "SOMEONE_ELSE", consent: true,
    someoneElse: { givenName: "Omar", familyName: "Example", singleLegalName: false, country: "Kenya", relationship: "PARENT" } });
});

test("someone else without a name or relationship is not sent", async ({ page }) => {
  const { writes } = await setupPatient(page, "deposit-arranging");
  await page.goto("/en/send-my-case");
  await page.getByText("Someone else", { exact: true }).click();
  await consentAndSend(page);
  await expect(page.getByLabel("Your relationship to the patient")).toHaveAttribute("aria-invalid", "true");
  expect(createBody(writes)).toBeUndefined();
});

test("a limit on cases for others is explained, not a generic failure", async ({ page }) => {
  await setupPatient(page, "deposit-arranging", { newCaseRefusal: { status: 429, code: "TOO_MANY_CASES_FOR_OTHERS" } });
  await page.goto("/en/send-my-case");
  await page.getByText("Someone else", { exact: true }).click();
  await page.getByLabel("Given name(s)").fill("Omar");
  await page.getByLabel(/^Family name \/ surname/).fill("Example");
  await page.getByRole("combobox", { name: /country of residence/i }).fill("Kenya");
  await page.getByRole("listbox").getByRole("option", { name: /Kenya/ }).click();
  await page.getByLabel("Your relationship to the patient").selectOption("PARENT");
  await consentAndSend(page);
  await expect(page.getByRole("alert").filter({ hasText: "You have sent several cases for other people recently" })).toBeVisible();
});

test("the default is still the patient's own next case, with nothing about another person", async ({ page }) => {
  const { writes } = await setupPatient(page, "deposit-arranging");
  await page.goto("/en/send-my-case");
  await expect(page.getByLabel("Given name(s)")).toHaveCount(0);
  await consentAndSend(page);
  await expect(page.getByText("RS-2026-000120")).toBeVisible();
  expect(createBody(writes)).toMatchObject({ caseFor: "MYSELF", someoneElse: null });
});

test("in Arabic, the same choice reads right-to-left on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPatient(page, "deposit-arranging");
  await page.goto("/ar/send-my-case");
  await page.getByText("لشخص آخر", { exact: true }).click();
  await expect(page.getByText(/بصفتك ممثلًا عنه/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "../docs/ux-redesign/screenshots/my-care/new-case-someone-else-ar-390.png", fullPage: true });
});

test("signed in, the header leads back to My Care instead of offering Sign in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupPatient(page, "deposit-arranging");
  await page.goto("/en");
  const header = page.locator("header.site-header");
  await expect(header.getByRole("link", { name: "My Care" })).toHaveAttribute("href", "/en/portal");
  await expect(header.getByRole("button", { name: "My case" })).toHaveCount(0);
  await expect(header.getByText("For patients who already activated their account")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("summary[aria-label='Open menu']").click();
  await expect(page.getByRole("link", { name: "My Care" }).last()).toHaveAttribute("href", "/en/portal");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});
