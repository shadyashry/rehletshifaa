import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

import { openProposalView, PRELIMINARY_ESTIMATE, setupProposalLink } from "./proposal-fixture";
import { setupPatient } from "./patient-fixture";

/**
 * UX 1c-2 (patient visuals, the estimate): one range bar on the proposal link and on My Care's estimate card, drawn only
 * from fields the page receives — the totals (range only when min and max exist), the lines' categories (split only from
 * two), and the deposit (bracketed on the proposal link, where its amount is
 * known; My Care states it once, in its own facts). Synthetic fixtures only.
 */
const shots = (name: string) => path.join("../docs/ux-redesign/screenshots/1c-2", `${name}.png`);
/** The proposal link's lines: three medical services and the platform's disclosed fee line, summing to the expected total. */
const LINK = { ...PRELIMINARY_ESTIMATE, items: [
  { id: "i1", category: "MEDICAL", description: "Exercise stress test", quantity: 1, unitPrice: 150, optional: false },
  { id: "i2", category: "MEDICAL", description: "Transoesophageal echocardiography with contrast", quantity: 1, unitPrice: 1800, optional: false },
  { id: "i3", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 5450, optional: false },
  { id: "i4", category: "PLATFORM_FEE", description: "Coordination and guarantee fee", quantity: 1, unitPrice: 800, optional: false },
] };
/** My Care's workspace proposal with the totals 1c-0 added. */
const CARD = { totalMin: 4500, totalExpected: 4850, totalMax: 5600, items: [
  { id: "i1", category: "MEDICAL", description: "Dual chamber pacemaker implant", quantity: 1, unitPrice: 4250, optional: false },
  { id: "i2", category: "PLATFORM_FEE", description: "Coordination and guarantee fee", quantity: 1, unitPrice: 600, optional: false },
] };
// The sticky decision bar is fixed to the viewport; it is hidden from element shots so it never covers the price.
const shotOptions = { animations: "disabled" as const, style: ".fixed { visibility: hidden !important; }" };

async function openLink(page: Page, locale: "en" | "ar") {
  await setupProposalLink(page, LINK);
  await page.goto(`/${locale}/proposal/proposal-fixture-token`);
  await openProposalView(page);
  return page.locator("section[aria-labelledby=services-heading]");
}

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`estimate range bar: proposal link and My Care (${locale} ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const services = await openLink(page, locale);
      await expect(services.locator(".est-bar")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await services.screenshot({ path: shots(`proposal-link-${locale}-${width}`), ...shotOptions });

      await page.goto("about:blank");
      await setupPatient(page, "proposal-ready", { estimate: CARD });
      await page.goto(`/${locale}/portal`);
      const card = page.locator("section[aria-labelledby=proposal-title]");
      await expect(card.locator(".est-bar")).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await card.screenshot({ path: shots(`my-care-${locale}-${width}`), ...shotOptions });

      // Once the deposit exists My Care states it once, in its own facts: the bar does not bracket it again.
      await page.goto("about:blank");
      await setupPatient(page, "deposit-paid", { estimate: CARD });
      await page.goto(`/${locale}/portal`);
      await expect(card.locator(".est-bar")).toBeVisible();
      await expect(card.locator(".est-deposit")).toHaveCount(0);
      await card.screenshot({ path: shots(`my-care-deposit-paid-${locale}-${width}`), ...shotOptions });
    });
  }
}

test("the proposal link's bar is one sentence, the legend its readable twin, the fee line worded", async ({ page }) => {
  const services = await openLink(page, "en");
  await expect(services.getByRole("img")).toHaveAttribute("aria-label",
    "Estimated range $7,800 to $9,400, expected $8,200. Made up of Medical care $7,400 and Coordination and guarantee fee $800. Coordination deposit $1,230, paid first.");
  const legend = services.locator("dl.est-legend");
  await expect(legend).toContainText("Medical care$7,400");
  await expect(legend).toContainText("Estimated range$7,800 to $9,400");
  // The services list names the categories in words, never the backend's codes.
  await expect(services).not.toContainText("PLATFORM_FEE");
  await expect(services).not.toContainText("MEDICAL");
});

test("the fill grows from the start edge (mirrored in Arabic) and does not move under reduced motion", async ({ page }) => {
  const services = await openLink(page, "ar");
  const edges = await services.evaluate(node => {
    const track = node.querySelector(".est-track")!.getBoundingClientRect(), fill = node.querySelector(".est-fill")!;
    const box = fill.getBoundingClientRect();
    return { trackRight: track.right, fillRight: box.right, fillWidth: (fill as HTMLElement).offsetWidth, originX: parseFloat(getComputedStyle(fill).transformOrigin) };
  });
  // Right-to-left: the fill starts at the right edge and scales out from it.
  expect(Math.abs(edges.trackRight - edges.fillRight)).toBeLessThan(1);
  expect(Math.abs(edges.originX - edges.fillWidth)).toBeLessThan(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await openProposalView(page);
  await expect(page.locator(".est-fill")).toHaveCSS("animation-name", "none");
});

test("a long Egyptian-pound range fits the narrowest phone: the mark keeps its word, the legend keeps the figures", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await setupProposalLink(page, { ...LINK, currency: "EGP", fxRateDate: null, totalMin: 1234567, totalExpected: 1345678, totalMax: 1456789, depositDueDisplay: 201852,
    items: LINK.items.map(item => ({ ...item, unitPrice: item.category === "PLATFORM_FEE" ? 145678 : 400000 })) });
  await page.goto("/en/proposal/proposal-fixture-token");
  await openProposalView(page);
  const services = page.locator("section[aria-labelledby=services-heading]");
  await expect(services.locator(".est-bar")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(services.locator("dl.est-legend")).toContainText("1,456,789");
});
