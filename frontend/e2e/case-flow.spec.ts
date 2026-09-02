import { expect, test } from "@playwright/test";

test("patient can submit the minimal case and see a case number", async ({ page }) => {
  const caseId = "21f5f13b-621e-4dd0-a759-8e8a8f06ac71";
  await page.route("http://localhost:8080/api/v1/cases", route => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ caseId, caseNumber: "RS-2026-000001", status: "DRAFT" }) }));
  await page.route(`http://localhost:8080/api/v1/cases/${caseId}/submit`, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ caseNumber: "RS-2026-000001", status: "NEW" }) }));
  await page.goto("/en");
  await page.getByRole("link", { name: "Send My Case" }).first().click();
  const whatsappLinks = page.locator('a[href^="https://wa.me/"]');
  expect(await whatsappLinks.count()).toBeGreaterThan(0);
  for (const link of await whatsappLinks.all()) {
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/201010447898(?:\?|$)/);
  }
  await page.getByLabel("Full Name").fill("Jane Doe");
  await page.getByLabel("Country").fill("Kenya");
  await page.getByLabel("WhatsApp Number").fill("+254700000000");
  await page.getByText("I consent to RehletShifaa").click();
  await page.getByRole("button", { name: "Send My Case" }).click();
  await expect(page.getByRole("heading", { name: "Your Case Has Been Received" })).toBeVisible();
  await expect(page.getByText("RS-2026-000001")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/201010447898\?text=/);
});
