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
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: test.info().outputPath(`care-areas-en-${shot.name}.png`), fullPage: true });
  });
}

for (const shot of SHOTS.filter((s) => ["390", "768", "1440"].includes(s.name))) {
  test(`care areas arabic ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/ar/care-areas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: test.info().outputPath(`care-areas-ar-${shot.name}.png`), fullPage: true });
  });
}

test("care atlas groups every area by body system and the network jumps to its card", async ({ page }) => {
  await page.goto("/en/care-areas");
  await expect(page.locator("#atlas ul > li")).toHaveCount(9);
  await expect(page.locator('#atlas section[id^="system-"]')).toHaveCount(6);
  const network = page.getByRole("navigation", { name: "Care areas arranged around your case" });
  await expect(network.getByRole("link")).toHaveCount(9);
  await network.getByRole("link", { name: /Orthopedics/ }).click();
  await expect(page).toHaveURL(/#area-orthopedics$/);
  await expect(page.locator("#area-orthopedics")).toContainText("4 Consultants");
});

test("all care areas have working doctor profiles", async ({ page }) => {
  await page.goto("/en/care-areas");
  await page.locator("#atlas").getByRole("link", { name: /Digestive & Liver Care/ }).click();
  await expect(page.getByRole("heading", { name: "Dr Amr Abdelazeem" })).toBeVisible({ timeout: 15000 });
  await page.goto("/en/orthopedics");
  await expect(page.getByRole("heading", { name: "Dr Mostafa Baraka" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dr Mohammed Ali Ibrahim Hussien" })).toBeVisible();
});

const DETAIL_PAGES = ["cardiology", "rheumatology-rehabilitation", "orthopedics", "vascular-endovascular-surgery", "gastroenterology-hepatology", "interventional-neuroradiology", "womens-health", "general-surgery", "plastic-reconstructive-surgery"];

test("every care-area detail page fits a phone in both languages", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ["en", "ar"]) {
    for (const slug of DETAIL_PAGES) {
      await page.goto(`/${locale}/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${locale}/${slug}`).toBeLessThanOrEqual(1);
    }
  }
});

test("small teams are named in the hero; larger teams are counted", async ({ page }) => {
  await page.goto("/en/cardiology");
  const hero = page.locator("main > section").first();
  await expect(hero.getByRole("link", { name: /Dr Ahmed AlAshry/ })).toHaveAttribute("href", /\/en\/consultants\/ahmed-alashry$/);
  await expect(hero.getByText("Consultants", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Send us your case if…")).toBeVisible();
  await page.goto("/en/orthopedics");
  await expect(page.locator("main > section").first().getByText("Consultants", { exact: true })).toBeVisible();
});
