import { expect, test } from "@playwright/test";

/** Layout guarantees and visual capture of the public Consultants page, in both directions. */
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

async function noOverflow(page: import("@playwright/test").Page) {
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
}

for (const shot of SHOTS) {
  test(`consultants ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/en/consultants");
    await page.waitForLoadState("networkidle");
    await noOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/consultants-en-${shot.name}.png`, fullPage: true });
  });
}

for (const shot of SHOTS.filter((s) => ["390", "768", "1440"].includes(s.name))) {
  test(`consultants arabic ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/ar/consultants");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await noOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/consultants-ar-${shot.name}.png`, fullPage: true });
  });
}

// Trust, not a marketplace: three summary cards of one family, each with a named profile link on one
// baseline; no internal approval states, no ranking or booking signals; one closing action; the agreed scale.
test("consultants are presented for trust, not selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/consultants");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Meet the Consultants/);
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>("main article")];
    const box = (el: Element) => el.getBoundingClientRect();
    const px = (el: Element | null) => parseFloat(getComputedStyle(el!).fontSize);
    return {
      count: cards.length,
      heights: cards.map((c) => Math.round(box(c).height)),
      ctaTops: cards.map((c) => Math.round(box(c.querySelector("a")!).bottom)),
      links: cards.map((c) => c.querySelectorAll("a").length),
      labels: cards.map((c) => c.querySelector("a")!.getAttribute("aria-label")),
      names: cards.map((c) => c.querySelector("h2")!.textContent?.trim()),
      signals: cards.map((c) => c.querySelectorAll(":scope > div:last-of-type ul:not([data-expertise]) li").length),
      focus: cards.map((c) => [...c.querySelectorAll(".eyebrow")].some((e) => /clinical expertise/i.test(e.textContent ?? ""))),
      focusItems: cards.map((c) => (c.querySelector("[data-expertise]")?.textContent ?? "").split(",").length),
      h1: px(document.querySelector("h1")), name: px(cards[0].querySelector("h2")), role: px(cards[0].querySelector("h2 + p")),
      body: px(cards[0].querySelector(":scope > div:last-of-type > p")), eyebrow: px(cards[0].querySelector(".eyebrow")),
      text: document.querySelector("main")!.textContent ?? "",
      primaries: document.querySelectorAll("main a.btn-primary, main a.btn-inverse").length,
    };
  });
  expect(m.count).toBe(3);
  expect(new Set(m.heights).size).toBe(1);
  expect(new Set(m.ctaTops).size).toBe(1);
  expect(m.links).toEqual([1, 1, 1]);
  m.labels.forEach((label, i) => expect(label).toContain(m.names[i]!));
  m.signals.forEach((n) => { expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(3); });
  expect(m.focus).toEqual([true, true, true]);
  m.focusItems.forEach((n) => { expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(4); });
  expect(m.text).toMatch(/Verified professional role/);
  expect(m.text).not.toMatch(/\b(best|top|leading|world-class|renowned|elite|famous)\b/i);
  expect(m.text).not.toMatch(/pending approval|placeholder|to be verified/i);
  expect(m.text).not.toMatch(/\b(rating|reviews?|book now|price|select doctor|available now)\b/i);
  expect(m.text).toMatch(/don.t need to choose/i);
  expect(m.primaries).toBe(1);
  expect(m.h1).toBeGreaterThanOrEqual(44); expect(m.h1).toBeLessThanOrEqual(50);
  expect(m.name).toBeGreaterThanOrEqual(20); expect(m.name).toBeLessThanOrEqual(23);
  expect(m.role).toBeGreaterThanOrEqual(15); expect(m.role).toBeLessThanOrEqual(17);
  expect(m.body).toBeGreaterThanOrEqual(15); expect(m.body).toBeLessThanOrEqual(16.5);
  expect(m.eyebrow).toBeGreaterThanOrEqual(11); expect(m.eyebrow).toBeLessThanOrEqual(12);
  // Keyboard: the profile link shows a visible focus ring.
  const link = page.locator("main article a").first();
  await link.focus();
  const outline = await link.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle}|${s.outlineWidth}`; });
  expect(outline).not.toBe("none|0px");
});
