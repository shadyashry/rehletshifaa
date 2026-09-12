import { expect, test } from "@playwright/test";

/** Layout guarantees and visual capture of the public Care Areas selection page, in both directions. */
const SHOTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900 },
];

for (const shot of SHOTS) {
  test(`care areas ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/en/care-areas");
    await page.waitForLoadState("networkidle");
    const bad = await page.evaluate(() => {
      const doc = document.documentElement;
      const offenders: string[] = [];
      document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) offenders.push(`${el.tagName}.${el.className}`.slice(0, 80));
      });
      return { scrolls: doc.scrollWidth > doc.clientWidth + 1, offenders: offenders.slice(0, 3) };
    });
    expect(bad.offenders).toEqual([]);
    expect(bad.scrolls).toBe(false);
    await page.screenshot({ path: `e2e/screenshots/care-areas-en-${shot.name}.png`, fullPage: true });
  });
}

for (const shot of SHOTS.filter((s) => ["390", "768", "1440"].includes(s.name))) {
  test(`care areas arabic ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/ar/care-areas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: `e2e/screenshots/care-areas-ar-${shot.name}.png`, fullPage: true });
  });
}

// Three areas of equal standing: one card family, one link each, actions on one baseline, and no
// specialty larger or darker than another. The hero and the closing panel stay within the agreed scale.
test("care areas are equal, aligned and on the agreed scale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/care-areas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Choose the care area/);
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>("main ul > li")];
    const box = (el: Element) => el.getBoundingClientRect();
    const px = (el: Element | null) => parseFloat(getComputedStyle(el!).fontSize);
    return {
      count: cards.length,
      widths: cards.map((c) => Math.round(box(c).width)),
      heights: cards.map((c) => Math.round(box(c).height)),
      backgrounds: [...new Set(cards.map((c) => getComputedStyle(c).backgroundColor))],
      canvas: getComputedStyle(cards[0].closest("section")!).backgroundColor,
      ctaTops: cards.map((c) => Math.round(box(c.querySelector("a")!).top)),
      titleTops: cards.map((c) => Math.round(box(c.querySelector("h2")!).top)),
      bodyTops: cards.map((c) => Math.round(box(c.querySelector("p")!).top)),
      h1: px(document.querySelector("h1")), title: px(cards[0].querySelector("h2")), body: px(cards[0].querySelector("p")), cta: px(cards[0].querySelector("a")),
      eyebrow: px(document.querySelector(".eyebrow")),
      links: cards.map((c) => c.querySelectorAll("a").length),
    };
  });
  expect(m.count).toBe(3);
  expect(new Set(m.widths).size).toBe(1);
  expect(new Set(m.heights).size).toBe(1);
  // Three near-white undertones (every channel ≥ 240), one per specialty — never a coloured card.
  expect(m.backgrounds).toHaveLength(3);
  for (const bg of m.backgrounds) for (const c of bg.match(/\d+/g)!.slice(0, 3).map(Number)) expect(c).toBeGreaterThanOrEqual(240);
  // …and every card is lighter than the pearl canvas it sits on (relative luminance), so the cards read as
  // near-white material on a warmer ground rather than tinted panels.
  const lum = (rgb: string) => rgb.match(/\d+/g)!.slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const bg of m.backgrounds) expect(lum(bg)).toBeGreaterThan(lum(m.canvas));
  expect(new Set(m.ctaTops).size).toBe(1);
  expect(new Set(m.titleTops).size).toBe(1);
  expect(new Set(m.bodyTops).size).toBe(1);
  expect(m.links).toEqual([1, 1, 1]);
  expect(m.h1).toBeGreaterThanOrEqual(46); expect(m.h1).toBeLessThanOrEqual(50);
  expect(m.title).toBeGreaterThanOrEqual(18); expect(m.title).toBeLessThanOrEqual(20);
  expect(m.body).toBeGreaterThanOrEqual(15); expect(m.body).toBeLessThanOrEqual(16.5);
  expect(m.cta).toBeGreaterThanOrEqual(15); expect(m.cta).toBeLessThanOrEqual(16);
  expect(m.eyebrow).toBeGreaterThanOrEqual(11); expect(m.eyebrow).toBeLessThanOrEqual(12);
  // One primary action on the page body (header aside) and a visible focus ring on a card link.
  expect(await page.locator("main a.btn-primary").count()).toBe(1);
  const link = page.locator("main ul > li a").first();
  await link.focus();
  const outline = await link.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle}|${s.outlineWidth}`; });
  expect(outline).not.toBe("none|0px");
});
