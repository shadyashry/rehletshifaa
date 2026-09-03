import { expect, test } from "@playwright/test";

// Drives the secure proposal link: link summary -> send OTP -> verify -> view sensitive
// detail -> accept. The backend is mocked so the test is hermetic.
const TOKEN = "abc123token";
const BASE = "http://localhost:8080/api/v1/public/proposals";

test("patient verifies with OTP before seeing pricing, then accepts", async ({ page }) => {
  const summary = { caseNumber: "RS-2026-000123", channel: "WHATSAPP", destinationHint: "***1234" };
  await page.route(`${BASE}/${TOKEN}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/request-access`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) }));
  await page.route(`${BASE}/${TOKEN}/verify`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ grant: "grant-1", expiresAt: new Date(Date.now() + 1800000).toISOString(), versionId: "v1" }) }));
  await page.route(`${BASE}/${TOKEN}/view`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ caseId: "c1", caseNumber: "RS-2026-000123", patientName: "Jane Doe", currency: "USD", items: [{ id: "i1", category: "MEDICAL", description: "Treatment package", quantity: 1, unitPrice: 1000, optional: false }], validUntil: new Date(Date.now() + 86400000).toISOString(), decided: false, recommendedTreatment: "Recommended intervention", risksAndLimitations: "Standard risks" }) }));
  let decided = "";
  await page.route(`${BASE}/${TOKEN}/decision`, async (route) => { decided = JSON.parse(route.request().postData() ?? "{}").decision; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "v1", status: "ACCEPTED" }) }); });

  await page.goto(`/en/proposal/${TOKEN}`);

  // Verification gate first — no pricing or clinical detail is shown yet.
  await expect(page.getByRole("heading", { name: "Verify it's you" })).toBeVisible();
  await expect(page.getByText("Recommended intervention")).toHaveCount(0);

  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Enter the 6-digit code").fill("123456");
  await page.getByRole("button", { name: "Verify" }).click();

  // Now the sensitive proposal is visible.
  await expect(page.getByRole("heading", { name: "Your treatment proposal" })).toBeVisible();
  await expect(page.getByText("Recommended intervention")).toBeVisible();

  await page.getByRole("button", { name: "Accept proposal" }).click();
  await expect(page.getByRole("heading", { name: "you accepted your proposal" })).toBeVisible();
  expect(decided).toBe("ACCEPTED");
});
