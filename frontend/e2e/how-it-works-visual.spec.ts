import { expect, test } from "@playwright/test";

/** Layout guarantees and visual capture of the public How It Works (care journey) page, in both directions. */
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
  test(`how it works ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/en/how-it-works");
    await page.waitForLoadState("networkidle");
    await noOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/how-it-works-en-${shot.name}.png`, fullPage: true });
  });
}

for (const shot of SHOTS.filter((s) => ["390", "768", "1440"].includes(s.name))) {
  test(`how it works arabic ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/ar/how-it-works");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await noOverflow(page);
    await page.screenshot({ path: `e2e/screenshots/how-it-works-ar-${shot.name}.png`, fullPage: true });
  });
}

// The complete journey: seven numbered stages in four phases, one closing action, no actions between stages,
// travel and appointment coordination explicit and conditional, and a desktop composition that puts a whole
// phase in one viewport.
test("the journey is complete, ordered, conditional and shorter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/how-it-works");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Your Care Journey/);
  const m = await page.evaluate(() => {
    const h3 = [...document.querySelectorAll("main ol > li > div > h3, main ol > li h3")].map((h) => h.textContent?.trim());
    const h2 = [...document.querySelectorAll("main h2")].map((h) => h.textContent?.trim());
    const order = [...document.querySelectorAll("main h1, main h2, main h3")].map((h) => Number(h.tagName[1]));
    const px = (sel: string) => parseFloat(getComputedStyle(document.querySelector(sel)!).fontSize);
    const stage = (n: number) => document.getElementById(`stage-${n}`)!.getBoundingClientRect();
    return {
      h3, h2, order, height: document.documentElement.scrollHeight,
      h1: px("h1"), stageTitle: px("#stage-1"), body: px("main ol > li p"),
      row1: [stage(1).top, stage(2).top, stage(3).top].map(Math.round),
      row2: [stage(4).top, stage(5).top].map(Math.round),
      phase1: Math.round(document.querySelector("main ol")!.getBoundingClientRect().bottom - document.getElementById("phase-1")!.getBoundingClientRect().top),
      buttons: document.querySelectorAll("main button").length,
      primaries: document.querySelectorAll("main a.btn-primary, main a.btn-inverse").length,
      text: document.querySelector("main")!.textContent ?? "",
    };
  });
  expect(m.h3).toEqual([
    "Send your case", "Coordinator review", "Consultant review", "Your recommendation & proposal",
    "You decide what happens next", "Appointment & travel coordination", "Treatment & follow-up",
  ]);
  expect(m.h2.slice(0, 4)).toEqual(["Understand your case", "Understand your options", "Prepare your care in Egypt", "Continue your care"]);
  expect(m.order[0]).toBe(1);
  m.order.slice(1).forEach((level, i) => expect(level - m.order[i]).toBeLessThanOrEqual(1));
  // Desktop composition: 01 ─ 02 ─ 03 on one row, 04 ─ 05 on the next.
  expect(new Set(m.row1).size).toBe(1);
  expect(new Set(m.row2).size).toBe(1);
  expect(m.h1).toBeGreaterThanOrEqual(46); expect(m.h1).toBeLessThanOrEqual(50);
  expect(m.stageTitle).toBeGreaterThanOrEqual(20); expect(m.stageTitle).toBeLessThanOrEqual(24);
  expect(m.body).toBeGreaterThanOrEqual(16); expect(m.body).toBeLessThanOrEqual(17);
  expect(m.buttons).toBe(0);
  expect(m.primaries).toBe(1);
  // Travel is visible, conditional, and never automatic.
  expect(m.text).toMatch(/Flights/); expect(m.text).toMatch(/Airport transfer/);
  expect(m.text).toMatch(/only if you choose to continue/i);
  expect(m.text).not.toMatch(/book your flight|automatically arranged|pay now/i);
  // Several stages share one desktop viewport: the whole first phase fits in 900px.
  expect(m.phase1).toBeLessThanOrEqual(900);
});

test("phone: one vertical path on the mobile scale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/how-it-works");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const m = await page.evaluate(() => {
    const tops = [1, 2, 3, 4, 5, 6, 7].map((n) => Math.round(document.getElementById(`stage-${n}`)!.getBoundingClientRect().top));
    const lefts = [1, 2, 3, 4, 5, 6, 7].map((n) => Math.round(document.getElementById(`stage-${n}`)!.getBoundingClientRect().left));
    return { tops, lefts, height: document.documentElement.scrollHeight, h1: parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize) };
  });
  m.tops.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(m.tops[i]));
  expect(new Set(m.lefts).size).toBe(1);
  expect(m.h1).toBeGreaterThanOrEqual(30); expect(m.h1).toBeLessThanOrEqual(34);
});
