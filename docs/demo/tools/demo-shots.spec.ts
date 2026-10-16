import { expect, test, type Page } from "@playwright/test";
import { setupConsultantDay } from "./consultant-fixture";
import { setupCoordinatorDay } from "./coordinator-fixture";
import { setupPatient } from "./patient-fixture";
import { PROPOSAL_TOKEN, setupProposalLink } from "./proposal-fixture";
import { setupStatusLink, STATUS_TOKEN } from "./status-fixture";

const out = (n: string) => `../.demo-shots/${n}.png`;
const settle = async (p: Page) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(900); };
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240000);

test("public", async ({ page }) => {
  await page.goto("/en"); await settle(page); await page.screenshot({ path: out("home"), fullPage: true });
  await page.goto("/en/send-my-case"); await settle(page); await page.screenshot({ path: out("intake"), fullPage: true });
});
test("status", async ({ page }) => {
  await setupStatusLink(page, { phase: "coordinator", actionRequired: false, expectedWorkingDays: 1, milestones: { receivedAt: "2026-03-02T09:00:00Z", consultantReviewAt: null, estimateReadyAt: null }, action: null });
  await page.goto(`/en/status/${STATUS_TOKEN}`); await settle(page);
  await page.locator("main button.btn-primary").click();
  await page.locator("input[name=one-time-code]").fill("123456");
  await page.locator("main form button.btn-primary").click();
  await expect(page.locator("#status-now")).toBeVisible(); await settle(page);
  await page.screenshot({ path: out("received"), fullPage: true });
});
test("verify", async ({ page }) => {
  await setupProposalLink(page);
  await page.goto(`/en/proposal/${PROPOSAL_TOKEN}`); await settle(page);
  await page.locator("main button.btn-primary").click();
  await expect(page.locator("input[name=one-time-code]")).toBeVisible(); await settle(page);
  await page.screenshot({ path: out("verify"), fullPage: true });
});
test("coordinator", async ({ page }) => {
  await setupCoordinatorDay(page);
  await page.goto("/en/portal?view=work"); await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); await settle(page);
  await page.screenshot({ path: out("my-work"), fullPage: true });
  await page.goto("/en/portal?case=owned"); await page.locator("#case-heading").waitFor(); await settle(page);
  await page.screenshot({ path: out("case-prepare"), fullPage: true });
});
test("consultant", async ({ page }) => {
  await setupConsultantDay(page);
  for (const [id, clinical] of [["review", true], ["treat", false], ["follow", false]] as const) {
    await page.goto(`/en/portal?case=${id}`); await page.locator("#case-heading").waitFor(); await settle(page);
    if (clinical) { const t = page.getByRole("tab", { name: /^Clinical/ }); if (await t.count()) { await t.first().click(); await settle(page); } }
    await page.screenshot({ path: out("case-" + id), fullPage: true });
  }
});
for (const sc of ["proposal-ready", "pay-deposit", "deposit-checking", "deposit-paid"] as const) {
  test("patient " + sc, async ({ page }) => {
    await setupPatient(page, sc);
    await page.goto("/en/portal"); await expect(page.locator("#current-step-title")).toBeVisible(); await settle(page);
    await page.screenshot({ path: out("patient-" + sc), fullPage: true });
  });
}
