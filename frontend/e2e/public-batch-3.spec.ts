import { expect, test, type Page } from "@playwright/test";

/**
 * Finish plan Batch 3 — the public site tells one story: one four-stage journey everywhere (sub-steps only on How it
 * works), body systems vs care areas, the two cost stages, the coordinator, one route to the form per page, no travel
 * question before a proposal exists, and nothing hidden until scrolled. Each check fails on the pre-Batch-3 pages.
 */
const STAGES = {
  en: ["Understand your case", "Understand your options", "Prepare your care in Egypt", "Continue your care"],
  ar: ["افهم حالتك", "افهم خياراتك", "جهّز رعايتك في مصر", "واصل رعايتك"],
} as const;

for (const locale of ["en", "ar"] as const) {
  test(`the home journey is the four stages, with the coordinator who carries them (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const journey = page.locator("#how-it-works");
    await expect(journey.locator("ol > li h3")).toHaveText([...STAGES[locale]]);
    await expect(journey.getByText(locale === "en" ? "Your coordinator" : "منسّقك", { exact: true })).toBeVisible();
    await expect(journey.getByText(locale === "en" ? /Arabic and English.*WhatsApp/ : /العربية والإنجليزية.*واتساب/)).toBeVisible();
  });

  test(`How it works previews the same four stages and explains the two cost stages (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}/how-it-works`);
    await expect(page.locator(".page-hero-aside ol > li")).toHaveText([...STAGES[locale]]);
    const costs = page.getByRole("region", { name: locale === "en" ? "How the cost is settled" : "كيف تُحسم التكلفة" });
    await expect(costs.getByText(locale === "en" ? "Preliminary estimate" : "التقدير المبدئي", { exact: true })).toBeVisible();
    await expect(costs.getByText(locale === "en" ? "Final quote" : "العرض النهائي", { exact: true })).toBeVisible();
    // The "You" / "Next" labels are at the 13px floor, not 10.5px.
    const size = await page.locator("main dl dt").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(13);
  });
}

test("care areas: body systems and care areas are named apart, and nobody is told to choose", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("#home-areas-title")).toHaveText(/^\d+ care areas across 6 body systems$/);
  await page.goto("/en/care-areas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore care by body system");
  const router = page.locator('section[aria-labelledby="case-router-title"]');
  // No competing numbered model: the panel links to the one journey instead.
  await expect(router.locator("ol")).toHaveCount(0);
  await expect(router.getByText(/^0\d$/)).toHaveCount(0);
  await expect(router.getByRole("link", { name: "See the whole journey on How it works" })).toHaveAttribute("href", "/en/how-it-works");
});

test("a care-area page has one in-content route to the form", async ({ page }) => {
  await page.goto("/en/cardiology");
  await expect(page.locator('main a[href="/en/send-my-case"]')).toHaveCount(1);
});

test("Consultant pages never skip a heading level", async ({ page }) => {
  for (const path of ["/en/consultants", "/en/cardiology"]) {
    await page.goto(path);
    const levels = await page.locator("main").evaluate((main) =>
      Array.from(main.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => Number(h.tagName[1])));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `${path} heading ${i}`).toBeLessThanOrEqual(1);
  }
});

test("Close: a care-area page names treatments in plain words first, acronyms second", async ({ page }) => {
  await page.goto("/en/cardiology");
  await expect(page.getByText("Aortic valve replacement through a catheter (TAVI / TAVR)").first()).toBeVisible();
  await expect(page.getByText(/^TAVI \/ TAVR$/)).toHaveCount(0);
});

test("Close: the upload says where files go and what is accepted, before any error", async ({ page }) => {
  await page.goto("/en/send-my-case");
  await page.getByLabel("Given name(s)").fill("Playwright");
  await page.getByLabel(/^Family name \/ surname/).fill("Intake");
  await page.getByRole("combobox", { name: /country of residence/i }).fill("Kenya");
  await page.getByRole("listbox").getByRole("option", { name: /Kenya/ }).click();
  await page.getByLabel("Phone number").fill("700000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/private storage.*checked for viruses.*PDF, JPG or PNG, up to 15 MB each/)).toBeVisible();
});

async function toReviewStep(page: Page) {
  await page.getByLabel("Given name(s)").fill("Playwright");
  await page.getByLabel(/^Family name \/ surname/).fill("Intake");
  await page.getByRole("combobox", { name: /country of residence/i }).fill("Kenya");
  await page.getByRole("listbox").getByRole("option", { name: /Kenya/ }).click();
  await page.getByLabel("Phone number").fill("700000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

test("the intake does not ask about a travel package before any proposal exists", async ({ page }) => {
  await page.goto("/en/send-my-case");
  await toReviewStep(page);
  await expect(page.getByText(/I consent to RehletShifaa/)).toBeVisible();
  await expect(page.getByText(/travel/i)).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(1); // consent only
});

test("nothing on the home page waits for a scroll to become visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en");
  // Without scrolling: every list item further down the page is already fully opaque.
  const hidden = await page.locator("main").evaluate((main) =>
    Array.from(main.querySelectorAll<HTMLElement>("li, h2")).filter((el) => el.getBoundingClientRect().top > window.innerHeight)
      .filter((el) => Number(getComputedStyle(el).opacity) < 1).map((el) => el.textContent?.trim().slice(0, 40)));
  expect(hidden).toEqual([]);
});

test("the hero's mist sits at the end edge in both directions", async ({ page }) => {
  await page.goto("/en/how-it-works");
  expect(await page.locator(".page-hero").evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("88%");
  await page.goto("/ar/how-it-works");
  expect(await page.locator(".page-hero").evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("12%");
});
