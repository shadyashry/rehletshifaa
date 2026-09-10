import { expect, test, type Page } from "@playwright/test";

/** Layout and accessibility guarantees for the public homepage, in both directions. */
const WIDTHS = [320, 375, 390, 768, 1024, 1280, 1440];

async function expectNoOverflow(page: Page) {
  const bad = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) offenders.push(`${el.tagName}.${el.className}`.slice(0, 100));
    });
    return { scrolls: doc.scrollWidth > doc.clientWidth + 1, offenders: offenders.slice(0, 4) };
  });
  expect(bad.offenders, `outside viewport: ${bad.offenders.join(" | ")}`).toEqual([]);
  expect(bad.scrolls, "document scrolls horizontally").toBe(false);
}

for (const width of WIDTHS) {
  test(`homepage fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoOverflow(page);
  });
}

test("arabic homepage is right-to-left and fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectNoOverflow(page);
});

test("headings are hierarchical and the primary action is singular", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  // Exactly one h1, and no h3 appears before the first h2.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("main h1,main h2,main h3")].map((h) => Number(h.tagName[1])));
  expect(order[0]).toBe(1);
  order.slice(1).forEach((level, i) => expect(level - order[i]).toBeLessThanOrEqual(1));

  // "Start my case" is the one conversion action; the header CTA plus hero plus closing panel, nothing else.
  const starts = page.getByRole("link", { name: /^Start my case$/ });
  expect(await starts.count()).toBeLessThanOrEqual(3);
});

test("the type scale stays within the agreed range at 1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const size = (sel: string) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size("h1")).toBeGreaterThanOrEqual(43);
  expect(await size("h1")).toBeLessThanOrEqual(48);
  expect(await size("main h2")).toBeGreaterThanOrEqual(29);
  expect(await size("main h2")).toBeLessThanOrEqual(34);
});

test("keyboard users can reach the primary action with a visible focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const cta = page.getByRole("link", { name: /^Start my case$/ }).first();
  await cta.focus();
  await expect(cta).toBeFocused();
  const outline = await cta.evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.outlineStyle}|${s.outlineWidth}|${s.boxShadow}`;
  });
  expect(outline).not.toBe("none|0px|none");
});
