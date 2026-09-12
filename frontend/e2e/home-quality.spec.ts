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

// The phone is composed on its own terms, not the desktop scale shrunk: a quiet header, a mobile type
// scale, and a How-It-Works that fits one screen as a connected, numbered journey with its own action.
test("the phone composition is deliberate: header, scale, and a connected journey in one screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const m = await page.evaluate(() => {
    const px = (s: string) => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize);
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const summary = box("header summary");
    return {
      header: box("header").height, logo: box("header a[aria-label] > span").width, menu: Math.min(summary.width, summary.height),
      h1: px("h1"), h2: px("#how-it-works h2"), step: px("#how-it-works h3"), body: px("#how-it-works li p"),
      how: box("#how-it-works ol").bottom - box("#how-it-works").top, steps: document.querySelectorAll("#how-it-works ol > li").length,
      players: [...document.querySelectorAll("#how-it-works video")].filter((v) => v.getClientRects().length > 0).length,
      markers: document.querySelectorAll("#how-it-works ol > li > span[aria-hidden]:not([class*='absolute'])").length,
    };
  });
  expect(m.header).toBeLessThanOrEqual(72);
  expect(m.logo).toBeGreaterThanOrEqual(150); expect(m.logo).toBeLessThanOrEqual(180);
  expect(m.menu).toBeGreaterThanOrEqual(44); expect(m.menu).toBeLessThanOrEqual(48);
  expect(m.h1).toBeGreaterThanOrEqual(32); expect(m.h1).toBeLessThanOrEqual(34);
  expect(m.h2).toBeGreaterThanOrEqual(26); expect(m.h2).toBeLessThanOrEqual(30);
  expect(m.step).toBeGreaterThanOrEqual(18); expect(m.step).toBeLessThanOrEqual(20);
  expect(m.body).toBeGreaterThanOrEqual(15); expect(m.body).toBeLessThanOrEqual(16);
  // Heading and four connected steps fit in roughly one phone screen; the film follows as a compact poster
  // card that opens a lightbox — never an embedded native player on a phone — and the action closes the section.
  expect(m.how).toBeLessThanOrEqual(760);
  expect(m.steps).toBe(4);
  expect(m.markers).toBe(4); // one numbered marker per step — never a circle plus a separate number
  expect(m.players).toBe(0);
  const watch = page.locator("#how-it-works").getByRole("button", { name: /Watch how it works/ });
  await expect(watch).toBeVisible();
  const journeyCta = page.locator("#how-it-works").getByRole("link", { name: /^Start my case$/ });
  await expect(journeyCta).toBeVisible();
  // The lightbox traps focus, closes on Escape and hands focus back to the poster card.
  await watch.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open] video")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(watch).toBeFocused();
  // The menu control is reachable and labelled; the language switch lives inside the menu on a phone.
  const menu = page.locator("header summary");
  await expect(menu).toHaveAttribute("aria-label", /menu/i);
  await menu.click();
  await expect(page.getByRole("link", { name: /Switch language|العربية/ }).first()).toBeVisible();
  await expectNoOverflow(page);
});

// The desktop navigation only takes over once every label, the language switch and the primary action
// fit on one line; until then the compact menu stays in charge. No label ever wraps in either mode.
test("the header switches to desktop navigation only when it fits on one line", async ({ page }) => {
  const lines = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map(b => Math.round(b.top))).size; };
  for (const [locale, width, mode] of [["en", 1024, "compact"], ["en", 1080, "compact"], ["en", 1100, "desktop"], ["en", 1152, "desktop"], ["en", 1280, "desktop"], ["ar", 1080, "compact"], ["ar", 1100, "desktop"]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const m = await page.evaluate((countLines) => {
      const count = new Function("el", `return (${countLines})(el)`) as (el: Element) => number;
      const nav = document.querySelector("header nav") as HTMLElement | null;
      const desktop = !!nav?.offsetParent;
      const menu = document.querySelector("header summary") as HTMLElement;
      const cta = [...document.querySelectorAll("header a.btn-primary")].find(a => (a as HTMLElement).offsetParent);
      return { mode: desktop ? "desktop" : "compact", wrapped: desktop ? [...nav!.querySelectorAll("a")].filter(a => count(a) > 1).length : 0,
        ctaLines: desktop && cta ? count(cta) : 1, menu: Math.min(menu.getBoundingClientRect().width || 44, menu.getBoundingClientRect().height || 44),
        header: document.querySelector("header")!.getBoundingClientRect().height };
    }, lines.toString());
    expect(m.mode, `${locale} ${width}px`).toBe(mode);
    expect(m.wrapped, `${locale} ${width}px wrapped labels`).toBe(0);
    expect(m.ctaLines, `${locale} ${width}px CTA lines`).toBe(1);
    expect(m.menu).toBeGreaterThanOrEqual(44);
    expect(m.header).toBeLessThanOrEqual(74);
    await expectNoOverflow(page);
  }
});

test("the homepage offers Sign in as a quiet entry, distinct from Check case status and Start my case", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const header = page.locator("header");
  const signIn = header.getByRole("link", { name: /^Sign in$/ });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", /\/en\/portal\?signin=1$/);
  // Three distinct destinations for three distinct situations.
  await expect(header.getByRole("link", { name: /^Check case status$/ })).toHaveAttribute("href", /\/en\/track-case$/);
  await expect(header.getByRole("link", { name: /^Start my case$/ })).toHaveAttribute("href", /\/en\/send-my-case$/);
  // Sign in is not a second dominant CTA.
  expect(await signIn.evaluate((el) => el.className.includes("btn-primary"))).toBe(false);
  expect(await header.locator("a.btn-primary:visible").count()).toBe(1);
});

test("the mobile menu exposes Start my case, Sign in and Check case status with touch-sized targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en");
  await page.locator("header summary").first().click();
  const menu = page.locator("header details[open]");
  await expect(menu.getByRole("link", { name: /^Start my case$/ })).toBeVisible();
  const signIn = menu.getByRole("link", { name: /Sign in/ });
  await expect(signIn).toBeVisible();
  expect((await signIn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(menu.getByRole("link", { name: /^Check case status$/ })).toBeVisible();
});
