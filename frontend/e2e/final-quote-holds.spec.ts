import { expect, test } from "@playwright/test";

import { setupPatient } from "./patient-fixture";

/**
 * P1-10: a final quote's cooling period and Finance's exchange-rate check, as the signed-in patient meets them in My Care.
 * The server's refusals (409 COOLING_PERIOD / FX_REAPPROVAL_REQUIRED) are explained in the patient's own words in the
 * proposal, never as the page's error banner or "your decision was not sent". Synthetic fixtures only.
 */
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const SERVER_WORDING = "Server wording in English (must not reach the patient)";

async function openQuote(page: import("@playwright/test").Page) {
  await page.goto("/en/portal");
  await page.getByRole("button", { name: "Review final quote" }).click();
  return page.getByRole("dialog");
}

test("during the cooling period the quote says when it can be accepted and accept stays unavailable", async ({ page }) => {
  await setupPatient(page, "proposal-ready", { finalQuote: { scopeChangeReason: "The scan showed a second blocked artery.", acceptableFrom: inHours(10) } });
  const dialog = await openQuote(page);
  await expect(dialog.getByRole("heading", { name: "Why your plan changed" })).toBeVisible();
  await expect(dialog).toContainText("The scan showed a second blocked artery.");
  await expect(dialog.getByRole("status")).toContainText("you have time to decide");
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Accept final treatment plan and quote" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Request changes" })).toBeEnabled();
});

test("a refused acceptance (COOLING_PERIOD) is explained in the proposal, not as an error banner", async ({ page }) => {
  const { writes } = await setupPatient(page, "proposal-ready", { finalQuote: { decisionRefusal: { status: 409, code: "COOLING_PERIOD" } } });
  const dialog = await openQuote(page);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Accept final treatment plan and quote" }).click();
  await expect(dialog.getByRole("status")).toContainText("at least 24 hours to decide");
  expect(writes.some(w => w.path.endsWith("/proposals/v1/decision"))).toBe(true);
  await expect(page.getByText(SERVER_WORDING)).toHaveCount(0);
  await expect(dialog.getByText(/was not sent/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Accept final treatment plan and quote" })).toBeDisabled();
});

test("a refused acceptance (FX_REAPPROVAL_REQUIRED) says Finance is checking the rate and nothing is needed", async ({ page }) => {
  await setupPatient(page, "proposal-ready", { finalQuote: { decisionRefusal: { status: 409, code: "FX_REAPPROVAL_REQUIRED" } } });
  const dialog = await openQuote(page);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Accept final treatment plan and quote" }).click();
  await expect(dialog.getByRole("status")).toContainText("You do not need to do anything");
  await expect(page.getByText(SERVER_WORDING)).toHaveCount(0);
  await expect(dialog.getByText(/was not sent/)).toHaveCount(0);
});
