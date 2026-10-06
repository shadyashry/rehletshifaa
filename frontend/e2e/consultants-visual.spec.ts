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
      if (!el.closest("[aria-hidden=\"true\"]") && r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) offenders.push(`${el.tagName}.${el.className}`.slice(0, 80));
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
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: test.info().outputPath(`consultants-en-${shot.name}.png`), fullPage: true });
  });
}

for (const shot of SHOTS.filter((s) => ["390", "768", "1440"].includes(s.name))) {
  test(`consultants arabic ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto("/ar/consultants");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: test.info().outputPath(`consultants-ar-${shot.name}.png`), fullPage: true });
  });
}

test("panel filters by body system and search, and links to sourced profiles", async ({ page }) => {
  await page.goto("/en/consultants");
  const panel = page.locator("#consultant-panel");
  await expect(panel.locator("article")).toHaveCount(13);
  await expect(page.getByRole("figure")).toContainText("Clinical matching");
  await panel.getByRole("button", { name: /Bones & joints/ }).click();
  await expect(panel.locator("article")).toHaveCount(4);
  await page.getByLabel("Search by name, specialty or expertise").fill("robotic");
  await expect(panel.locator("article")).toHaveCount(1);
  await expect(panel.getByRole("heading", { name: "Dr Ahmed Khaled" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(panel.locator("article")).toHaveCount(13);
  await page.getByLabel("Search by name, specialty or expertise").fill("no-such-doctor");
  await expect(page.getByText("No Consultants match your search.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  const link = panel.getByRole("link").first();
  await page.keyboard.press("Tab");
  await link.focus();
  expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  await page.goto("/en/consultants/mostafa-baraka");
  await expect(page.getByRole("heading", { name: "Professional highlights" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Two oral research presentations/)).toBeVisible();
  await page.goto("/ar/consultants");
  await page.locator("#consultant-panel").getByRole("button", { name: /صحة المرأة/ }).click();
  await expect(page.locator("#consultant-panel article")).toHaveCount(2);
});

test("vascular consultant appears once with bilingual credentials and care-area navigation", async ({ page }) => {
  for (const locale of ["en", "ar"]) {
    await page.goto(`/${locale}/consultants`);
    await page.getByLabel(locale === "en" ? "Search by name, specialty or expertise" : "ابحث بالاسم أو التخصص أو الخبرة").fill(locale === "en" ? "Vascular Surgery" : "جراحة الأوعية");
    await expect(page.locator("#consultant-panel article")).toHaveCount(1);
    await page.goto(`/${locale}/consultants/hamdy-abdelazeem`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(locale === "en" ? "Hamdy AbdelAzeem" : "حمدي عبد العظيم");
    await expect(page.getByRole("heading", { name: locale === "en" ? "Professional highlights" : "أبرز الإنجازات", exact: true })).toBeVisible();
    await page.getByRole("link", { name: locale === "en" ? "Explore this care area" : "استكشف مجال الرعاية", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/vascular-endovascular-surgery$`));
    await expect(page.getByRole("heading", { name: locale === "en" ? "Dr Hamdy AbdelAzeem AboElNeel AbdelHameed" : "د. حمدي عبد العظيم أبو النيل عبد الحميد", exact: true })).toBeVisible();
  }
});

test("every supplied doctor has a bilingual profile and a care-area link", async ({ page }) => {
  test.setTimeout(120000);
  const slugs = ["ahmed-magdy-mahmoud", "amr-abdelazeem", "ahmed-khaled", "mostafa-farid", "mustafa-mohammed-abbas", "mohamed-hamdy-zaid", "mohammed-ali", "mostafa-baraka", "mahmoud-ghaleb"];
  for (const locale of ["en", "ar"]) {
    for (const slug of slugs) {
      await page.goto(`/${locale}/consultants/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("heading", { name: locale === "en" ? "Professional highlights" : "أبرز الإنجازات", exact: true })).toBeVisible();
      const area = page.getByRole("link", { name: locale === "en" ? "Explore this care area" : "استكشف مجال الرعاية", exact: true });
      await expect(area).toHaveAttribute("href", new RegExp(`^/${locale}/`));
      await expect(page.getByText(locale === "en" ? /Prepared from the supplied CV/ : /أُعد الملف من السيرة الذاتية المقدمة/)).toBeVisible();
    }
  }
});

test("doctor achievement profile reflows in English and Arabic", async ({ page }) => {
  for (const [locale, width] of [["en", 1440], ["ar", 390]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${locale}/consultants/mostafa-baraka`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noOverflow(page);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: test.info().outputPath(`profile-${locale}-${width}.png`), fullPage: true });
  }
});

test("every profile fits a phone, carries no case buttons of its own and never claims an unverified status", async ({ page }) => {
  test.setTimeout(180000);
  const slugs = ["ahmed-alashry", "hanan-elshoura", "hossam-kibba", "ahmed-magdy-mahmoud", "amr-abdelazeem", "ahmed-khaled", "mostafa-farid", "mustafa-mohammed-abbas", "mohamed-hamdy-zaid", "mohammed-ali", "mostafa-baraka", "mahmoud-ghaleb", "hamdy-abdelazeem"];
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ["en", "ar"]) {
    for (const slug of slugs) {
      await page.goto(`/${locale}/consultants/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${locale}/${slug}`).toBeLessThanOrEqual(1);
      await expect(page.locator("main .btn-primary, main .btn-secondary")).toHaveCount(0);
      await expect(page.locator(`main a[href="/${locale}/send-my-case"]`)).toHaveCount(1);
      if (locale === "en") {
        await expect(page.getByText("Verified profile")).toHaveCount(0);
        await expect(page.getByText("CV-sourced profile")).toBeVisible();
      }
    }
  }
});
